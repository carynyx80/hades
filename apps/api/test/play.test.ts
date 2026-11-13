// Run: npx tsx test/play.test.ts — simulates a 5-minute BTC round with a fake clock and prices.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";

process.env.DATA_DIR = path.join(os.tmpdir(), `primar-play-${Date.now()}`);
process.env.SESSION_SECRET = "test";
const { history, latest } = await import("../src/prices.js");
const play = await import("../src/play.js");

let clock = Math.ceil(Date.now() / 1000 / 300) * 300 + 1; // 1 s into a fresh 5m round
Date.now = () => clock * 1000;
const setPrice = (p: number) => { history.BTC.push({ t: clock, p }); latest.BTC = { price: p, publishTime: clock }; };

async function signIn(w: ethers.HDNodeWallet) {
  const nonce = play.newNonce();
  const sig = await w.signMessage(play.signInMessage(w.address, nonce));
  const { token, address } = play.verifySignIn(w.address, nonce, sig);
  assert.equal(address, w.address);
  const addr = play.authAddress(`Bearer ${token}`);
  assert.equal(addr, w.address.toLowerCase());
  return addr!;
}

const alice = await signIn(ethers.Wallet.createRandom());
const bob = await signIn(ethers.Wallet.createRandom());
const carol = await signIn(ethers.Wallet.createRandom());

// Forged token and wrong signer are rejected
assert.equal(play.authAddress("Bearer abc.123.def"), undefined);
{
  const w = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom();
  const nonce = play.newNonce();
  assert.throws(() => play.verifySignIn(w.address, nonce, other.signMessageSync(play.signInMessage(w.address, nonce))));
}

setPrice(100_000);
play.tickRounds();
let m = play.marketsView().find((x) => x.asset === "BTC" && x.timeframe === "5m")!;
assert.equal(m.startPrice, 100_000);
assert.equal(m.open, true);

play.placeBet(alice, "BTC", "5m", "UP", 100);
play.placeBet(bob, "BTC", "5m", "DOWN", 50);
play.placeBet(carol, "BTC", "5m", "UP", 100);
assert.throws(() => play.placeBet(alice, "BTC", "5m", "UP", 5000), /stake/);
assert.throws(() => play.placeBet(alice, "BTC", "5m", "SIDEWAYS", 5), /side/);
assert.equal(play.accountView(alice).balance, 900);

// Betting closes 60 s before the end
clock += 240;
assert.throws(() => play.placeBet(bob, "BTC", "5m", "DOWN", 10), /closed/);

// Round ends higher → UP wins: pot = 50 * 0.98 = 49, split 50/50 between alice and carol
clock += 60;
setPrice(100_250);
play.tickRounds();
const a = play.accountView(alice), b = play.accountView(bob);
assert.equal(a.settled[0].status, "WON");
assert.equal(a.settled[0].payout, 124.5);
assert.equal(a.balance, 1024.5);
assert.equal(b.settled[0].status, "LOST");
assert.equal(b.balance, 950);
const prev = play.marketsView().find((x) => x.asset === "BTC" && x.timeframe === "5m")!.recent[0];
assert.equal(prev.outcome, "UP");
assert.equal(prev.endPrice, 100_250);

// One-sided round refunds
play.placeBet(alice, "BTC", "5m", "DOWN", 20);
clock += 300;
setPrice(99_000);
play.tickRounds();
assert.equal(play.accountView(alice).settled[0].status, "REFUND");
assert.equal(play.accountView(alice).balance, 1024.5);

// No end price observed (feed outage) → refund after the window
play.placeBet(alice, "BTC", "5m", "UP", 10);
play.placeBet(bob, "BTC", "5m", "DOWN", 10);
clock += 300 + 40;
play.tickRounds();
assert.equal(play.accountView(bob).settled[0].status, "REFUND");

console.log("play engine: all checks passed");
process.exit(0);
