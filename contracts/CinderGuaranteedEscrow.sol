// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICinderGuaranteedToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface ICinderGuaranteedOracle {
    function latestXrpUsd() external returns (uint256 priceE6, uint64 updatedAt);
}

interface ICinderGuaranteedFdc {
    function verifyXrplPayment(bytes calldata proof, bytes32 paymentReference, bytes32 destinationHash, uint256 amountDrops) external returns (bytes32 proofId);
    function verifyXrplNonPayment(bytes calldata proof, bytes32 paymentReference, bytes32 destinationHash, uint256 amountDrops, uint64 matchedAt, uint64 deadline) external returns (bytes32 proofId);
}

interface ICinderGuaranteedBondVault {
    function lockBond(uint256 rfqId, address maker, uint256 amount) external;
    function releaseBond(uint256 rfqId, address maker) external returns (uint256 amount);
    function slashBond(uint256 rfqId, address maker, address beneficiary) external returns (uint256 amount);
}

interface ICinderGuaranteedMatcher {
    function openAuction(uint256 rfqId, uint256 maxPriceE6, uint64 biddingEnds, uint64 revealEnds) external;
    function finalize(uint256 rfqId) external returns (address winner, uint256 clearingPriceE6);
}

/// @notice USDT0 escrow with FXRP maker bonds and FDC payment/non-payment resolution.
contract CinderGuaranteedEscrow {
    enum Status { Open, Matched, Settled, Defaulted, Refunded }

    struct Rfq {
        address buyer;
        uint256 escrowAmount;
        uint256 xrpAmountDrops;
        uint256 maxPriceE6;
        uint256 bondAmount;
        uint64 biddingEnds;
        uint64 revealEnds;
        uint64 matchExpiresAt;
        uint64 matchedAt;
        uint64 deliveryDeadline;
        bytes32 destinationHash;
        bytes32 termsCommitment;
        bytes32 paymentReference;
        address winner;
        uint256 clearingPriceE6;
        Status status;
    }

    ICinderGuaranteedToken public immutable stableToken;
    ICinderGuaranteedBondVault public immutable bondVault;
    ICinderGuaranteedMatcher public immutable matcher;
    ICinderGuaranteedOracle public immutable oracle;
    ICinderGuaranteedFdc public immutable fdc;
    uint256 public immutable maxDeviationBps;
    uint64 public immutable deliveryWindow;
    uint256 public nextRfqId = 1;
    uint256 private unlocked = 1;

    mapping(uint256 => Rfq) public rfqs;
    mapping(bytes32 => bool) public consumedFdcProofs;

    event RfqCreated(uint256 indexed rfqId, address indexed buyer, uint256 escrowAmount, uint256 xrpAmountDrops, uint256 bondAmount);
    event MakerBondLocked(uint256 indexed rfqId, address indexed maker, uint256 amount);
    event MatchFinalized(uint256 indexed rfqId, address indexed winner, uint256 clearingPriceE6, bytes32 paymentReference, uint64 deliveryDeadline);
    event PaymentSettled(uint256 indexed rfqId, bytes32 indexed proofId);
    event NonPaymentResolved(uint256 indexed rfqId, bytes32 indexed proofId, uint256 slashedBond);
    event UnmatchedRefunded(uint256 indexed rfqId);
    event LosingBondClaimed(uint256 indexed rfqId, address indexed maker, uint256 amount);

    error Unauthorized();
    error InvalidState();
    error InvalidWindow();
    error InvalidAmount();
    error OraclePriceOutsideBand();
    error TransferFailed();
    error FdcReplay();
    error ReentrantCall();

    constructor(
        address stableToken_,
        address bondVault_,
        address matcher_,
        address oracle_,
        address fdc_,
        uint256 maxDeviationBps_,
        uint64 deliveryWindow_
    ) {
        if (stableToken_ == address(0) || bondVault_ == address(0) || matcher_ == address(0) || oracle_ == address(0) || fdc_ == address(0)) revert InvalidAmount();
        stableToken = ICinderGuaranteedToken(stableToken_);
        bondVault = ICinderGuaranteedBondVault(bondVault_);
        matcher = ICinderGuaranteedMatcher(matcher_);
        oracle = ICinderGuaranteedOracle(oracle_);
        fdc = ICinderGuaranteedFdc(fdc_);
        maxDeviationBps = maxDeviationBps_;
        deliveryWindow = deliveryWindow_;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert ReentrantCall();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    function createRfq(
        uint256 escrowAmount,
        uint256 xrpAmountDrops,
        uint256 maxPriceE6,
        uint256 bondAmount,
        uint64 biddingEnds,
        uint64 revealEnds,
        uint64 matchExpiresAt,
        bytes32 destinationHash,
        bytes32 termsCommitment
    ) external nonReentrant returns (uint256 rfqId) {
        if (escrowAmount == 0 || xrpAmountDrops == 0 || maxPriceE6 == 0 || bondAmount == 0 || destinationHash == bytes32(0)) revert InvalidAmount();
        if (!(block.timestamp < biddingEnds && biddingEnds < revealEnds && revealEnds < matchExpiresAt)) revert InvalidWindow();
        rfqId = nextRfqId++;
        rfqs[rfqId] = Rfq(msg.sender, escrowAmount, xrpAmountDrops, maxPriceE6, bondAmount, biddingEnds, revealEnds, matchExpiresAt, 0, 0, destinationHash, termsCommitment, bytes32(0), address(0), 0, Status.Open);
        if (!stableToken.transferFrom(msg.sender, address(this), escrowAmount)) revert TransferFailed();
        matcher.openAuction(rfqId, maxPriceE6, biddingEnds, revealEnds);
        emit RfqCreated(rfqId, msg.sender, escrowAmount, xrpAmountDrops, bondAmount);
    }

    function lockMakerBond(uint256 rfqId, address maker) external nonReentrant {
        if (msg.sender != address(matcher)) revert Unauthorized();
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open || block.timestamp >= rfq.biddingEnds) revert InvalidState();
        bondVault.lockBond(rfqId, maker, rfq.bondAmount);
        emit MakerBondLocked(rfqId, maker, rfq.bondAmount);
    }

    function finalizeMatch(uint256 rfqId) external {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open || block.timestamp < rfq.revealEnds || block.timestamp >= rfq.matchExpiresAt) revert InvalidState();
        (address winner, uint256 clearingPriceE6) = matcher.finalize(rfqId);
        (uint256 ftsoPriceE6,) = oracle.latestXrpUsd();
        uint256 distance = ftsoPriceE6 > clearingPriceE6 ? ftsoPriceE6 - clearingPriceE6 : clearingPriceE6 - ftsoPriceE6;
        if (distance * 10_000 > ftsoPriceE6 * maxDeviationBps) revert OraclePriceOutsideBand();
        uint64 matchedAt = uint64(block.timestamp);
        uint64 deadline = matchedAt + deliveryWindow;
        bytes32 paymentReference = keccak256(abi.encodePacked("CINDER_GUARANTEED", block.chainid, address(this), rfqId, winner));
        rfq.winner = winner;
        rfq.clearingPriceE6 = clearingPriceE6;
        rfq.paymentReference = paymentReference;
        rfq.matchedAt = matchedAt;
        rfq.deliveryDeadline = deadline;
        rfq.status = Status.Matched;
        emit MatchFinalized(rfqId, winner, clearingPriceE6, paymentReference, deadline);
    }

    function settleWithPaymentProof(uint256 rfqId, bytes calldata proof) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Matched) revert InvalidState();
        bytes32 proofId = fdc.verifyXrplPayment(proof, rfq.paymentReference, rfq.destinationHash, rfq.xrpAmountDrops);
        _consumeProof(proofId);
        rfq.status = Status.Settled;
        if (!stableToken.transfer(rfq.winner, rfq.escrowAmount)) revert TransferFailed();
        bondVault.releaseBond(rfqId, rfq.winner);
        emit PaymentSettled(rfqId, proofId);
    }

    function resolveNonPayment(uint256 rfqId, bytes calldata proof) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Matched || block.timestamp <= rfq.deliveryDeadline) revert InvalidState();
        bytes32 proofId = fdc.verifyXrplNonPayment(proof, rfq.paymentReference, rfq.destinationHash, rfq.xrpAmountDrops, rfq.matchedAt, rfq.deliveryDeadline);
        _consumeProof(proofId);
        rfq.status = Status.Defaulted;
        if (!stableToken.transfer(rfq.buyer, rfq.escrowAmount)) revert TransferFailed();
        uint256 slashed = bondVault.slashBond(rfqId, rfq.winner, rfq.buyer);
        emit NonPaymentResolved(rfqId, proofId, slashed);
    }

    function refundUnmatched(uint256 rfqId) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status != Status.Open || block.timestamp < rfq.matchExpiresAt) revert InvalidState();
        rfq.status = Status.Refunded;
        if (!stableToken.transfer(rfq.buyer, rfq.escrowAmount)) revert TransferFailed();
        emit UnmatchedRefunded(rfqId);
    }

    function claimLosingBond(uint256 rfqId) external nonReentrant {
        Rfq storage rfq = rfqs[rfqId];
        if (rfq.status == Status.Open || (rfq.status == Status.Matched && msg.sender == rfq.winner)) revert InvalidState();
        uint256 amount = bondVault.releaseBond(rfqId, msg.sender);
        emit LosingBondClaimed(rfqId, msg.sender, amount);
    }

    function _consumeProof(bytes32 proofId) private {
        if (proofId == bytes32(0) || consumedFdcProofs[proofId]) revert FdcReplay();
        consumedFdcProofs[proofId] = true;
    }
}
