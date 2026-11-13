import { ethers } from "ethers";
import { ASSETS, REVEAL_GRACE, TIMEFRAMES, env, type ChainConfig } from "./config.js";
import { updateAt, feedIds } from "./prices.js";

const ROUNDS_ABI = [
  "event BetPlaced(uint256 indexed betId, bytes32 indexed roundKey, uint8 asset, uint32 tf, uint64 roundId, uint128 amount)",
  "event RoundSettled(bytes32 indexed roundKey, uint8 asset, uint32 tf, uint64 roundId, int256 startPrice, int256 endPrice, uint8 outcome)",
  "function rounds(bytes32) view returns (int128 startPrice, int128 endPrice, uint128 up, uint128 down, uint128 sealedTotal, uint8 outcome)",
  "function roundKey(uint8,uint32,uint64) pure returns (bytes32)",
  "function feeds(uint8) view returns (bytes32)",
  "function settle(uint8,uint32,uint64,bytes,bytes) payable",
  "function reveal(uint256,uint8,bytes32)",
  "function bets(uint256) view returns (uint128 amount, uint64 id, uint32 tf, uint8 asset, uint8 side, bool claimed, bytes32 sealedSide, bytes32 claimHash)",
];
const ORACLE_ABI = ["function fee(bytes) view returns (uint256)"];
export const POOL_ABI = [
  "function bet((bytes proof,uint256 root,uint256 nullifierHash,uint256 changeCommitment,address relayer,uint256 fee) s,uint8 asset,uint32 tf,uint64 roundId,uint128 amount,bytes32 sealedSide,bytes32 claimHash) returns (uint256)",
  "function withdraw((bytes proof,uint256 root,uint256 nullifierHash,uint256 changeCommitment,address relayer,uint256 fee) s,address recipient,uint256 amount)",
  "function claim(bytes proof,uint256 betId,uint256 inner,address relayer,uint256 fee)",
  "function latestRoot() view returns (uint256)",
  "function nextIndex() view returns (uint32)",
];

type RoundRef = { asset: number; tf: number; id: bigint };
type Reveal = { betId: bigint; side: number; salt: string; tf: number; id: bigint };

export class ChainService {
  provider: ethers.JsonRpcProvider;
  rounds?: ethers.Contract;
  pool?: ethers.Contract;
  keeper?: ethers.Wallet;
  relayer?: ethers.Wallet;
  pending = new Map<string, RoundRef>(); // rounds with bets, not yet settled
  reveals: Reveal[] = [];
  scannedTo = 0;
  lastError?: string;
  lastTick = 0;

