// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IPrimarOracle} from "./interfaces/IPrimarOracle.sol";

/// @title PrimarRounds
/// @notice Parimutuel Up/Down rounds on asset prices, aligned to Unix time. Round `id` of timeframe `tf` runs from
///         `id * tf` to `(id + 1) * tf`. Bets arrive only through the shielded pool, with the side sealed as
///         `keccak256(side, salt)`. After betting locks, sides are revealed (by the bettor or a keeper they gave the
///         salt to); unrevealed stakes are forfeited to the winners, so hiding a losing bet never pays.
/// @dev Holds no tokens: the pool holds funds and asks this contract how much each bet is owed.
contract PrimarRounds is AccessControl {
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");

    uint8 public constant SEALED = 0;
    uint8 public constant UP = 1;
    uint8 public constant DOWN = 2;

    uint8 public constant PENDING = 0;
    uint8 public constant OUTCOME_UP = 1;
    uint8 public constant OUTCOME_DOWN = 2;
    uint8 public constant REFUND = 3; // flat price or a one-sided round: revealed stakes back
    uint8 public constant VOID = 4; // oracle failed to settle in time: every stake back

    uint16 public constant FEE_BPS = 200; // 2% of the losing side
    uint64 public constant REVEAL_GRACE = 5 minutes; // reveals accepted until end + grace
    uint64 public constant VOID_AFTER = 1 days; // unsettled this long after end → void

    struct Round {
        int128 startPrice;
        int128 endPrice;
        uint128 up;
        uint128 down;
        uint128 sealedTotal; // all stakes, revealed or not
        uint8 outcome;
    }

    struct Bet {
        uint128 amount;
        uint64 id;
        uint32 tf;
        uint8 asset;
        uint8 side;
        bool claimed;
        bytes32 sealedSide;
        bytes32 claimHash;
    }

    IPrimarOracle public oracle;
    address public pool;
    mapping(uint8 => bytes32) public feeds; // asset id → oracle feed id
    mapping(uint32 => uint32) public cutoff; // timeframe seconds → betting closes this long before the end
    mapping(bytes32 => Round) public rounds;
    Bet[] public bets;
    uint256 public feesAccrued;

    error NotPool();
    error UnknownMarket();
    error BettingClosed();
    error BadAmount();
    error NotRevealable();
    error BadReveal();
    error TooEarly();
    error AlreadySettled();
    error NotSettled();
    error AlreadyClaimed();

    event MarketConfigured(uint8 indexed asset, bytes32 feed);
    event TimeframeConfigured(uint32 tf, uint32 cutoff);
    event PoolSet(address pool);
    event BetPlaced(uint256 indexed betId, bytes32 indexed roundKey, uint8 asset, uint32 tf, uint64 roundId, uint128 amount);
    event BetRevealed(uint256 indexed betId, uint8 side);
    event RoundSettled(bytes32 indexed roundKey, uint8 asset, uint32 tf, uint64 roundId, int256 startPrice, int256 endPrice, uint8 outcome);
    event BetClaimed(uint256 indexed betId, uint256 payout);

    constructor(address admin, IPrimarOracle oracle_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIG_ROLE, admin);
        oracle = oracle_;
        _setTf(300, 60);
        _setTf(600, 120);
        _setTf(900, 120);
        _setTf(3600, 300);
        _setTf(86400, 3600);
    }

    // ───────────────────────── config ─────────────────────────

    /// @notice One-time link to the pool (the only contract allowed to place and claim bets).
    function setPool(address pool_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(pool == address(0), "pool set");
        pool = pool_;
        emit PoolSet(pool_);
    }

    function setFeed(uint8 asset, bytes32 feed) external onlyRole(CONFIG_ROLE) {
        feeds[asset] = feed;
        emit MarketConfigured(asset, feed);
    }

    function setTimeframe(uint32 tf, uint32 cutoff_) external onlyRole(CONFIG_ROLE) {
        _setTf(tf, cutoff_);
    }

    function _setTf(uint32 tf, uint32 c) internal {
        require(tf == 0 || c < tf, "cutoff");
        cutoff[tf] = c;
        emit TimeframeConfigured(tf, c);
    }

    // ───────────────────────── views ─────────────────────────

    function roundKey(uint8 asset, uint32 tf, uint64 id) public pure returns (bytes32) {
        return keccak256(abi.encode(asset, tf, id));
    }

    function window(uint32 tf, uint64 id) public view returns (uint64 start, uint64 lockAt, uint64 end) {
        start = id * tf;
        end = start + tf;
        lockAt = end - cutoff[tf];
    }

    function betCount() external view returns (uint256) {
        return bets.length;
    }

    function sealSide(uint8 side, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(side, salt));
    }

    /// @notice What a bet is owed now (0 while pending, for losers, or once claimed).
    function payoutOf(uint256 betId) public view returns (uint256) {
        Bet storage b = bets[betId];
        if (b.claimed) return 0;
        Round storage r = rounds[roundKey(b.asset, b.tf, b.id)];
        uint8 o = r.outcome;
        if (o == PENDING) return 0;
        if (o == VOID) return b.amount;
        if (o == REFUND) return b.side == SEALED ? 0 : b.amount;
        if (b.side != o) return 0;
        (uint256 win, uint256 pot) = _pot(r);
        return b.amount + (pot * b.amount) / win;
    }

    /// @dev Winning-side total and what it shares after the fee: the losing side plus forfeited unrevealed stakes.
    function _pot(Round storage r) internal view returns (uint256 win, uint256 pot) {
        win = r.outcome == OUTCOME_UP ? r.up : r.down;
        uint256 lose = uint256(r.sealedTotal) - win;
        pot = lose - (lose * FEE_BPS) / 10_000;
    }

    // ───────────────────────── betting ─────────────────────────

    function placeBet(uint8 asset, uint32 tf, uint64 id, uint128 amount, bytes32 sealedSide, bytes32 claimHash)
        external
        returns (uint256 betId)
    {
        if (msg.sender != pool) revert NotPool();
        if (feeds[asset] == bytes32(0) || cutoff[tf] == 0) revert UnknownMarket();
        if (amount == 0) revert BadAmount();
        (uint64 start, uint64 lockAt,) = window(tf, id);
        if (block.timestamp < start || block.timestamp >= lockAt) revert BettingClosed();

        bytes32 key = roundKey(asset, tf, id);
        rounds[key].sealedTotal += amount;
        betId = bets.length;
        bets.push(Bet(amount, id, tf, asset, SEALED, false, sealedSide, claimHash));
        emit BetPlaced(betId, key, asset, tf, id, amount);
    }

    /// @notice Reveal a sealed side once betting has locked. Anyone holding the salt may call it.
    function reveal(uint256 betId, uint8 side, bytes32 salt) external {
        Bet storage b = bets[betId];
        if (b.side != SEALED || (side != UP && side != DOWN)) revert BadReveal();
        if (b.sealedSide != sealSide(side, salt)) revert BadReveal();
        (, uint64 lockAt, uint64 end) = window(b.tf, b.id);
        if (block.timestamp < lockAt || block.timestamp >= end + REVEAL_GRACE) revert NotRevealable();
        Round storage r = rounds[roundKey(b.asset, b.tf, b.id)];
        if (r.outcome != PENDING) revert AlreadySettled();
        b.side = side;
        if (side == UP) r.up += b.amount;
        else r.down += b.amount;
        emit BetRevealed(betId, side);
    }

    // ───────────────────────── settlement ─────────────────────────

    /// @notice Settle a round from oracle proofs of the start and end prices. Callable by anyone after the reveal
    ///         grace period; `msg.value` pays oracle fees (split evenly between the two updates).
    function settle(uint8 asset, uint32 tf, uint64 id, bytes calldata startData, bytes calldata endData) external payable {
        bytes32 key = roundKey(asset, tf, id);
        Round storage r = rounds[key];
        if (r.outcome != PENDING) revert AlreadySettled();
        if (feeds[asset] == bytes32(0) || cutoff[tf] == 0) revert UnknownMarket();
        (int256 p0, int256 p1) = _prices(asset, tf, id, startData, endData);
        r.startPrice = int128(p0);
        r.endPrice = int128(p1);

        uint8 o = p1 > p0 ? OUTCOME_UP : p1 < p0 ? OUTCOME_DOWN : REFUND;
        if (o != REFUND && (r.up == 0 || r.down == 0)) o = REFUND;
        r.outcome = o;

        if (o == REFUND) {
            feesAccrued += uint256(r.sealedTotal) - r.up - r.down; // forfeited unrevealed stakes
        } else {
            uint256 win = o == OUTCOME_UP ? r.up : r.down;
            uint256 lose = uint256(r.sealedTotal) - win;
            feesAccrued += (lose * FEE_BPS) / 10_000;
        }
        emit RoundSettled(key, asset, tf, id, p0, p1, o);
    }

    function _prices(uint8 asset, uint32 tf, uint64 id, bytes calldata startData, bytes calldata endData)
        internal
        returns (int256 p0, int256 p1)
    {
        (uint64 start,, uint64 end) = window(tf, id);
        if (block.timestamp < end + REVEAL_GRACE) revert TooEarly();
        bytes32 feed = feeds[asset];
        uint256 f1 = oracle.fee(startData);
        p0 = oracle.priceAt{value: f1}(feed, start, startData);
        p1 = oracle.priceAt{value: msg.value - f1}(feed, end, endData);
    }

    /// @notice If the oracle could not settle a round within a day of its end, refund every stake.
    function voidRound(uint8 asset, uint32 tf, uint64 id) external {
        bytes32 key = roundKey(asset, tf, id);
        Round storage r = rounds[key];
        if (r.outcome != PENDING) revert AlreadySettled();
        (,, uint64 end) = window(tf, id);
        if (block.timestamp < end + VOID_AFTER) revert TooEarly();
        r.outcome = VOID;
        emit RoundSettled(key, asset, tf, id, 0, 0, VOID);
    }

    /// @notice Called by the pool after it verified the claimant's proof. Returns the amount owed.
    function claim(uint256 betId) external returns (uint256 payout) {
        if (msg.sender != pool) revert NotPool();
        Bet storage b = bets[betId];
        if (b.claimed) revert AlreadyClaimed();
        if (rounds[roundKey(b.asset, b.tf, b.id)].outcome == PENDING) revert NotSettled();
        payout = payoutOf(betId);
        b.claimed = true;
        emit BetClaimed(betId, payout);
    }

    function takeFees() external returns (uint256 amount) {
        if (msg.sender != pool) revert NotPool();
        amount = feesAccrued;
        feesAccrued = 0;
    }
}
