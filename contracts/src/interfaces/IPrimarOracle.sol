// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Returns an asset's price at an exact past timestamp, proven by `data` (e.g. a Pyth update).
interface IPrimarOracle {
    /// @return price the price scaled to 8 decimals
    function priceAt(bytes32 feedId, uint64 timestamp, bytes calldata data) external payable returns (int256 price);

    /// @notice Native fee needed to verify `data` (Pyth update fee); 0 for oracles without fees.
    function fee(bytes calldata data) external view returns (uint256);
}
