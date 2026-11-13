"use client";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ASSETS, TIMEFRAMES, CHAINS, roundAt, fmtCountdown, fmtUsd, type AssetSymbol } from "@/lib/markets";
import { usePrices, useNow } from "@/lib/use-prices";
import { Logo } from "./logo";
import { Sparkline } from "./sparkline";

type Side = "UP" | "DOWN";
type Bet = { id: string; asset: AssetSymbol; tf: string; round: number; end: number; side: Side; amount: number; entry: number; payout: number };

const FEE = 0.02;
const KEY = "haze-demo-v1";

/** Deterministic demo pool sizes per round, so totals look alive but stable. */
function poolFor(asset: string, tf: string, round: number, now: number, start: number, len: number) {
  let h = 0;
  for (const c of `${asset}${tf}${round}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = 2000 + (h % 9000);
  const grow = Math.min(1, Math.max(0.05, (now - start) / len));
  const tilt = 0.35 + ((h >> 8) % 30) / 100;
  return { up: base * tilt * grow, down: base * (1 - tilt) * grow };
}

export function Trade() {
  const prices = usePrices();
  const now = useNow();
  const [chain, setChain] = useState<number>(CHAINS[0].id);
  const [asset, setAsset] = useState<AssetSymbol>("BTC");
  const [tfId, setTfId] = useState<string>("5m");
  const [side, setSide] = useState<Side>("UP");
  const [amount, setAmount] = useState("25");
  const [balance, setBalance] = useState(1000);
  const [bets, setBets] = useState<Bet[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [proving, setProving] = useState(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s) { setBalance(s.balance); setBets(s.bets); }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ balance, bets })); } catch {}
  }, [balance, bets]);

  const tf = TIMEFRAMES.find((t) => t.id === tfId)!;
  const r = roundAt(tf, now || 0);
  const p = prices[asset];
  const pool = poolFor(asset, tf.id, r.id, now, r.start, tf.seconds);
  const amt = Math.max(0, Number(amount) || 0);
  const mine = side === "UP" ? pool.up : pool.down;
  const other = side === "UP" ? pool.down : pool.up;
  const payout = amt > 0 ? amt + (other * (1 - FEE) * amt) / (mine + amt) : 0;
  const mult = amt > 0 ? payout / amt : (mine + other * (1 - FEE)) / (mine || 1);

  // Settle finished demo bets against the current price as a stand-in for the oracle's close price.
  useEffect(() => {
    if (!now) return;
    const done = bets.filter((b) => b.end <= now);
    if (!done.length) return;
    let gain = 0;
    const msgs: string[] = [];
    for (const b of done) {
      const close = prices[b.asset].price;
      const won = b.side === "UP" ? close > b.entry : close < b.entry;
      if (won) gain += b.payout;
      msgs.push(`${b.asset} ${b.tf} ${won ? "won" : "lost"}`);
    }
    setBets((bs) => bs.filter((b) => b.end > now));
    if (gain) setBalance((x) => x + gain);
    setToast(msgs.join(" · "));
  }, [now, bets, prices]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  async function place() {
    if (!r.open || amt <= 0 || amt > balance) return;
    setProving(true);
    await new Promise((res) => setTimeout(res, 1100));
    setProving(false);
    setBalance((b) => b - amt);
    setBets((bs) => [{ id: crypto.randomUUID(), asset, tf: tf.id, round: r.id, end: r.end, side, amount: amt, entry: p.price, payout }, ...bs]);
    setToast(`Private bet placed · ${side} ${asset} ${tf.id}`);
  }

  const chainInfo = CHAINS.find((c) => c.id === chain)!;

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[#7b5cff] opacity-20 blur-[140px]" />
        <div className="absolute -right-40 top-40 h-[420px] w-[420px] rounded-full bg-[#3fd0ff] opacity-15 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-line bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-2">
            <div className="hidden gap-1 rounded-full bg-white/5 p-1 sm:flex">
              {CHAINS.map((c) => (
                <button key={c.id} onClick={() => setChain(c.id)} className="relative rounded-full px-3 py-1.5 text-xs">
                  {chain === c.id && <motion.span layoutId="chainPill" className="absolute inset-0 rounded-full bg-white/10" />}
                  <span className="relative flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    <span className={chain === c.id ? "text-white" : "text-mist"}>{c.name}</span>
                  </span>
                </button>
              ))}
            </div>
            <button className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink">Connect</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="rounded-xl border border-haze/20 bg-haze/5 px-4 py-2 text-center text-xs text-haze">
          Demo mode: contracts aren&apos;t deployed yet. Balance and bets are simulated in your browser; prices are {p.live ? "live from Pyth" : "a demo feed"}.
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {ASSETS.map((a) => {
              const ap = prices[a.symbol];
              const ch = ((ap.price - ap.history[0]) / ap.history[0]) * 100;
              const on = asset === a.symbol;
              return (
                <motion.button key={a.symbol} whileHover={{ y: -3 }} onClick={() => setAsset(a.symbol)}
                  className={`glass rounded-2xl p-4 text-left transition ${on ? "ring-glow" : "opacity-80 hover:opacity-100"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.symbol}</span>
                    <span className={`font-mono text-xs ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "+" : ""}{ch.toFixed(2)}%</span>
                  </div>
                  <div className="mt-1 font-mono text-sm text-mist">{fmtUsd(ap.price)}</div>
                  <div className="mt-2"><Sparkline data={ap.history} up={ch >= 0} w={140} h={28} /></div>
                </motion.button>
              );
            })}
          </div>

          <div className="glass rounded-3xl p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-mist">{ASSETS.find((a) => a.symbol === asset)!.name} · Up or Down</div>
                <div className="font-mono text-4xl font-medium tracking-tight">{fmtUsd(p.price)}</div>
              </div>
              <div className="flex gap-1 rounded-full bg-white/5 p-1">
                {TIMEFRAMES.map((t) => (
                  <button key={t.id} onClick={() => setTfId(t.id)} className="relative rounded-full px-3 py-1.5 font-mono text-xs">
                    {tfId === t.id && <motion.span layoutId="tfPill" className="absolute inset-0 rounded-full bg-white/10" />}
                    <span className={`relative ${tfId === t.id ? "text-white" : "text-mist"}`}>{t.id}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 overflow-hidden"><Sparkline data={p.history} up={p.price >= p.history[0]} w={900} h={180} fluid /></div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat k="Round" v={now ? `#${r.id % 100000}` : "—"} />
              <Stat k={r.open ? "Betting closes" : "Round ends"} v={fmtCountdown((r.open ? r.lockAt : r.end) - now, now > 0)} accent={r.open ? "text-up" : "text-haze"} />
              <Stat k="UP pool" v={`$${pool.up.toFixed(0)}`} accent="text-up" />
              <Stat k="DOWN pool" v={`$${pool.down.toFixed(0)}`} accent="text-down" />
            </div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/5">
              <motion.div className="bg-up" animate={{ width: `${(pool.up / (pool.up + pool.down)) * 100}%` }} />
              <div className="flex-1 bg-down/80" />
            </div>
          </div>

          <div className="glass rounded-3xl p-5 sm:p-7">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Your private bets</h3>
              <span className="font-mono text-xs text-mist">visible only on this device</span>
            </div>
            {bets.length === 0 ? (
              <p className="py-6 text-center text-sm text-mist">No open bets. Pick a side to start.</p>
            ) : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {bets.map((b) => (
                    <motion.div key={b.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}
                      className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 text-sm">
                      <span className="flex items-center gap-3">
                        <span className={`rounded-md px-2 py-0.5 font-mono text-xs ${b.side === "UP" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{b.side}</span>
                        <span>{b.asset} · {b.tf}</span>
                      </span>
                      <span className="font-mono text-mist">${b.amount.toFixed(2)} · from {fmtUsd(b.entry)}</span>
                      <span className="font-mono text-xs text-haze">{fmtCountdown(b.end - now, now > 0)}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="glass relative overflow-hidden rounded-3xl p-6">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-haze/25 blur-3xl" />
            <div className="relative text-sm text-mist">Shielded balance · {chainInfo.short === "BNB" ? "USDT" : "USDG"}</div>
            <div className="relative mt-1 font-mono text-3xl">${balance.toFixed(2)}</div>
            <div className="relative mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => { setBalance((b) => b + 500); setToast("Deposited 500 into the shielded pool (demo)"); }} className="rounded-xl bg-white/10 py-2 text-sm transition hover:bg-white/15">Deposit</button>
              <button className="rounded-xl bg-white/5 py-2 text-sm text-mist transition hover:bg-white/10">Withdraw</button>
            </div>
          </div>

          <div className="glass rounded-3xl p-6">
            <div className="text-sm text-mist">{asset} · {tf.label} · closes higher or lower?</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["UP", "DOWN"] as Side[]).map((s) => (
                <button key={s} onClick={() => setSide(s)}
                  className={`rounded-2xl border py-4 text-lg font-semibold transition ${
                    side === s
                      ? s === "UP" ? "border-up/50 bg-up/15 text-up" : "border-down/50 bg-down/15 text-down"
                      : "border-line bg-white/[0.02] text-mist hover:text-white"
                  }`}>
                  {s === "UP" ? "Up ↑" : "Down ↓"}
                </button>
              ))}
            </div>
            <label className="mt-5 block text-xs text-mist">Stake</label>
            <div className="mt-1.5 flex items-center rounded-2xl border border-line bg-white/[0.03] px-4 focus-within:border-haze/50">
              <span className="text-mist">$</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
                className="w-full bg-transparent px-2 py-3.5 font-mono text-lg outline-none" />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {[10, 25, 100, 250].map((v) => (
                <button key={v} onClick={() => setAmount(String(v))} className="rounded-lg bg-white/5 py-1.5 font-mono text-xs text-mist hover:bg-white/10 hover:text-white">${v}</button>
              ))}
            </div>
            <div className="mt-5 space-y-2 text-sm">
              <Row k="Est. payout" v={`$${payout.toFixed(2)}`} />
              <Row k="Multiplier" v={`${mult.toFixed(2)}×`} />
              <Row k="Fee on winnings" v="2%" />
              <Row k="Visible on-chain" v="nothing that links to you" accent="text-haze" />
            </div>
            <button onClick={place} disabled={!r.open || amt <= 0 || amt > balance || proving}
              className="mt-5 w-full rounded-2xl bg-white py-4 font-medium text-ink transition enabled:hover:scale-[1.02] disabled:opacity-40">
              {proving ? "Generating proof…" : !r.open ? "Round locked" : amt > balance ? "Not enough balance" : `Bet ${side} privately`}
            </button>
          </div>
        </aside>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-3 text-sm shadow-2xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ k, v, accent = "" }: { k: string; v: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-3">
      <div className="text-xs text-mist">{k}</div>
      <div className={`mt-1 font-mono text-lg ${accent}`}>{v}</div>
    </div>
  );
}
function Row({ k, v, accent = "" }: { k: string; v: string; accent?: string }) {
  return <div className="flex justify-between"><span className="text-mist">{k}</span><span className={`font-mono ${accent}`}>{v}</span></div>;
}
