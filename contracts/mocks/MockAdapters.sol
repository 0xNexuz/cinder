// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockPriceOracle {
    uint256 public priceE6 = 624100;
    uint64 public updatedAt = uint64(block.timestamp);

    function setPrice(uint256 priceE6_) external {
        priceE6 = priceE6_;
        updatedAt = uint64(block.timestamp);
    }

    function latestXrpUsd() external view returns (uint256, uint64) {
        return (priceE6, updatedAt);
    }
}

contract MockFdcSettlementAdapter {
    bytes32 public nextTxHash = keccak256("xrpl-testnet-payment");

    function setNextTxHash(bytes32 txHash) external {
        nextTxHash = txHash;
    }

    function verifyXrplPayment(
        bytes calldata,
        bytes32 paymentReference,
        bytes32,
        uint256 amountDrops
    ) external view returns (bytes32 txHash) {
        require(paymentReference != bytes32(0), "missing reference");
        require(amountDrops > 0, "missing amount");
        return nextTxHash;
    }
}

contract MockERC20 {
    string public name = "Mock USDT0";
    string public symbol = "USDT0";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        allowance[from][msg.sender] = allowed - amount;
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
