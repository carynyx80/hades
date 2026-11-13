// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {HazeRounds} from "./HazeRounds.sol";

/// @title HazePool
/// @notice Shielded pool for one stablecoin. Funds live as notes `Poseidon(amount, inner)` with
///         `inner = Poseidon(secret, nullifier)` in an incremental Merkle tree. Spending a note (to bet or withdraw)
///         takes a zero-knowledge proof of membership; it reveals `Poseidon(nullifier, 0)` to stop double spends and
///         writes a change note, so the spender's original deposit is never identified.
///
///         Proof public inputs
///          spend: [root, nullifierHash, publicAmount, changeCommitment, extDataHash]
///          claim: [claimHash, extDataHash]
///         `extDataHash` binds what the proof authorises (recipient, relayer fee, bet details) so a relayer or a
///         front-runner cannot redirect it.
contract HazePool is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;

    uint256 public constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint8 public constant DEPTH = 20;
    uint8 public constant ROOT_HISTORY = 100;

    IERC20 public immutable token;
    HazeRounds public immutable rounds;
    IVerifier public immutable spendVerifier;
    IVerifier public immutable claimVerifier;

    // Merkle tree
    uint256[DEPTH] public zeros;
    uint256[DEPTH] public filledSubtrees;
    uint256[ROOT_HISTORY] public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    mapping(uint256 => bool) public nullifierSpent;
    uint256 public minDeposit;

    error InvalidProof();
    error UnknownRoot();
    error Spent();
    error TreeFull();
    error BadAmount();
    error FieldOverflow();

    event NoteAdded(uint256 indexed commitment, uint32 leafIndex, uint256 root);
    event Deposit(uint256 indexed commitment, uint256 amount);
    event Withdrawal(uint256 nullifierHash, address recipient, uint256 amount, address relayer, uint256 fee);
    event PrivateBet(uint256 nullifierHash, uint256 betId);
    event PrivateClaim(uint256 indexed betId, uint256 commitment);

    constructor(address admin, IERC20 token_, HazeRounds rounds_, IVerifier spend_, IVerifier claim_, uint256 minDeposit_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        token = token_;
        rounds = rounds_;
        spendVerifier = spend_;
        claimVerifier = claim_;
        minDeposit = minDeposit_;

        uint256 z = uint256(keccak256("haze")) % FIELD;
        for (uint8 i = 0; i < DEPTH; i++) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = _hash(z, z);
        }
        roots[0] = z;
    }

    // ───────────────────────── tree ─────────────────────────

    function _hash(uint256 a, uint256 b) internal pure returns (uint256) {
        return PoseidonT3.hash([a, b]);
    }

    function _insert(uint256 leaf) internal returns (uint32 index) {
        if (leaf >= FIELD) revert FieldOverflow();
        index = nextIndex;
        if (index == uint32(1) << DEPTH) revert TreeFull();
        uint256 cur = leaf;
        uint32 idx = index;
        for (uint8 i = 0; i < DEPTH; i++) {
            if (idx & 1 == 0) {
                filledSubtrees[i] = cur;
                cur = _hash(cur, zeros[i]);
            } else {
                cur = _hash(filledSubtrees[i], cur);
            }
            idx >>= 1;
        }
        uint32 ri = (currentRootIndex + 1) % ROOT_HISTORY;
        currentRootIndex = ri;
        roots[ri] = cur;
        nextIndex = index + 1;
        emit NoteAdded(leaf, index, cur);
    }

    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint32 i = currentRootIndex;
        for (uint8 n = 0; n < ROOT_HISTORY; n++) {
            if (roots[i] == root) return true;
            i = i == 0 ? ROOT_HISTORY - 1 : i - 1;
        }
        return false;
    }

    function latestRoot() external view returns (uint256) {
        return roots[currentRootIndex];
    }

    function noteCommitment(uint256 amount, uint256 inner) public pure returns (uint256) {
        return PoseidonT3.hash([amount, inner]);
    }

    // ───────────────────────── deposit ─────────────────────────

    /// @notice Deposit `amount` as a new note. `inner = Poseidon(secret, nullifier)` is computed in the browser.
    function deposit(uint256 amount, uint256 inner) external nonReentrant {
        if (amount < minDeposit || amount >= 2 ** 128) revert BadAmount();
        if (inner >= FIELD) revert FieldOverflow();
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 c = noteCommitment(amount, inner);
        _insert(c);
        emit Deposit(c, amount);
    }

    // ───────────────────────── spend ─────────────────────────

    struct Spend {
        bytes proof;
        uint256 root;
        uint256 nullifierHash;
        uint256 changeCommitment;
        address relayer;
        uint256 fee;
    }

    function _spend(Spend calldata s, uint256 publicAmount, bytes32 ext) internal {
        if (nullifierSpent[s.nullifierHash]) revert Spent();
        if (!isKnownRoot(s.root)) revert UnknownRoot();
        bytes32[] memory inputs = new bytes32[](5);
        inputs[0] = bytes32(s.root);
        inputs[1] = bytes32(s.nullifierHash);
        inputs[2] = bytes32(publicAmount);
        inputs[3] = bytes32(s.changeCommitment);
        inputs[4] = bytes32(uint256(ext) % FIELD);
        if (!spendVerifier.verify(s.proof, inputs)) revert InvalidProof();
        nullifierSpent[s.nullifierHash] = true;
        _insert(s.changeCommitment);
        if (s.fee > 0) token.safeTransfer(s.relayer, s.fee);
    }

    /// @notice Withdraw from a note to any address. The relayer (if any) is paid `fee` out of the note.
    function withdraw(Spend calldata s, address recipient, uint256 amount) external nonReentrant {
        if (amount == 0) revert BadAmount();
        bytes32 ext = keccak256(abi.encode(block.chainid, address(this), "withdraw", recipient, amount, s.relayer, s.fee));
        _spend(s, amount + s.fee, ext);
        token.safeTransfer(recipient, amount);
        emit Withdrawal(s.nullifierHash, recipient, amount, s.relayer, s.fee);
    }

    /// @notice Bet from a note. The side is sealed; `claimHash = Poseidon(claimSecret, 0)` lets only the bettor claim.
    function bet(Spend calldata s, uint8 asset, uint32 tf, uint64 roundId, uint128 amount, bytes32 sealedSide, bytes32 claimHash)
        external
        nonReentrant
        returns (uint256 betId)
    {
        bytes32 ext = keccak256(
            abi.encode(block.chainid, address(this), "bet", asset, tf, roundId, amount, sealedSide, claimHash, s.relayer, s.fee)
        );
        _spend(s, uint256(amount) + s.fee, ext);
        betId = rounds.placeBet(asset, tf, roundId, amount, sealedSide, claimHash);
        emit PrivateBet(s.nullifierHash, betId);
    }

    /// @notice Claim a settled bet into a fresh note `Poseidon(payout - fee, inner)`.
    function claim(bytes calldata proof, uint256 betId, uint256 inner, address relayer, uint256 fee) external nonReentrant {
        if (inner >= FIELD) revert FieldOverflow();
        (,,,,,, , bytes32 claimHash) = rounds.bets(betId);
        bytes32 ext = keccak256(abi.encode(block.chainid, address(this), "claim", betId, inner, relayer, fee));
        bytes32[] memory inputs = new bytes32[](2);
        inputs[0] = claimHash;
        inputs[1] = bytes32(uint256(ext) % FIELD);
        if (!claimVerifier.verify(proof, inputs)) revert InvalidProof();

        uint256 payout = rounds.claim(betId);
        if (fee > payout) revert BadAmount();
        uint256 c = noteCommitment(payout - fee, inner);
        _insert(c);
        if (fee > 0) token.safeTransfer(relayer, fee);
        emit PrivateClaim(betId, c);
    }

    // ───────────────────────── admin ─────────────────────────

    function withdrawFees(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        token.safeTransfer(to, rounds.takeFees());
    }

    function setMinDeposit(uint256 v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minDeposit = v;
    }
}
