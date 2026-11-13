"use client";
import { useEffect, useRef, useState } from "react";
import { ASSETS, type AssetSymbol } from "./markets";

export type PriceMap = Record<AssetSymbol, { price: number; history: number[]; live: boolean }>;

const HERMES = "https://hermes.pyth.network";

function initial(): PriceMap {
  return Object.fromEntries(
    ASSETS.map((a) => [a.symbol, { price: a.fallback, history: [a.fallback], live: false }]),
  ) as PriceMap;
}

/** Live prices from Pyth Hermes (the oracle Haze settles against). Falls back to a gentle random walk offline. */
export function usePrices(intervalMs = 2000) {
  const [prices, setPrices] = useState<PriceMap>(initial);
  const ids = useRef<Partial<Record<AssetSymbol, string>>>({});

  useEffect(() => {
    let stop = false;

    async function discover() {
      await Promise.all(
        ASSETS.map(async (a) => {
          try {
            const r = await fetch(`${HERMES}/v2/price_feeds?query=${a.symbol}&asset_type=crypto`);
            const list = (await r.json()) as { id: string; attributes: { symbol: string } }[];
            const hit = list.find((f) => f.attributes.symbol === `Crypto.${a.query}`);
            if (hit) ids.current[a.symbol] = hit.id;
          } catch {}
        }),
      );
    }

    async function tick() {
      const found = Object.entries(ids.current) as [AssetSymbol, string][];
      let live: Partial<Record<AssetSymbol, number>> = {};
      if (found.length) {
        try {
          const qs = found.map(([, id]) => `ids[]=${id}`).join("&");
          const r = await fetch(`${HERMES}/v2/updates/price/latest?${qs}&parsed=true`);
          const j = (await r.json()) as { parsed: { id: string; price: { price: string; expo: number } }[] };
          for (const p of j.parsed) {
            const sym = found.find(([, id]) => id.replace(/^0x/, "") === p.id.replace(/^0x/, ""))?.[0];
            if (sym) live[sym] = Number(p.price.price) * 10 ** p.price.expo;
          }
        } catch {
          live = {};
        }
      }
      if (stop) return;
      setPrices((prev) => {
        const next = { ...prev };
        for (const a of ASSETS) {
          const cur = prev[a.symbol];
          const v = live[a.symbol] ?? cur.price * (1 + (Math.random() - 0.5) * 0.0012);
          next[a.symbol] = { price: v, history: [...cur.history, v].slice(-60), live: live[a.symbol] !== undefined };
        }
        return next;
      });
    }

    discover().then(tick);
    const t = setInterval(tick, intervalMs);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [intervalMs]);

  return prices;
}

export function useNow(ms = 1000) {
  // 0 until mounted, so server and client render the same first frame.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now() / 1000);
    const t = setInterval(() => setNow(Date.now() / 1000), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
