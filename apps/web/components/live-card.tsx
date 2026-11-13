"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ASSETS, TIMEFRAMES, roundAt, fmtCountdown, fmtUsd, type AssetSymbol } from "@/lib/markets";
import { usePrices, useNow } from "@/lib/use-prices";
import { Sparkline } from "./sparkline";

/** Hero preview of the trading board. */
export function LiveCard() {
  const prices = usePrices();
  const now = useNow();
  const [asset, setAsset] = useState<AssetSymbol>("BTC");
  const tf = TIMEFRAMES[0];
  const r = roundAt(tf, now);
  const p = prices[asset];
  const first = p.history[0];
  const up = p.price >= first;
  const progress = now ? (now - r.start) / tf.seconds : 0;

  return (
    <div className="glass ring-glow relative overflow-hidden rounded-3xl p-1.5 text-left">
      <div className="rounded-[20px] bg-ink-2/80 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full bg-white/5 p-1">
            {ASSETS.map((a) => (
              <button
                key={a.symbol}
                onClick={() => setAsset(a.symbol)}
                className="relative rounded-full px-3.5 py-1.5 text-sm"
              >
                {asset === a.symbol && (
                  <motion.span layoutId="assetPill" className="absolute inset-0 rounded-full bg-white/12 bg-white/10" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} />
                )}
                <span className={`relative ${asset === a.symbol ? "text-white" : "text-mist"}`}>{a.symbol}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-mist">
            <span className={`h-1.5 w-1.5 rounded-full ${p.live ? "bg-up" : "bg-haze"}`} />
            {p.live ? "Live prices" : "Demo feed"} · {tf.label} round #{now ? r.id % 100000 : "—"}
          </div>
        </div>

        <div className="mt-7 grid items-end gap-6 sm:grid-cols-[1fr_auto]">
          <div>
            <div className="text-sm text-mist">{asset} / USD</div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={p.price.toFixed(2)}
                initial={{ opacity: 0.4, y: up ? 6 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono text-4xl font-medium tracking-tight sm:text-5xl"
              >
                {fmtUsd(p.price)}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="hidden sm:block"><Sparkline data={p.history} up={up} w={260} h={70} /></div>
        </div>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-haze to-haze-2" animate={{ width: `${progress * 100}%` }} transition={{ ease: "linear", duration: 1 }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs text-mist">
          <span>{r.open ? "Betting open" : "Locked — waiting for close"}</span>
          <span>{fmtCountdown(r.end - now, now > 0)}</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="group rounded-2xl border border-up/25 bg-up/10 py-4 text-left transition hover:bg-up/20">
            <div className="px-5 text-xs text-up/80">UP · pays ~1.94×</div>
            <div className="px-5 text-xl font-semibold text-up">Higher ↑</div>
          </button>
          <button className="group rounded-2xl border border-down/25 bg-down/10 py-4 text-left transition hover:bg-down/20">
            <div className="px-5 text-xs text-down/80">DOWN · pays ~2.06×</div>
            <div className="px-5 text-xl font-semibold text-down">Lower ↓</div>
          </button>
        </div>
      </div>
    </div>
  );
}
