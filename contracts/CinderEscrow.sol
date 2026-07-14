// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPriceOracleAdapter {
    function latestXrpUsd() external returns (uint256 priceE6, uint64 updatedAt);
}

interface IFdcSettlementAdapter {
    function verifyXrplPayment(
        bytes calldata proof,
        bytes32 paymentReference,
        bytes32 destinationHash,
        uint256 amountDrops
    ) external returns (bytes32 txHash);
}

library CinderECDSA {
    function recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    error InvalidSignature();
}

contract CinderEscrow {
    using CinderECDSA for bytes32;

    enum Status {
        Open,
        Matched,
        Settled,
        Refunded
    }

    struct Rfq {
        address buyer;
        address token;
        uint256 escrowAmount;
        uint256 xrpAmountDrops;
        uint256 maxPriceE6;
        uint64 expiresAt;
        bytes32 destinationHash;
        bytes32 termsCommitment;
        bytes32 paymentReference;
        address winner;
        uint256 clearingPriceE6;
        Status status;
    }

    IPriceOracleAdapter public immutable oracle;
    IFdcSettlementAdapter public immutable fdc;
    address public teeSigner;
    uint256 public maxDeviationBps = 125;
    uint256 public nextRfqId = 1;

    mapping(uint256 => Rfq) public rfqs;
    mapping(uint256 => mapping(address => bytes32)) public quoteCommitments;
    mapping(bytes32 => bool) public consumedFdcTransactions;

    event RfqCreated(uint256 indexed rfqId, address indexed buyer, uint256 escrowAmount, uint256 xrpAmountDrops);
    event QuoteCommitted(uint256 indexed rfqId, address indexed maker, bytes32 commitment);
    event MatchFinalized(uint256 indexed rfqId, address indexed winner, uint256 clearingPriceE6, bytes32 paymentReference);
    event Settled(uint256 indexed rfqId, bytes32 indexed xrplTxHash);
    event Refunded(uint256 indexed rfqId);

    error InvalidState();
    error Expired();
    error NotExpired();
    error OraclePriceOutsideBand();
    error BadSignature();
    error TransferFailed();
    error FdcReplay();
    error ReentrantCall();

    uint256 private unlocked = 1;

    modifier nonReentrant() {
        if (unlocked != 1) revert ReentrantCall();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address oracle_, address fdc_, address teeSigner_) {
        oracle = IPriceOracleAdapter(oracle_);
        fdc = IFdcSettlementAdapter(fdc_);
        teeSigner = teeSigner_;
    }

    function createRfq(
        address token,
        uint256 escrowAmount,
        uint256 xrpAmountDrops,
        uint256 maxPriceE6,
        uint64 expiresAt,
        bytes32 destinationHash,
        bytes32 termsCommitment
    ) external nonReentrant returns (uint256 rfqId) {
        if (expiresAt <= block.timestamp) revert Expired();

        rfqId = nextRfqId++;
        rfqs[rfqId] = Rfq({
            buyer: msg.sender,
            token: token,
            escrowAmount: escrowAmount,
            xrpAmountDrops: xrpAmountDrops,
            maxPriceE6: maxPriceE6,
            expiresAt: expiresAt,
            destinationHash: destinationHash,
            termsCommitment: termsCommitment,
            paymentReference: bytes32(0),
            winner: address(0),
            clearingPriceE6: 0,
            status: Status.Open
        });

        if (!IERC20(token).transferFrom(msg.sender, address(this), escrowAmount)) revert TransferFailed();
        emit RfqCreated(rfqId, msg.sender, escrowAmount, xrpAmountDrops);
    }

    function submitQuoteCommitment(uint256 rfqId, bytes32 commitment) external {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open) revert InvalidState();
        if (block.timestamp >= rfq.expiresAt) revert Expired();

        quoteCommitments[rfqId][msg.sender] = commitment;
        emit QuoteCommitted(rfqId, msg.sender, commitment);
    }

    function finalizeMatch(
        uint256 rfqId,
        address winner,
        uint256 clearingPriceE6,
        bytes32 paymentReference,
        bytes calldata teeSignature
    ) external {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open) revert InvalidState();
        if (block.timestamp >= rfq.expiresAt) revert Expired();

        (uint256 ftsoPriceE6,) = oracle.latestXrpUsd();
        uint256 distance = ftsoPriceE6 > clearingPriceE6 ? ftsoPriceE6 - clearingPriceE6 : clearingPriceE6 - ftsoPriceE6;
        if (distance * 10_000 > ftsoPriceE6 * maxDeviationBps) revert OraclePriceOutsideBand();
        if (clearingPriceE6 > rfq.maxPriceE6) revert OraclePriceOutsideBand();

        bytes32 digest = keccak256(
            abi.encodePacked(address(this), block.chainid, rfqId, winner, clearingPriceE6, paymentReference)
        );
        if (digest.recover(teeSignature) != teeSigner) revert BadSignature();

        rfq.winner = winner;
        rfq.clearingPriceE6 = clearingPriceE6;
        rfq.paymentReference = paymentReference;
        rfq.status = Status.Matched;

        emit MatchFinalized(rfqId, winner, clearingPriceE6, paymentReference);
    }

    function settleWithFdc(uint256 rfqId, bytes calldata proof) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Matched) revert InvalidState();

        bytes32 txHash = fdc.verifyXrplPayment(proof, rfq.paymentReference, rfq.destinationHash, rfq.xrpAmountDrops);
        if (consumedFdcTransactions[txHash]) revert FdcReplay();
        consumedFdcTransactions[txHash] = true;

        rfq.status = Status.Settled;
        if (!IERC20(rfq.token).transfer(rfq.winner, rfq.escrowAmount)) revert TransferFailed();
        emit Settled(rfqId, txHash);
    }

    function refundExpired(uint256 rfqId) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open && rfq.status != Status.Matched) revert InvalidState();
        if (block.timestamp < rfq.expiresAt) revert NotExpired();

        rfq.status = Status.Refunded;
        if (!IERC20(rfq.token).transfer(rfq.buyer, rfq.escrowAmount)) revert TransferFailed();
        emit Refunded(rfqId);
    }
}
