// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Matches the Solidity verifier that Barretenberg (`bb write_solidity_verifier`) generates for Noir circuits.
interface IVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}
