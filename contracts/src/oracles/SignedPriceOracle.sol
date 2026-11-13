// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPrimarOracle} from "../interfaces/IPrimarOracle.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title SignedPriceOracle
/// @notice Fallback for chains without Pyth: prices signed by an allowlisted signer (the Primar keeper). Weaker trust
///         than Pyth; the first price stored for a (feed, timestamp) is final.
contract SignedPriceOracle is IPrimarOracle, Ownable2Step {
    mapping(address => bool) public signers;
    mapping(bytes32 => mapping(uint64 => int256)) public stored;

    error BadSigner();
    event SignerSet(address signer, bool allowed);

    constructor(address owner_, address signer) Ownable(owner_) {
        signers[signer] = true;
        emit SignerSet(signer, true);
    }

    function setSigner(address signer, bool allowed) external onlyOwner {
        signers[signer] = allowed;
        emit SignerSet(signer, allowed);
    }

    function fee(bytes calldata) external pure returns (uint256) {
        return 0;
    }

    function priceAt(bytes32 feedId, uint64 timestamp, bytes calldata data) external payable returns (int256) {
        int256 s = stored[feedId][timestamp];
        if (s != 0) return s;
        (int256 price, bytes memory sig) = abi.decode(data, (int256, bytes));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(block.chainid, address(this), feedId, timestamp, price))
        );
        if (!signers[ECDSA.recover(digest, sig)] || price <= 0) revert BadSigner();
        stored[feedId][timestamp] = price;
        return price;
    }
}
