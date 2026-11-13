import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { poseidon2 } from "poseidon-lite";

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const OK = "0x01"; // MockVerifier accepts proofs starting with 0x01
const BAD = "0x00";
const BTC = 0;
const TF = 300;
const USD = (n: number) => BigInt(Math.round(n * 1e6));
const coder = ethers.AbiCoder.defaultAbiCoder();

/** JS mirror of the on-chain incremental Merkle tree. */
class Tree {
  zeros: bigint[] = [];
  leaves: bigint[] = [];
  constructor(public depth = 20) {
    let z = BigInt(ethers.keccak256(ethers.toUtf8Bytes("primar"))) % FIELD;
    for (let i = 0; i < depth; i++) {
      this.zeros.push(z);
      z = poseidon2([z, z]);
    }
  }
  root() {
    let level = [...this.leaves];
    for (let i = 0; i < this.depth; i++) {
      const next: bigint[] = [];
      for (let j = 0; j < Math.max(1, Math.ceil(level.length / 2)); j++) {
        next.push(poseidon2([level[2 * j] ?? this.zeros[i], level[2 * j + 1] ?? this.zeros[i]]));
      }
      level = next;
    }
    return level[0];
  }
}

async function deploy() {
  const [admin, alice, relayer, keeper, outsider] = await ethers.getSigners();
  const usd = await ethers.deployContract("TestUSD");
  const oracle = await ethers.deployContract("MockOracle");
  const spendV = await ethers.deployContract("MockVerifier");
  const claimV = await ethers.deployContract("MockVerifier");
  const poseidon = await ethers.deployContract("PoseidonT3");
  const rounds = await ethers.deployContract("PrimarRounds", [admin.address, await oracle.getAddress()]);
  const Pool = await ethers.getContractFactory("PrimarPool", {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
  });
  const pool = await Pool.deploy(admin.address, await usd.getAddress(), await rounds.getAddress(), await spendV.getAddress(), await claimV.getAddress(), USD(1));
  await rounds.setPool(await pool.getAddress());
  await rounds.setFeed(BTC, ethers.id("BTC/USD"));
  await usd.mint(alice.address, USD(10_000));
  await usd.connect(alice).approve(await pool.getAddress(), ethers.MaxUint256);
  return { admin, alice, relayer, keeper, outsider, usd, oracle, rounds, pool };
}

type Ctx = Awaited<ReturnType<typeof deploy>>;
let nonce = 1000n;
const fresh = () => nonce++;

function spend(root: bigint, relayer = ethers.ZeroAddress, fee = 0n, proof = OK) {
  return { proof, root, nullifierHash: fresh(), changeCommitment: fresh(), relayer, fee };
}

async function startOfNextRound() {
  const now = BigInt(await time.latest());
  const id = now / BigInt(TF) + 1n;
  await time.increaseTo(id * BigInt(TF) + 5n);
  return id;
}

async function placeBet(c: Ctx, id: bigint, amount: bigint, side: 1 | 2) {
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const sealed = await c.rounds.sealSide(side, salt);
  const claimSecret = fresh();
  const claimHash = ethers.toBeHex(poseidon2([claimSecret, 0n]), 32);
  const root = await c.pool.latestRoot();
  const tx = await c.pool.connect(c.relayer).bet(spend(root), BTC, TF, id, amount, sealed, claimHash);
  const rc = await tx.wait();
  const ev = rc!.logs.map((l) => c.rounds.interface.parseLog(l)).find((e) => e?.name === "BetPlaced");
  return { betId: ev!.args.betId as bigint, salt, side };
}

describe("PrimarPool tree", () => {
  it("matches an independent Poseidon Merkle tree after each deposit", async () => {
    const c = await deploy();
    const t = new Tree();
    expect(await c.pool.latestRoot()).to.equal(t.root());
    for (const amt of [5, 12.5, 100]) {
      const inner = poseidon2([fresh(), fresh()]);
      await c.pool.connect(c.alice).deposit(USD(amt), inner);
      t.leaves.push(poseidon2([USD(amt), inner]));
      expect(await c.pool.latestRoot()).to.equal(t.root());
    }
    expect(await c.pool.nextIndex()).to.equal(3);
  });

  it("rejects deposits below the minimum", async () => {
    const c = await deploy();
    await expect(c.pool.connect(c.alice).deposit(USD(0.5), 1n)).to.be.revertedWithCustomError(c.pool, "BadAmount");
  });
});

