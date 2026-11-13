import { ASSETS, env, type Asset } from "./config.js";

type Quote = { price: number; publishTime: number };
const ids: Partial<Record<Asset, string>> = {};
export const latest: Partial<Record<Asset, Quote>> = {};
export const history: Record<Asset, { t: number; p: number }[]> = { BTC: [], ETH: [], BNB: [], SOL: [] };
let lastOk = 0;

async function j<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (env.hermesKey) headers.authorization = `Bearer ${env.hermesKey}`;
  const r = await fetch(env.hermes + path, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`hermes ${r.status}`);
  return (await r.json()) as T;
}

export async function discoverFeeds() {
  for (const a of ASSETS) {
    if (ids[a]) continue;
    try {
      const list = await j<{ id: string; attributes: { symbol: string } }[]>(`/v2/price_feeds?query=${a}&asset_type=crypto`);
      const hit = list.find((f) => f.attributes.symbol === `Crypto.${a}/USD`);
      if (hit) ids[a] = "0x" + hit.id.replace(/^0x/, "");
    } catch {}
  }
  return ids;
}

export function feedIds() {
  return ids;
}

type Parsed = { id: string; price: { price: string; expo: number; publish_time: number } };

function record(a: Asset, price: number, publishTime: number) {
  if (!(price > 0)) return;
  latest[a] = { price, publishTime };
  const h = history[a];
  h.push({ t: publishTime, p: price });
  if (h.length > 600) h.shift();
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "user-agent": "haze-api" } });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return (await r.json()) as T;
}

const KRAKEN: Record<Asset, string> = { BTC: "XBTUSD", ETH: "ETHUSD", BNB: "BNBUSD", SOL: "SOLUSD" };
const GECKO: Record<Asset, string> = { BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana" };
let geckoAt = 0;

/** Keyless display prices for when Pyth Hermes is unavailable. Settlement still needs Pyth (or the signed oracle). */
async function fallback(missing: Asset[]) {
  const now = Math.floor(Date.now() / 1000);
  await Promise.all(
    missing.map(async (a) => {
      try {
        const k = await getJson<{ error: string[]; result: Record<string, { c: [string] }> }>(`https://api.kraken.com/0/public/Ticker?pair=${KRAKEN[a]}`);
        const v = Object.values(k.result ?? {})[0];
        if (v) return record(a, Number(v.c[0]), now);
      } catch {}
      if (a !== "BNB") {
        try {
          const c = await getJson<{ data: { amount: string } }>(`https://api.coinbase.com/v2/prices/${a}-USD/spot`);
          return record(a, Number(c.data.amount), now);
        } catch {}
      }
    }),
  );
  const still = missing.filter((a) => !latest[a] || latest[a]!.publishTime < now - 5);
  if (still.length && Date.now() - geckoAt > 15_000) {
    geckoAt = Date.now();
    try {
      const g = await getJson<Record<string, { usd: number }>>(`https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${still.map((a) => GECKO[a]).join(",")}`);
      for (const a of still) if (g[GECKO[a]]) record(a, g[GECKO[a]].usd, now);
    } catch {}
  }
}

export async function poll() {
  await pollHermes();
  const fresh = (a: Asset) => latest[a] && Date.now() / 1000 - latest[a]!.publishTime < 15;
  const missing = ASSETS.filter((a) => !fresh(a));
  if (missing.length) await fallback(missing);
  if (ASSETS.every(fresh)) lastOk = Date.now();
}

async function pollHermes() {
  const found = Object.entries(ids) as [Asset, string][];
  if (!found.length) return;
  try {
    const qs = found.map(([, id]) => `ids[]=${id}`).join("&");
    const r = await j<{ parsed: Parsed[] }>(`/v2/updates/price/latest?${qs}&parsed=true`);
    for (const p of r.parsed) {
      const a = found.find(([, id]) => id.slice(2) === p.id.replace(/^0x/, ""))?.[0];
      if (!a) continue;
      record(a, Number(p.price.price) * 10 ** p.price.expo, p.price.publish_time);
    }
  } catch (e) {
    hermesFailures++;
    if (hermesFailures === 1 || hermesFailures % 300 === 0) console.warn("hermes unavailable, using fallback prices:", (e as Error).message);
  }
}
let hermesFailures = 0;

export function pricesHealthy() {
  return Date.now() - lastOk < 30_000;
}

/** Pyth update (binary, hex) for the first price at or after `ts`, for on-chain settlement. */
export async function updateAt(feedId: string, ts: number): Promise<{ data: string[]; price: number }> {
  const r = await j<{ binary: { data: string[] }; parsed: Parsed[] }>(
    `/v2/updates/price/${ts}?ids[]=${feedId}&encoding=hex&parsed=true`,
  );
  const p = r.parsed[0].price;
  return { data: r.binary.data.map((d) => "0x" + d.replace(/^0x/, "")), price: Number(p.price) * 10 ** p.expo };
}

/** Price at a past timestamp (for showing round start prices). Cached. */
const startCache = new Map<string, number>();
export async function priceAt(a: Asset, ts: number): Promise<number | undefined> {
  const k = `${a}:${ts}`;
  if (startCache.has(k)) return startCache.get(k);
  const id = ids[a];
  if (!id || ts > Date.now() / 1000) return undefined;
  try {
    const { price } = await updateAt(id, ts);
    startCache.set(k, price);
    if (startCache.size > 2000) startCache.delete(startCache.keys().next().value!);
    return price;
  } catch {
    return undefined;
  }
}
