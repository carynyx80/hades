import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ethers } from "ethers";
import { ASSETS, TIMEFRAMES, type Asset } from "./config.js";
import { history, latest } from "./prices.js";

/**
 * Play mode: real Up/Down rounds on live prices, settled by the server, with free credits per wallet.
 * Runs until the on-chain contracts are live. Same rules as PrimarRounds: parimutuel, 2% fee on the losing side,
 * flat or one-sided rounds refund, betting closes `cutoff` seconds before the end.
 */

const FEE = 0.02;
const START_CREDITS = 1000;
const MAX_BET = 500;
const PRICE_WINDOW = 30; // a start/end price must be observed within 30 s of the boundary, or the round refunds

type Side = "UP" | "DOWN";
type Outcome = "PENDING" | "UP" | "DOWN" | "REFUND";

type Round = {
  key: string;
  asset: Asset;
  tf: string;
  seconds: number;
  id: number;
  start: number;
  lockAt: number;
  end: number;
  startPrice?: number;
  endPrice?: number;
  up: number;
  down: number;
  outcome: Outcome;
};

type Bet = {
  id: string;
  address: string;
  roundKey: string;
  asset: Asset;
  tf: string;
  roundId: number;
  side: Side;
  amount: number;
  placedAt: number;
  status: "OPEN" | "WON" | "LOST" | "REFUND";
  payout: number;
};

type Account = { balance: number; faucetAt: number; created: number };

type State = { rounds: Record<string, Round>; bets: Bet[]; accounts: Record<string, Account> };

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "play.json");
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) console.warn("SESSION_SECRET not set: sign-ins reset on restart");

let state: State = { rounds: {}, bets: [], accounts: {} };
let dirty = false;

export function loadPlay() {
  try {
    state = JSON.parse(fs.readFileSync(FILE, "utf8"));
    console.log(`play state loaded: ${Object.keys(state.accounts).length} accounts, ${state.bets.length} bets`);
  } catch {
    console.log("play state: starting fresh at", FILE);
  }
  setInterval(save, 5000);
  setInterval(tickRounds, 1000);
  tickRounds();
}

export function save() {
  if (!dirty) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(state));
    fs.renameSync(FILE + ".tmp", FILE);
    dirty = false;
  } catch (e) {
    console.warn("play save failed", (e as Error).message);
  }
}

const keyOf = (asset: string, tf: string, id: number) => `${asset}:${tf}:${id}`;
const round2 = (n: number) => Math.floor(n * 100) / 100;

/** First observed price at or after `ts`, within PRICE_WINDOW. */
function priceAtOrAfter(asset: Asset, ts: number): number | undefined {
  const h = history[asset];
  for (const p of h) if (p.t >= ts && p.t <= ts + PRICE_WINDOW) return p.p;
  const l = latest[asset];
  if (l && l.publishTime >= ts && l.publishTime <= ts + PRICE_WINDOW) return l.price;
  return undefined;
}

function ensureRound(asset: Asset, tf: (typeof TIMEFRAMES)[number], id: number): Round {
  const key = keyOf(asset, tf.id, id);
  let r = state.rounds[key];
  if (!r) {
    const start = id * tf.seconds;
    r = state.rounds[key] = {
      key, asset, tf: tf.id, seconds: tf.seconds, id, start,
      lockAt: start + tf.seconds - tf.cutoff, end: start + tf.seconds, up: 0, down: 0, outcome: "PENDING",
    };
    dirty = true;
  }
  return r;
}

export function tickRounds() {
  const now = Math.floor(Date.now() / 1000);
  for (const asset of ASSETS) {
    for (const tf of TIMEFRAMES) {
      const cur = ensureRound(asset, tf, Math.floor(now / tf.seconds));
      if (cur.startPrice === undefined) {
        const p = priceAtOrAfter(asset, cur.start);
        if (p !== undefined) { cur.startPrice = p; dirty = true; }
      }
    }
  }
  for (const r of Object.values(state.rounds)) {
    if (r.outcome !== "PENDING" || now < r.end) continue;
    if (r.endPrice === undefined) {
      const p = priceAtOrAfter(r.asset, r.end);
      if (p !== undefined) r.endPrice = p;
    }
    if (r.endPrice !== undefined || now > r.end + PRICE_WINDOW + 5) settle(r);
  }
  prune(now);
}

function settle(r: Round) {
  let o: Outcome = "REFUND";
  if (r.startPrice !== undefined && r.endPrice !== undefined) {
    o = r.endPrice > r.startPrice ? "UP" : r.endPrice < r.startPrice ? "DOWN" : "REFUND";
  }
  if (o !== "REFUND" && (r.up === 0 || r.down === 0)) o = "REFUND";
  r.outcome = o;
  const win = o === "UP" ? r.up : r.down;
  const pot = (o === "UP" ? r.down : r.up) * (1 - FEE);
  for (const b of state.bets) {
    if (b.roundKey !== r.key || b.status !== "OPEN") continue;
    if (o === "REFUND") { b.status = "REFUND"; b.payout = b.amount; }
    else if (b.side === o) { b.status = "WON"; b.payout = round2(b.amount + (pot * b.amount) / win); }
    else { b.status = "LOST"; b.payout = 0; }
    const acct = state.accounts[b.address];
    if (acct) acct.balance = round2(acct.balance + b.payout);
  }
  dirty = true;
}