describe("Rounds: bet, reveal, settle, claim", () => {
  it("pays the winning side its share of the losing side and forfeited stakes, minus 2%", async () => {
    const c = await deploy();
    await c.pool.connect(c.alice).deposit(USD(1000), 7n);
    const id = await startOfNextRound();

    const up = await placeBet(c, id, USD(100), 1);
    const down = await placeBet(c, id, USD(50), 2);
    const hidden = await placeBet(c, id, USD(30), 1); // never revealed

    // Reveals are rejected while betting is open
    await expect(c.rounds.reveal(up.betId, 1, up.salt)).to.be.revertedWithCustomError(c.rounds, "NotRevealable");

    const [start, lockAt, end] = await c.rounds.window(TF, id);
    await time.increaseTo(lockAt);
    await expect(placeBet(c, id, USD(10), 1)).to.be.revertedWithCustomError(c.rounds, "BettingClosed");
    await expect(c.rounds.reveal(up.betId, 2, up.salt)).to.be.revertedWithCustomError(c.rounds, "BadReveal");
    await c.rounds.connect(c.keeper).reveal(up.betId, 1, up.salt);
    await c.rounds.connect(c.keeper).reveal(down.betId, 2, down.salt);

    await c.oracle.set(ethers.id("BTC/USD"), start, 100_000n * 10n ** 8n);
    await c.oracle.set(ethers.id("BTC/USD"), end, 100_500n * 10n ** 8n);
    await expect(c.rounds.settle(BTC, TF, id, "0x", "0x")).to.be.revertedWithCustomError(c.rounds, "TooEarly");
    await time.increaseTo(end + 300n);
    await expect(c.rounds.connect(c.outsider).settle(BTC, TF, id, "0x", "0x"))
      .to.emit(c.rounds, "RoundSettled")
      .withArgs(await c.rounds.roundKey(BTC, TF, id), BTC, TF, id, 100_000n * 10n ** 8n, 100_500n * 10n ** 8n, 1);

    // pot = (50 + 30) * 0.98 = 78.4 → UP bettor gets 178.4
    expect(await c.rounds.payoutOf(up.betId)).to.equal(USD(178.4));
    expect(await c.rounds.payoutOf(down.betId)).to.equal(0);
    expect(await c.rounds.payoutOf(hidden.betId)).to.equal(0);
    expect(await c.rounds.feesAccrued()).to.equal(USD(1.6));

    await expect(c.pool.claim(BAD, up.betId, 9n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.pool, "InvalidProof");
    const fee = USD(0.5);
    await expect(c.pool.claim(OK, up.betId, 9n, c.relayer.address, fee))
      .to.emit(c.pool, "PrivateClaim")
      .withArgs(up.betId, poseidon2([USD(178.4) - fee, 9n]));
    expect(await c.usd.balanceOf(c.relayer.address)).to.equal(fee);
    await expect(c.pool.claim(OK, up.betId, 9n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.rounds, "AlreadyClaimed");

    await c.pool.withdrawFees(c.admin.address);
    expect(await c.usd.balanceOf(c.admin.address)).to.equal(USD(1.6));
  });

  it("refunds revealed stakes on a one-sided round and keeps unrevealed ones", async () => {
    const c = await deploy();
    await c.pool.connect(c.alice).deposit(USD(500), 7n);
    const id = await startOfNextRound();
    const a = await placeBet(c, id, USD(40), 1);
    const b = await placeBet(c, id, USD(10), 2); // will not reveal
    const [start, lockAt, end] = await c.rounds.window(TF, id);
    await time.increaseTo(lockAt);
    await c.rounds.reveal(a.betId, 1, a.salt);
    await c.oracle.set(ethers.id("BTC/USD"), start, 10n);
    await c.oracle.set(ethers.id("BTC/USD"), end, 20n);
    await time.increaseTo(end + 300n);
    await c.rounds.settle(BTC, TF, id, "0x", "0x");
    const r = await c.rounds.rounds(await c.rounds.roundKey(BTC, TF, id));
    expect(r.outcome).to.equal(3);
    expect(await c.rounds.payoutOf(a.betId)).to.equal(USD(40));
    expect(await c.rounds.payoutOf(b.betId)).to.equal(0);
    expect(await c.rounds.feesAccrued()).to.equal(USD(10));
  });

  it("voids a round nobody settled within a day and refunds every stake", async () => {
    const c = await deploy();
    await c.pool.connect(c.alice).deposit(USD(500), 7n);
    const id = await startOfNextRound();
    const a = await placeBet(c, id, USD(25), 1);
    const [, , end] = await c.rounds.window(TF, id);
    await time.increaseTo(end + 3600n);
    await expect(c.rounds.voidRound(BTC, TF, id)).to.be.revertedWithCustomError(c.rounds, "TooEarly");
    await time.increaseTo(end + 86400n);
    await c.rounds.voidRound(BTC, TF, id);
    expect(await c.rounds.payoutOf(a.betId)).to.equal(USD(25));
  });
});

describe("Pool spends", () => {
  it("withdraws to any address, pays the relayer, and blocks reuse of a nullifier", async () => {
    const c = await deploy();
    await c.pool.connect(c.alice).deposit(USD(200), 7n);
    const root = await c.pool.latestRoot();
    const s = spend(root, c.relayer.address, USD(1));
    await c.pool.withdraw(s, c.outsider.address, USD(150));
    expect(await c.usd.balanceOf(c.outsider.address)).to.equal(USD(150));
    expect(await c.usd.balanceOf(c.relayer.address)).to.equal(USD(1));
    await expect(c.pool.withdraw({ ...s, changeCommitment: fresh() }, c.outsider.address, USD(1))).to.be.revertedWithCustomError(c.pool, "Spent");
  });

  it("rejects unknown roots and invalid proofs", async () => {
    const c = await deploy();
    await c.pool.connect(c.alice).deposit(USD(200), 7n);
    await expect(c.pool.withdraw(spend(123n), c.outsider.address, USD(1))).to.be.revertedWithCustomError(c.pool, "UnknownRoot");
    const root = await c.pool.latestRoot();
    await expect(c.pool.withdraw(spend(root, ethers.ZeroAddress, 0n, BAD), c.outsider.address, USD(1))).to.be.revertedWithCustomError(c.pool, "InvalidProof");
  });

  it("only the pool can place or claim bets", async () => {
    const c = await deploy();
    await expect(c.rounds.placeBet(BTC, TF, 1, 1, ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(c.rounds, "NotPool");
    await expect(c.rounds.claim(0)).to.be.revertedWithCustomError(c.rounds, "NotPool");
  });

  it("rejects bets on unknown markets", async () => {
    const c = await deploy();
    await c.pool.connect(c.alice).deposit(USD(200), 7n);
    const root = await c.pool.latestRoot();
    await expect(c.pool.bet(spend(root), 9, TF, 1, USD(1), ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(c.rounds, "UnknownMarket");
  });
});

describe("Locked pool", () => {
  it("never accepts deposits and cannot be unlocked", async () => {
    const c = await deploy();
    const Pool = await ethers.getContractFactory("PrimarPool", {
      libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await (await ethers.deployContract("PoseidonT3")).getAddress() },
    });
    const locked = await Pool.deploy(c.admin.address, await c.usd.getAddress(), await c.rounds.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, 2n ** 128n - 1n);
    await c.usd.connect(c.alice).approve(await locked.getAddress(), ethers.MaxUint256);
    await expect(locked.connect(c.alice).deposit(USD(100), 1n)).to.be.revertedWithCustomError(locked, "PoolLocked");
    await expect(locked.connect(c.alice).deposit(2n ** 128n - 1n, 1n)).to.be.revertedWithCustomError(locked, "PoolLocked");
    await expect(locked.setMinDeposit(1n)).to.be.revertedWithCustomError(locked, "PoolLocked");
  });
});

describe("SignedPriceOracle", () => {
  it("accepts a signer's price once and rejects others", async () => {
    const [owner, signer, other] = await ethers.getSigners();
    const o = await ethers.deployContract("SignedPriceOracle", [owner.address, signer.address]);
    const feed = ethers.id("BTC/USD");
    const ts = 1_700_000_000n;
    const sign = async (s: typeof signer, price: bigint) => {
      const { chainId } = await ethers.provider.getNetwork();
      const h = ethers.keccak256(coder.encode(["uint256", "address", "bytes32", "uint64", "int256"], [chainId, await o.getAddress(), feed, ts, price]));
      return coder.encode(["int256", "bytes"], [price, await s.signMessage(ethers.getBytes(h))]);
    };
    await expect(o.priceAt(feed, ts, await sign(other, 5n))).to.be.revertedWithCustomError(o, "BadSigner");
    await o.priceAt(feed, ts, await sign(signer, 42n));
    expect(await o.stored(feed, ts)).to.equal(42n);
  });
});
