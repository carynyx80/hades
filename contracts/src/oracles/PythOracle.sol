// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHazeOracle} from "../interfaces/IHazeOracle.sol";

/// @dev Minimal subset of Pyth's IPyth.
interface IPyth {
    struct Price { int64 price; uint64 conf; int32 expo; uint256 publishTime; }
    struct PriceFeed { bytes32 id; Price price; Price emaPrice; }
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);
    function parsePriceFeedUpdatesUnique(bytes[] calldata updateData, bytes32[] calldata priceIds, uint64 minPublishTime, uint64 maxPublishTime)
        external payable returns (PriceFeed[] memory);
}

/// @title PythOracle
/// @notice Reads the first Pyth price published at or just after `timestamp` (within `maxDelay`), from an update the
///         caller fetched from Hermes. `parsePriceFeedUpdatesUnique` guarantees no earlier update exists in the window,
///         so the price for a given timestamp is unique and cannot be cherry-picked.
contract PythOracle is IHazeOracle {
    IPyth public immutable pyth;
    uint64 public immutable maxDelay;

    error StalePrice();
    error BadExpo();

    constructor(IPyth pyth_, uint64 maxDelay_) {
        pyth = pyth_;
        maxDelay = maxDelay_;
    }

    function fee(bytes calldata data) external view returns (uint256) {
        return pyth.getUpdateFee(abi.decode(data, (bytes[])));
    }

    function priceAt(bytes32 feedId, uint64 timestamp, bytes calldata data) external payable returns (int256) {
        bytes[] memory updates = abi.decode(data, (bytes[]));
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = feedId;
        IPyth.PriceFeed[] memory feeds = pyth.parsePriceFeedUpdatesUnique{value: msg.value}(updates, ids, timestamp, timestamp + maxDelay);
        IPyth.Price memory p = feeds[0].price;
        if (p.publishTime < timestamp || p.publishTime > timestamp + maxDelay) revert StalePrice();
        return _to8(p.price, p.expo);
    }

    function _to8(int64 price, int32 expo) internal pure returns (int256) {
        int256 v = price;
        if (expo == -8) return v;
        if (expo < -8) {
            if (expo < -38) revert BadExpo();
            return v / int256(10 ** uint32(-8 - expo));
        }
        if (expo > 10) revert BadExpo();
        return v * int256(10 ** uint32(expo + 8));
    }
}
