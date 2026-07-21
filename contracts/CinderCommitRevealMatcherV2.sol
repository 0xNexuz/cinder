// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICinderBondController {
    function lockMakerBond(uint256 rfqId, address maker) external;
}

/// @notice Replaceable matcher module. The escrow can later point the same interface at FCC.
contract CinderCommitRevealMatcherV2 {
    struct Auction {
        uint256 maxPriceE6;
        uint64 biddingEnds;
        uint64 revealEnds;
        address winner;
        uint256 clearingPriceE6;
        bool finalized;
    }

    address public immutable owner;
    address public controller;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;

    event ControllerSet(address indexed controller);
    event AuctionOpened(uint256 indexed rfqId, uint64 biddingEnds, uint64 revealEnds, uint256 maxPriceE6);
    event QuoteCommitted(uint256 indexed rfqId, address indexed maker, bytes32 commitment);
    event QuoteRevealed(uint256 indexed rfqId, address indexed maker, uint256 priceE6);
    event WinnerFinalized(uint256 indexed rfqId, address indexed winner, uint256 clearingPriceE6);

    error Unauthorized();
    error InvalidState();
    error InvalidWindow();
    error InvalidReveal();
    error NoValidQuotes();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    function setController(address controller_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (controller != address(0) || controller_ == address(0)) revert InvalidState();
        controller = controller_;
        emit ControllerSet(controller_);
    }

    function openAuction(
        uint256 rfqId,
        uint256 maxPriceE6,
        uint64 biddingEnds,
        uint64 revealEnds
    ) external onlyController {
        if (auctions[rfqId].biddingEnds != 0) revert InvalidState();
        if (!(block.timestamp < biddingEnds && biddingEnds < revealEnds) || maxPriceE6 == 0) revert InvalidWindow();
        auctions[rfqId] = Auction(maxPriceE6, biddingEnds, revealEnds, address(0), 0, false);
        emit AuctionOpened(rfqId, biddingEnds, revealEnds, maxPriceE6);
    }

    function submitCommitment(uint256 rfqId, bytes32 commitment) external {
        Auction storage auction = auctions[rfqId];
        if (auction.biddingEnds == 0 || block.timestamp >= auction.biddingEnds) revert InvalidState();
        if (commitment == bytes32(0) || commitments[rfqId][msg.sender] != bytes32(0)) revert InvalidReveal();
        ICinderBondController(controller).lockMakerBond(rfqId, msg.sender);
        commitments[rfqId][msg.sender] = commitment;
        emit QuoteCommitted(rfqId, msg.sender, commitment);
    }

    function revealQuote(uint256 rfqId, uint256 priceE6, bytes32 salt) external {
        Auction storage auction = auctions[rfqId];
        if (block.timestamp < auction.biddingEnds || block.timestamp >= auction.revealEnds || auction.finalized) revert InvalidState();
        if (revealed[rfqId][msg.sender]) revert InvalidReveal();
        bytes32 expected = quoteCommitment(rfqId, msg.sender, priceE6, salt);
        if (commitments[rfqId][msg.sender] != expected || priceE6 == 0 || priceE6 > auction.maxPriceE6) revert InvalidReveal();
        revealed[rfqId][msg.sender] = true;
        if (auction.winner == address(0) || priceE6 < auction.clearingPriceE6) {
            auction.winner = msg.sender;
            auction.clearingPriceE6 = priceE6;
        }
        emit QuoteRevealed(rfqId, msg.sender, priceE6);
    }

    function finalize(uint256 rfqId) external onlyController returns (address winner, uint256 clearingPriceE6) {
        Auction storage auction = auctions[rfqId];
        if (block.timestamp < auction.revealEnds || auction.finalized) revert InvalidState();
        if (auction.winner == address(0)) revert NoValidQuotes();
        auction.finalized = true;
        winner = auction.winner;
        clearingPriceE6 = auction.clearingPriceE6;
        emit WinnerFinalized(rfqId, winner, clearingPriceE6);
    }

    function quoteCommitment(uint256 rfqId, address maker, uint256 priceE6, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, rfqId, maker, priceE6, salt));
    }
}
