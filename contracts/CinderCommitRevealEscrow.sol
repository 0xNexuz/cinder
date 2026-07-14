// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICinderToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface ICinderPriceOracle {
    function latestXrpUsd() external returns (uint256 priceE6, uint64 updatedAt);
}

interface ICinderFdc {
    function verifyXrplPayment(bytes calldata proof, bytes32 paymentReference, bytes32 destinationHash, uint256 amountDrops) external returns (bytes32 txHash);
}

/// @notice Trustless fallback matcher: prices remain hidden during bidding and are
/// revealed only after the commitment window closes. No operator signer is needed.
contract CinderCommitRevealEscrow {
    enum Status { Open, Matched, Settled, Refunded }

    struct Rfq {
        address buyer;
        address token;
        uint256 escrowAmount;
        uint256 xrpAmountDrops;
        uint256 maxPriceE6;
        uint64 biddingEnds;
        uint64 revealEnds;
        uint64 expiresAt;
        bytes32 destinationHash;
        bytes32 termsCommitment;
        bytes32 paymentReference;
        address winner;
        uint256 clearingPriceE6;
        Status status;
    }

    ICinderPriceOracle public immutable oracle;
    ICinderFdc public immutable fdc;
    uint256 public immutable maxDeviationBps;
    uint256 public nextRfqId = 1;
    uint256 private unlocked = 1;

    mapping(uint256 => Rfq) public rfqs;
    mapping(uint256 => mapping(address => bytes32)) public quoteCommitments;
    mapping(uint256 => mapping(address => bool)) public quoteRevealed;
    mapping(bytes32 => bool) public consumedFdcTransactions;

    event RfqCreated(uint256 indexed rfqId, address indexed buyer, uint256 escrowAmount, uint256 xrpAmountDrops, uint64 biddingEnds, uint64 revealEnds);
    event QuoteCommitted(uint256 indexed rfqId, address indexed maker, bytes32 commitment);
    event QuoteRevealed(uint256 indexed rfqId, address indexed maker, uint256 priceE6);
    event MatchFinalized(uint256 indexed rfqId, address indexed winner, uint256 clearingPriceE6, bytes32 paymentReference);
    event Settled(uint256 indexed rfqId, bytes32 indexed xrplTxHash);
    event Refunded(uint256 indexed rfqId);

    error InvalidState();
    error InvalidWindow();
    error InvalidReveal();
    error NoValidQuotes();
    error OraclePriceOutsideBand();
    error TransferFailed();
    error FdcReplay();
    error ReentrantCall();

    modifier nonReentrant() {
        if (unlocked != 1) revert ReentrantCall();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address oracle_, address fdc_, uint256 maxDeviationBps_) {
        oracle = ICinderPriceOracle(oracle_);
        fdc = ICinderFdc(fdc_);
        maxDeviationBps = maxDeviationBps_;
    }

    function createRfq(
        address token,
        uint256 escrowAmount,
        uint256 xrpAmountDrops,
        uint256 maxPriceE6,
        uint64 biddingEnds,
        uint64 revealEnds,
        uint64 expiresAt,
        bytes32 destinationHash,
        bytes32 termsCommitment
    ) external nonReentrant returns (uint256 rfqId) {
        if (!(block.timestamp < biddingEnds && biddingEnds < revealEnds && revealEnds < expiresAt)) revert InvalidWindow();
        rfqId = nextRfqId++;
        rfqs[rfqId] = Rfq(msg.sender, token, escrowAmount, xrpAmountDrops, maxPriceE6, biddingEnds, revealEnds, expiresAt, destinationHash, termsCommitment, bytes32(0), address(0), 0, Status.Open);
        if (!ICinderToken(token).transferFrom(msg.sender, address(this), escrowAmount)) revert TransferFailed();
        emit RfqCreated(rfqId, msg.sender, escrowAmount, xrpAmountDrops, biddingEnds, revealEnds);
    }

    function submitQuoteCommitment(uint256 rfqId, bytes32 commitment) external {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open || block.timestamp >= rfq.biddingEnds) revert InvalidState();
        quoteCommitments[rfqId][msg.sender] = commitment;
        emit QuoteCommitted(rfqId, msg.sender, commitment);
    }

    function revealQuote(uint256 rfqId, uint256 priceE6, bytes32 salt) external {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open || block.timestamp < rfq.biddingEnds || block.timestamp >= rfq.revealEnds) revert InvalidState();
        if (quoteRevealed[rfqId][msg.sender]) revert InvalidReveal();
        bytes32 expected = keccak256(abi.encode(rfqId, msg.sender, priceE6, salt));
        if (quoteCommitments[rfqId][msg.sender] != expected || priceE6 == 0 || priceE6 > rfq.maxPriceE6) revert InvalidReveal();
        quoteRevealed[rfqId][msg.sender] = true;
        if (rfq.winner == address(0) || priceE6 < rfq.clearingPriceE6) {
            rfq.winner = msg.sender;
            rfq.clearingPriceE6 = priceE6;
        }
        emit QuoteRevealed(rfqId, msg.sender, priceE6);
    }

    function finalizeMatch(uint256 rfqId) external {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open || block.timestamp < rfq.revealEnds || block.timestamp >= rfq.expiresAt) revert InvalidState();
        if (rfq.winner == address(0)) revert NoValidQuotes();
        (uint256 ftsoPriceE6,) = oracle.latestXrpUsd();
        uint256 distance = ftsoPriceE6 > rfq.clearingPriceE6 ? ftsoPriceE6 - rfq.clearingPriceE6 : rfq.clearingPriceE6 - ftsoPriceE6;
        if (distance * 10_000 > ftsoPriceE6 * maxDeviationBps) revert OraclePriceOutsideBand();
        rfq.paymentReference = keccak256(abi.encodePacked("CINDER_RFQ", block.chainid, address(this), rfqId, rfq.winner));
        rfq.status = Status.Matched;
        emit MatchFinalized(rfqId, rfq.winner, rfq.clearingPriceE6, rfq.paymentReference);
    }

    function settleWithFdc(uint256 rfqId, bytes calldata proof) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Matched) revert InvalidState();
        bytes32 txHash = fdc.verifyXrplPayment(proof, rfq.paymentReference, rfq.destinationHash, rfq.xrpAmountDrops);
        if (consumedFdcTransactions[txHash]) revert FdcReplay();
        consumedFdcTransactions[txHash] = true;
        rfq.status = Status.Settled;
        if (!ICinderToken(rfq.token).transfer(rfq.winner, rfq.escrowAmount)) revert TransferFailed();
        emit Settled(rfqId, txHash);
    }

    function refundExpired(uint256 rfqId) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open && rfq.status != Status.Matched) revert InvalidState();
        if (block.timestamp < rfq.expiresAt) revert InvalidWindow();
        rfq.status = Status.Refunded;
        if (!ICinderToken(rfq.token).transfer(rfq.buyer, rfq.escrowAmount)) revert TransferFailed();
        emit Refunded(rfqId);
    }
}