  constructor(public cfg: ChainConfig) {
    this.provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true });
    const d = cfg.deployment;
    if (!d) return;
    if (env.keeperKey) this.keeper = new ethers.Wallet(env.keeperKey, this.provider);
    if (env.relayerKey) this.relayer = new ethers.Wallet(env.relayerKey, this.provider);
    this.rounds = new ethers.Contract(d.rounds, ROUNDS_ABI, this.keeper ?? this.provider);
    this.pool = new ethers.Contract(d.pool, POOL_ABI, this.relayer ?? this.provider);
    this.scannedTo = d.block - 1;
  }

  get live() {
    return !!this.cfg.deployment;
  }

  status() {
    return {
      chainId: this.cfg.chainId,
      name: this.cfg.name,
      deployed: this.live,
      contracts: this.cfg.deployment ? { pool: this.cfg.deployment.pool, rounds: this.cfg.deployment.rounds, token: this.cfg.deployment.token } : null,
      mockVerifiers: this.cfg.deployment?.mockVerifiers ?? null,
      keeper: this.keeper?.address ?? null,
      relayer: this.relayer?.address ?? null,
      pendingRounds: this.pending.size,
      queuedReveals: this.reveals.length,
      lastTick: this.lastTick ? new Date(this.lastTick).toISOString() : null,
      lastError: this.lastError ?? null,
    };
  }

  async roundTotals(asset: number, tf: number, id: bigint) {
    if (!this.rounds) return null;
    const key = await this.rounds.roundKey(asset, tf, id);
    const r = await this.rounds.rounds(key);
    return { up: r.up.toString(), down: r.down.toString(), total: r.sealedTotal.toString(), outcome: Number(r.outcome) };
  }

  queueReveal(betId: bigint, side: number, salt: string, tf: number, id: bigint) {
    this.reveals.push({ betId, side, salt, tf, id });
  }

  /** One keeper pass: index new bets, reveal queued sides after lock, settle finished rounds. */
  async tick() {
    if (!this.rounds) return;
    this.lastTick = Date.now();
    try {
      await this.scan();
      if (this.keeper) {
        await this.revealDue();
        await this.settleDue();
      }
      this.lastError = undefined;
    } catch (e) {
      this.lastError = (e as Error).message.slice(0, 300);
      console.warn(`[${this.cfg.chainId}] keeper`, this.lastError);
    }
  }

  private async scan() {
    const head = await this.provider.getBlockNumber();
    while (this.scannedTo < head) {
      const from = this.scannedTo + 1;
      const to = Math.min(head, from + 4999);
      const logs = await this.rounds!.queryFilter(this.rounds!.filters.BetPlaced(), from, to);
      for (const l of logs as ethers.EventLog[]) {
        const [, key, asset, tf, id] = l.args;
        this.pending.set(key, { asset: Number(asset), tf: Number(tf), id: BigInt(id) });
      }
      this.scannedTo = to;
    }
  }

  private async revealDue() {
    const now = Math.floor(Date.now() / 1000);
    const keep: Reveal[] = [];
    for (const r of this.reveals) {
      const tf = TIMEFRAMES.find((t) => t.seconds === r.tf);
      const end = Number(r.id + 1n) * r.tf;
      const lockAt = end - (tf?.cutoff ?? 0);
      if (now < lockAt) { keep.push(r); continue; }
      if (now >= end + REVEAL_GRACE) continue; // too late
      try {
        await (await this.rounds!.reveal(r.betId, r.side, r.salt)).wait();
      } catch (e) {
        console.warn(`[${this.cfg.chainId}] reveal ${r.betId}`, (e as Error).message.slice(0, 120));
      }
    }
    this.reveals = keep;
  }

  private async settleDue() {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, r] of this.pending) {
      const end = Number(r.id + 1n) * r.tf;
      if (now < end + REVEAL_GRACE + 5) continue;
      const state = await this.rounds!.rounds(key);
      if (Number(state.outcome) !== 0) { this.pending.delete(key); continue; }
      const start = Number(r.id) * r.tf;
      const [d0, d1] = await Promise.all([this.oracleData(r.asset, start), this.oracleData(r.asset, end)]);
      const oracle = new ethers.Contract(this.cfg.deployment!.oracle, ORACLE_ABI, this.provider);
      const fee = (await oracle.fee(d0)) + (await oracle.fee(d1));
      await (await this.rounds!.settle(r.asset, r.tf, r.id, d0, d1, { value: fee })).wait();
      this.pending.delete(key);
      console.log(`[${this.cfg.chainId}] settled ${ASSETS[r.asset]} ${r.tf}s #${r.id}`);
    }
  }

  private async oracleData(asset: number, ts: number): Promise<string> {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const d = this.cfg.deployment!;
    if (d.oracleKind === "pyth") {
      const { data } = await updateAt(d.feeds[ASSETS[asset]], ts);
      return coder.encode(["bytes[]"], [data]);
    }
    // Signed oracle: the keeper signs the Pyth price it read from Hermes.
    const hermesId = feedIds()[ASSETS[asset]];
    if (!hermesId) throw new Error("no hermes feed id");
    const { price } = await updateAt(hermesId, ts);
    const p8 = BigInt(Math.round(price * 1e8));
    const feed = await this.rounds!.feeds(asset);
    const h = ethers.keccak256(coder.encode(["uint256", "address", "bytes32", "uint64", "int256"], [this.cfg.chainId, d.oracle, feed, ts, p8]));
    const sig = await this.keeper!.signMessage(ethers.getBytes(h));
    return coder.encode(["int256", "bytes"], [p8, sig]);
  }

  /** Submit a user's proof-carrying call to the pool from the relayer wallet. */
  async relay(method: "bet" | "withdraw" | "claim", args: unknown[]) {
    if (!this.pool || !this.relayer) throw new Error("relayer not configured for this chain");
    const fn = this.pool.getFunction(method);
    await fn.staticCall(...args); // revert early without paying gas
    const tx = await fn.send(...args);
    return tx.hash as string;
  }
}
