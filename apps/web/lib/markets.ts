export const ASSETS = [
  { symbol: "BTC", name: "Bitcoin", query: "BTC/USD", fallback: 98_400 },
  { symbol: "ETH", name: "Ethereum", query: "ETH/USD", fallback: 3_620 },
  { symbol: "BNB", name: "BNB", query: "BNB/USD", fallback: 712 },
  { symbol: "SOL", name: "Solana", query: "SOL/USD", fallback: 214 },
] as const;

export type AssetSymbol = (typeof ASSETS)[number]["symbol"];

export const TIMEFRAMES = [
  { id: "5m", label: "5 min", seconds: 300, cutoff: 60 },
  { id: "10m", label: "10 min", seconds: 600, cutoff: 120 },
  { id: "15m", label: "15 min", seconds: 900, cutoff: 120 },
  { id: "1h", label: "1 hour", seconds: 3600, cutoff: 300 },
  { id: "1d", label: "1 day", seconds: 86400, cutoff: 3600 },
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export const CHAINS = [
  { id: 97, name: "BNB Chain", short: "BNB", testnet: true, color: "#F3BA2F" },
  { id: 46630, name: "Robinhood Chain", short: "HOOD", testnet: true, color: "#CCFF00" },
] as const;

/** Rounds are aligned to Unix time: round n of a timeframe spans [n*s, (n+1)*s). */
export function roundAt(tf: Timeframe, nowSec: number) {
  const id = Math.floor(nowSec / tf.seconds);
  const start = id * tf.seconds;
  const end = start + tf.seconds;
  const lockAt = end - tf.cutoff;
  return { id, start, end, lockAt, open: nowSec < lockAt };
}

export function fmtCountdown(sec: number, ready = true) {
  if (!ready) return "--:--";
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function fmtUsd(n: number) {
  const d = n >= 1000 ? 2 : n >= 1 ? 3 : 5;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
