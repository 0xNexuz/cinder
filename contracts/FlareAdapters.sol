// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFtsoV2 {
    function getFeedById(bytes21 feedId)
        external
        payable
        returns (uint256 value, int8 decimals, uint64 timestamp);
}

interface IPayment {
    struct RequestBody {
        bytes32 transactionId;
        uint256 inUtxo;
        uint256 utxo;
    }

    struct ResponseBody {
        uint64 blockNumber;
        uint64 blockTimestamp;
        bytes32 sourceAddressHash;
        bytes32 sourceAddressesRoot;
        bytes32 receivingAddressHash;
        bytes32 intendedReceivingAddressHash;
        int256 spentAmount;
        int256 intendedSpentAmount;
        int256 receivedAmount;
        int256 intendedReceivedAmount;
        bytes32 standardPaymentReference;
        bool oneToOne;
        uint8 status;
    }

    struct Response {
        bytes32 attestationType;
        bytes32 sourceId;
        uint64 votingRound;
        uint64 lowestUsedTimestamp;
        RequestBody requestBody;
        ResponseBody responseBody;
    }

    struct Proof {
        bytes32[] merkleProof;
        Response data;
    }
}

interface IFdcVerification {
    function verifyPayment(IPayment.Proof calldata proof) external view returns (bool proved);
}

contract FtsoXrpUsdAdapter {
    bytes21 public constant XRP_USD_FEED_ID =
        bytes21(0x015852502f55534400000000000000000000000000);

    IFtsoV2 public immutable ftso;
    uint64 public immutable maxAge;

    error InvalidDecimals();
    error StalePrice();

    constructor(address ftso_, uint64 maxAge_) {
        ftso = IFtsoV2(ftso_);
        maxAge = maxAge_;
    }

    function latestXrpUsd() external returns (uint256 priceE6, uint64 updatedAt) {
        (uint256 value, int8 decimals, uint64 timestamp) = ftso.getFeedById(XRP_USD_FEED_ID);
        if (timestamp + maxAge < block.timestamp) revert StalePrice();

        if (decimals >= 0) {
            uint8 places = uint8(decimals);
            if (places <= 6) {
                priceE6 = value * (10 ** (6 - places));
            } else {
                if (places > 30) revert InvalidDecimals();
                priceE6 = value / (10 ** (places - 6));
            }
        } else {
            revert InvalidDecimals();
        }
        updatedAt = timestamp;
    }
}

contract FdcXrplPaymentAdapter {
    bytes32 public constant PAYMENT_ATTESTATION_TYPE = bytes32("Payment");
    bytes32 public constant TEST_XRP_SOURCE = bytes32("testXRP");

    IFdcVerification public immutable fdcVerification;

    error InvalidFdcProof();
    error WrongAttestationType();
    error WrongSource();
    error FailedPayment();
    error WrongReference();
    error WrongDestination();
    error InsufficientPayment();

    constructor(address fdcVerification_) {
        fdcVerification = IFdcVerification(fdcVerification_);
    }

    function verifyXrplPayment(
        bytes calldata encodedProof,
        bytes32 paymentReference,
        bytes32 destinationHash,
        uint256 amountDrops
    ) external view returns (bytes32 txHash) {
        IPayment.Proof memory proof = abi.decode(encodedProof, (IPayment.Proof));
        if (!fdcVerification.verifyPayment(proof)) revert InvalidFdcProof();
        if (proof.data.attestationType != PAYMENT_ATTESTATION_TYPE) revert WrongAttestationType();
        if (proof.data.sourceId != TEST_XRP_SOURCE) revert WrongSource();
        if (proof.data.responseBody.status != 0) revert FailedPayment();
        if (proof.data.responseBody.standardPaymentReference != paymentReference) revert WrongReference();
        if (proof.data.responseBody.receivingAddressHash != destinationHash) revert WrongDestination();
        if (proof.data.responseBody.receivedAmount < 0 || uint256(proof.data.responseBody.receivedAmount) < amountDrops) {
            revert InsufficientPayment();
        }
        txHash = proof.data.requestBody.transactionId;
    }
}
