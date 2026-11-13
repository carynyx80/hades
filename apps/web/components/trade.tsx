"use client";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ASSETS, TIMEFRAMES, fmtCountdown, fmtUsd, type AssetSymbol } from "@/lib/markets";
import { usePrices, useNow } from "@/lib/use-prices";
import { useMarkets, useSession, type Market, type PlayBet, type Side } from "@/lib/play";
import { Logo } from "./logo";
import { Sparkline } from "./sparkline";
import { ChainSwitcher, ConnectButton } from "./wallet";

const FEE = 0.02;

export function Trade() {
  const prices = usePrices();
  const now = useNow();
  const { markets, error } = useMarkets();
  const s = useSession();
  const [asset, setAsset] = useState<AssetSymbol>("BTC");
  const [tfId, setTfId] = useState<string>("5m");
  const [side, setSide] = useState<Side>("UP");
  const [amount, setAmount] = useState("25");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  // Announce bets that settled since the last refresh (not the history already there when the page loaded).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!s.account) { seen.current = null; return; }
    const ids = s.account.settled.map((b) => b.id);
    if (!seen.current) { seen.current = new Set(ids); return; }
    const fresh = s.account.settled.filter((b) => !seen.current!.has(b.id));
    if (!fresh.length) return;
    fresh.forEach((b) => seen.current!.add(b.id));
    const won = fresh.filter((b) => b.status === "WON");
    setToast(won.length
      ? { text: `Won ${won.reduce((x, b) => x + b.payout, 0).toFixed(2)} credits · ${won.map((b) => `${b.asset} ${b.tf}`).join(", ")}`, tone: "ok" }
      : { text: fresh.map((b) => `${b.asset} ${b.tf} ${b.status.toLowerCase()}`).join(" · "), tone: "bad" });
  }, [s.account]);

  const tf = TIMEFRAMES.find((t) => t.id === tfId)!;
  const m: Market | undefined = markets?.find((x) => x.asset === asset && x.timeframe === tfId);
  const p = prices[asset];
  const livePrice = m?.price ?? p.price;
  const amt = Math.max(0, Number(amount) || 0);
  const up = m?.up ?? 0, down = m?.down ?? 0;
  const mine = side === "UP" ? up : down;
  const other = side === "UP" ? down : up;
  const payout = amt > 0 ? amt + (other * (1 - FEE) * amt) / (mine + amt) : 0;
  const open = m ? now < m.lockAt : false;
  const delta = m?.startPrice ? livePrice - m.startPrice : null;
  const balance = s.account?.balance ?? 0;

  async function place() {
    if (!m || !open || amt <= 0) return;
    setBusy(true);
    try {
      await s.bet(asset, tfId, side, amt);
      setToast({ text: `${side} ${asset} ${tfId} · ${amt} credits`, tone: "ok" });
    } catch (e) {
      setToast({ text: (e as Error).message, tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    try { await s.signIn(); } catch (e) { setToast({ text: (e as Error).message.split("\n")[0], tone: "bad" }); }
  }

  let cta: React.ReactNode;
  if (!s.isConnected) cta = <div className="mt-5 flex justify-center [&>button]:w-full [&>button]:py-4"><ConnectButton /></div>;
  else if (!s.signedIn)
    cta = (
      <button onClick={signIn} disabled={s.signing} className="mt-5 w-full rounded-2xl bg-white py-4 font-medium text-ink transition enabled:hover:scale-[1.02] disabled:opacity-50">
        {s.signing ? "Check your wallet…" : "Sign in to play (free signature)"}
      </button>
    );
  else
    cta = (
      <button onClick={place} disabled={!open || amt < 1 || amt > balance || busy || !m}
        className="mt-5 w-full rounded-2xl bg-white py-4 font-medium text-ink transition enabled:hover:scale-[1.02] disabled:opacity-40">
        {busy ? "Placing…" : !open ? "Round locked — next one soon" : amt > balance ? "Not enough credits" : `Bet ${side === "UP" ? "Up ↑" : "Down ↓"}`}
      </button>
    );

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
            <ChainSwitcher />
            <ConnectButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pt-4">
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-2 text-center text-xs text-accent">
          Play mode: rounds settle on live prices, but bets use free credits, not real money. On-chain markets are coming.
          {error && <span className="text-down"> · Market server unreachable: {error}</span>}
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {ASSETS.map((a) => {
              const ap = prices[a.symbol];
              const am = markets?.find((x) => x.asset === a.symbol && x.timeframe === tfId);
              const price = am?.price ?? ap.price;
              const ch = am?.startPrice ? ((price - am.startPrice) / am.startPrice) * 100 : 0;
              const on = asset === a.symbol;
              return (
                <motion.button key={a.symbol} whileHover={{ y: -3 }} onClick={() => setAsset(a.symbol)}
                  className={`glass rounded-2xl p-4 text-left transition ${on ? "ring-glow" : "opacity-80 hover:opacity-100"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.symbol}</span>
                    <span className={`font-mono text-xs ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "+" : ""}{ch.toFixed(3)}%</span>
                  </div>
                  <div className="mt-1 font-mono text-sm text-mist">{fmtUsd(price)}</div>
                  <div className="mt-2"><Sparkline data={ap.history} up={ch >= 0} w={140} h={28} /></div>
                </motion.button>
              );
            })}
          </div>

          <div className="glass rounded-3xl p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm text-mist">{ASSETS.find((a) => a.symbol === asset)!.name} · Up or Down · {tf.label}</div>
                <div className="font-mono text-4xl font-medium tracking-tight">{fmtUsd(livePrice)}</div>
                <div className="mt-1 font-mono text-sm">
                  {m?.startPrice ? (
                    <span className={delta! >= 0 ? "text-up" : "text-down"}>
                      {delta! >= 0 ? "▲" : "▼"} {fmtUsd(Math.abs(delta!))} since open ({fmtUsd(m.startPrice)})
                    </span>
                  ) : <span className="text-mist">waiting for the opening price…</span>}
                </div>
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
            <div className="mt-6 overflow-hidden"><Sparkline data={p.history} up={(delta ?? 0) >= 0} w={900} h={170} fluid /></div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat k="Round" v={m ? `#${m.roundId % 100000}` : "—"} />
              <Stat k={open ? "Betting closes" : "Round ends"} v={m ? fmtCountdown((open ? m.lockAt : m.end) - now, now > 0) : "--:--"} accent={open ? "text-up" : "text-accent"} />
              <Stat k="UP pool" v={up.toFixed(0)} accent="text-up" />
              <Stat k="DOWN pool" v={down.toFixed(0)} accent="text-down" />
            </div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/5">
              {up + down > 0 ? (
                <><motion.div className="bg-up" animate={{ width: `${(up / (up + down)) * 100}%` }} /><div className="flex-1 bg-down/80" /></>
              ) : <div className="flex-1 bg-white/5" />}
            </div>
            <div className="mt-5">
              <div className="mb-2 text-xs text-mist">Last rounds</div>
              <div className="flex flex-wrap gap-1.5">
                {(m?.recent ?? []).map((r) => (
                  <span key={r.roundId} title={`#${r.roundId % 100000}: ${r.startPrice ? fmtUsd(r.startPrice) : "?"} → ${r.endPrice ? fmtUsd(r.endPrice) : "?"}`}
                    className={`rounded-md px-2 py-1 font-mono text-xs ${r.outcome === "UP" ? "bg-up/15 text-up" : r.outcome === "DOWN" ? "bg-down/15 text-down" : "bg-white/5 text-mist"}`}>
                    {r.outcome === "UP" ? "↑ up" : r.outcome === "DOWN" ? "↓ down" : r.outcome === "PENDING" ? "…" : "– refund"}
                  </span>
                ))}
                {m && m.recent.length === 0 && <span className="text-xs text-mist">History starts with the first settled round.</span>}
              </div>
            </div>
          </div>

          <Bets s={s} markets={markets} now={now} />
        </section>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="glass relative overflow-hidden rounded-3xl p-6">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/25 blur-3xl" />
            <div className="relative text-sm text-mist">Play credits</div>
            <div className="relative mt-1 font-mono text-3xl">{s.signedIn && s.account ? balance.toFixed(2) : "—"}</div>
            {s.account && (
              <div className="relative mt-2 text-xs text-mist">
                {s.account.stats.bets} bets · {s.account.stats.wins} wins · returned {s.account.stats.returned.toFixed(0)} of {s.account.stats.wagered.toFixed(0)}
              </div>
            )}
            {s.signedIn && balance < 10 && (
              <button onClick={() => s.faucet().catch((e) => setToast({ text: e.message, tone: "bad" }))} className="relative mt-4 w-full rounded-xl bg-white/10 py-2 text-sm hover:bg-white/15">Refill to 1,000 credits</button>
            )}
            {!s.signedIn && <p className="relative mt-2 text-xs text-mist">Connect and sign in to get 1,000 free credits.</p>}
          </div>

          <div className="glass rounded-3xl p-6">
            <div className="text-sm text-mist">{asset} · {tf.label} · closes higher or lower than {m?.startPrice ? fmtUsd(m.startPrice) : "the open"}?</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["UP", "DOWN"] as Side[]).map((x) => (
                <button key={x} onClick={() => setSide(x)}
                  className={`rounded-2xl border py-4 text-lg font-semibold transition ${
                    side === x
                      ? x === "UP" ? "border-up/50 bg-up/15 text-up" : "border-down/50 bg-down/15 text-down"
                      : "border-line bg-white/[0.02] text-mist hover:text-white"
                  }`}>
                  {x === "UP" ? "Up ↑" : "Down ↓"}
                </button>
              ))}
            </div>
            <label className="mt-5 block text-xs text-mist">Stake (credits, 1–500)</label>
            <div className="mt-1.5 flex items-center rounded-2xl border border-line bg-white/[0.03] px-4 focus-within:border-accent/50">
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
                className="w-full bg-transparent py-3.5 font-mono text-lg outline-none" />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {[10, 25, 100, 250].map((v) => (
                <button key={v} onClick={() => setAmount(String(v))} className="rounded-lg bg-white/5 py-1.5 font-mono text-xs text-mist hover:bg-white/10 hover:text-white">{v}</button>
              ))}
            </div>
            <div className="mt-5 space-y-2 text-sm">
              <Row k="Est. payout if right" v={payout.toFixed(2)} />
              <Row k="Multiplier" v={amt > 0 ? `${(payout / amt).toFixed(2)}×` : "—"} />
              <Row k="Fee on the losing side" v="2%" />
              <Row k="If one side is empty" v="refund" />
            </div>
            {cta}
          </div>
        </aside>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-3 text-sm shadow-2xl ${toast.tone === "bad" ? "text-down" : ""}`}>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Bets({ s, markets, now }: { s: ReturnType<typeof useSession>; markets: Market[] | null; now: number }) {
  const [tab, setTab] = useState<"open" | "settled">("open");
  const list: PlayBet[] = (tab === "open" ? s.account?.open : s.account?.settled) ?? [];
  return (
    <div className="glass rounded-3xl p-5 sm:p-7">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-full bg-white/5 p-1">
          {(["open", "settled"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="relative rounded-full px-3 py-1.5 text-xs capitalize">
              {tab === t && <motion.span layoutId="betTab" className="absolute inset-0 rounded-full bg-white/10" />}
              <span className={`relative ${tab === t ? "text-white" : "text-mist"}`}>{t} {t === "open" && s.account ? `(${s.account.open.length})` : ""}</span>
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-mist">{s.address ? "your bets" : "connect to see your bets"}</span>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-mist">{tab === "open" ? "No open bets. Pick a side to start." : "Nothing settled yet."}</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {list.map((b) => {
              const m = markets?.find((x) => x.asset === b.asset && x.timeframe === b.tf);
              const live = m && m.roundId === b.roundId && m.startPrice && m.price ? (m.price > m.startPrice ? "UP" : m.price < m.startPrice ? "DOWN" : null) : null;
              const tf = TIMEFRAMES.find((t) => t.id === b.tf)!;
              const end = (b.roundId + 1) * tf.seconds;
              return (
                <motion.div key={b.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <span className={`rounded-md px-2 py-0.5 font-mono text-xs ${b.side === "UP" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{b.side}</span>
                    <span>{b.asset} · {b.tf}</span>
                  </span>
                  <span className="font-mono text-mist">{b.amount.toFixed(2)}</span>
                  {b.status === "OPEN" ? (
                    <span className="flex items-center gap-2 font-mono text-xs">
                      {live && <span className={live === b.side ? "text-up" : "text-down"}>{live === b.side ? "winning" : "losing"}</span>}
                      <span className="text-accent">{fmtCountdown(end - now, now > 0)}</span>
                    </span>
                  ) : (
                    <span className={`font-mono text-xs ${b.status === "WON" ? "text-up" : b.status === "LOST" ? "text-down" : "text-mist"}`}>
                      {b.status === "WON" ? `+${b.payout.toFixed(2)}` : b.status === "LOST" ? "lost" : "refunded"}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
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
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-mist">{k}</span><span className="font-mono">{v}</span></div>;
}