function prune(now: number) {
  // Keep settled rounds for 2 days (daily rounds need yesterday's result), bets for 7 days.
  for (const [k, r] of Object.entries(state.rounds)) {
    if (r.outcome !== "PENDING" && r.end < now - 2 * 86400) { delete state.rounds[k]; dirty = true; }
  }
  if (state.bets.length > 50_000) state.bets = state.bets.filter((b) => b.status === "OPEN" || b.placedAt > now - 7 * 86400);
}

// ───────────────────────── auth ─────────────────────────

const nonces = new Map<string, number>();

export function newNonce() {
  const n = crypto.randomBytes(16).toString("hex");
  nonces.set(n, Date.now());
  for (const [k, t] of nonces) if (Date.now() - t > 10 * 60_000) nonces.delete(k);
  return n;
}

export function signInMessage(address: string, nonce: string) {
  return `Sign in to Primar\n\nThis signature proves you own this wallet. It costs nothing and sends no transaction.\n\nAddress: ${address}\nNonce: ${nonce}`;
}

function hmac(s: string) {
  return crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
}

export function verifySignIn(address: string, nonce: string, signature: string) {
  if (!nonces.has(nonce)) throw new Error("expired nonce");
  nonces.delete(nonce);
  const addr = ethers.getAddress(address);
  const signer = ethers.verifyMessage(signInMessage(addr, nonce), signature);
  if (signer !== addr) throw new Error("signature does not match address");
  const exp = Date.now() + 7 * 86400_000;
  const payload = `${addr.toLowerCase()}.${exp}`;
  account(addr.toLowerCase());
  return { token: `${payload}.${hmac(payload)}`, address: addr, expires: exp };
}

export function authAddress(header?: string): string | undefined {
  const t = header?.replace(/^Bearer\s+/i, "");
  if (!t) return;
  const [addr, exp, mac] = t.split(".");
  if (!addr || !exp || !mac) return;
  const payload = `${addr}.${exp}`;
  const good = hmac(payload);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return;
  if (Number(exp) < Date.now()) return;
  return addr;
}

// ───────────────────────── accounts & bets ─────────────────────────

function account(addr: string): Account {
  let a = state.accounts[addr];
  if (!a) { a = state.accounts[addr] = { balance: START_CREDITS, faucetAt: Date.now(), created: Date.now() }; dirty = true; }
  return a;
}

export function faucet(addr: string) {
  const a = account(addr);
  if (a.balance >= 10) throw new Error("faucet is for empty balances (under 10 credits)");
  if (Date.now() - a.faucetAt < 3600_000) throw new Error("faucet available once an hour");
  a.balance = START_CREDITS;
  a.faucetAt = Date.now();
  dirty = true;
  return a;
}

export function placeBet(addr: string, asset: string, tf: string, side: string, amount: number) {
  if (!ASSETS.includes(asset as Asset)) throw new Error("unknown asset");
  const frame = TIMEFRAMES.find((t) => t.id === tf);
  if (!frame) throw new Error("unknown timeframe");
  if (side !== "UP" && side !== "DOWN") throw new Error("side must be UP or DOWN");
  amount = round2(Number(amount));
  if (!(amount >= 1) || amount > MAX_BET) throw new Error(`stake must be 1 to ${MAX_BET}`);
  const now = Math.floor(Date.now() / 1000);
  const r = ensureRound(asset as Asset, frame, Math.floor(now / frame.seconds));
  if (now >= r.lockAt) throw new Error("betting is closed for this round");
  const a = account(addr);
  if (a.balance < amount) throw new Error("not enough credits");
  a.balance = round2(a.balance - amount);
  if (side === "UP") r.up = round2(r.up + amount);
  else r.down = round2(r.down + amount);
  const bet: Bet = {
    id: crypto.randomUUID(), address: addr, roundKey: r.key, asset: r.asset, tf: r.tf, roundId: r.id,
    side, amount, placedAt: now, status: "OPEN", payout: 0,
  };
  state.bets.push(bet);
  dirty = true;
  return { bet, balance: a.balance, round: publicRound(r) };
}

function publicRound(r: Round) {
  return {
    asset: r.asset, timeframe: r.tf, roundId: r.id, start: r.start, lockAt: r.lockAt, end: r.end,
    startPrice: r.startPrice ?? null, endPrice: r.endPrice ?? null, up: r.up, down: r.down, outcome: r.outcome,
  };
}

/** Current round, plus the last settled results, for every market. */
export function marketsView() {
  const now = Math.floor(Date.now() / 1000);
  return ASSETS.flatMap((asset) =>
    TIMEFRAMES.map((tf) => {
      const id = Math.floor(now / tf.seconds);
      const cur = ensureRound(asset, tf, id);
      const recent: ReturnType<typeof publicRound>[] = [];
      for (let i = 1; i <= 8; i++) {
        const r = state.rounds[keyOf(asset, tf.id, id - i)];
        if (r) recent.push(publicRound(r));
      }
      return { ...publicRound(cur), price: latest[asset]?.price ?? null, open: now < cur.lockAt, recent };
    }),
  );
}

export function accountView(addr: string) {
  const a = account(addr);
  const mine = state.bets.filter((b) => b.address === addr);
  const open = mine.filter((b) => b.status === "OPEN");
  const settled = mine.filter((b) => b.status !== "OPEN").slice(-30).reverse();
  const wagered = mine.reduce((s, b) => s + b.amount, 0);
  const won = mine.reduce((s, b) => s + b.payout, 0);
  return {
    address: addr, balance: a.balance, open, settled,
    stats: { bets: mine.length, wagered: round2(wagered), returned: round2(won), wins: mine.filter((b) => b.status === "WON").length },
  };
}
