"use client";
import { ASSETS, fmtUsd } from "@/lib/markets";
import { usePrices } from "@/lib/use-prices";

export function Ticker() {
  const prices = usePrices(3000);
  const items = [...ASSETS, ...ASSETS, ...ASSETS, ...ASSETS];
  return (
    <div className="relative overflow-hidden border-y border-line py-5 [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
      <div className="marquee flex w-max gap-14 whitespace-nowrap">
        {items.map((a, i) => {
          const p = prices[a.symbol];
          const ch = ((p.price - p.history[0]) / p.history[0]) * 100;
          return (
            <span key={i} className="flex items-center gap-3 font-mono text-sm">
              <span className="text-white">{a.symbol}</span>
              <span className="text-mist">{fmtUsd(p.price)}</span>
              <span className={ch >= 0 ? "text-up" : "text-down"}>{ch >= 0 ? "▲" : "▼"} {Math.abs(ch).toFixed(2)}%</span>
              <span className="text-white/15">✦</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
