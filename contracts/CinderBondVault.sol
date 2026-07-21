// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICinderBondToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Isolates FXRP performance bonds from RFQ escrow accounting.
contract CinderBondVault {
    ICinderBondToken public immutable bondToken;
    address public immutable owner;
    address public controller;

    mapping(uint256 => mapping(address => uint256)) public bondOf;

    event ControllerSet(address indexed controller);
    event BondLocked(uint256 indexed rfqId, address indexed maker, uint256 amount);
    event BondReleased(uint256 indexed rfqId, address indexed maker, uint256 amount);
    event BondSlashed(uint256 indexed rfqId, address indexed maker, address indexed beneficiary, uint256 amount);

    error Unauthorized();
    error ControllerAlreadySet();
    error InvalidBond();
    error TransferFailed();

    constructor(address bondToken_) {
        bondToken = ICinderBondToken(bondToken_);
        owner = msg.sender;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    function setController(address controller_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (controller != address(0) || controller_ == address(0)) revert ControllerAlreadySet();
        controller = controller_;
        emit ControllerSet(controller_);
    }

    function lockBond(uint256 rfqId, address maker, uint256 amount) external onlyController {
        if (amount == 0 || bondOf[rfqId][maker] != 0) revert InvalidBond();
        bondOf[rfqId][maker] = amount;
        if (!bondToken.transferFrom(maker, address(this), amount)) revert TransferFailed();
        emit BondLocked(rfqId, maker, amount);
    }

    function releaseBond(uint256 rfqId, address maker) external onlyController returns (uint256 amount) {
        amount = bondOf[rfqId][maker];
        if (amount == 0) revert InvalidBond();
        bondOf[rfqId][maker] = 0;
        if (!bondToken.transfer(maker, amount)) revert TransferFailed();
        emit BondReleased(rfqId, maker, amount);
    }

    function slashBond(uint256 rfqId, address maker, address beneficiary) external onlyController returns (uint256 amount) {
        amount = bondOf[rfqId][maker];
        if (amount == 0 || beneficiary == address(0)) revert InvalidBond();
        bondOf[rfqId][maker] = 0;
        if (!bondToken.transfer(beneficiary, amount)) revert TransferFailed();
        emit BondSlashed(rfqId, maker, beneficiary, amount);
    }
}
