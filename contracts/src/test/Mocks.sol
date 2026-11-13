// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHazeOracle} from "../interfaces/IHazeOracle.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev TEST ONLY. Accepts any proof whose first byte is 0x01.
contract MockVerifier is IVerifier {
    function verify(bytes calldata proof, bytes32[] calldata) external pure returns (bool) {
        return proof.length > 0 && proof[0] == 0x01;
    }
}

/// @dev TEST ONLY. Prices set directly.
contract MockOracle is IHazeOracle {
    mapping(bytes32 => mapping(uint64 => int256)) public prices;
    function set(bytes32 feed, uint64 t, int256 p) external { prices[feed][t] = p; }
    function fee(bytes calldata) external pure returns (uint256) { return 0; }
    function priceAt(bytes32 feed, uint64 t, bytes calldata) external payable returns (int256 p) {
        p = prices[feed][t];
        require(p > 0, "no price");
    }
}

/// @dev Testnet faucet stablecoin (no value).
contract TestUSD is ERC20 {
    constructor() ERC20("Haze Test USD", "tUSD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function faucet() external { _mint(msg.sender, 1_000e6); }
    function mint(address to, uint256 a) external { _mint(to, a); }
}
