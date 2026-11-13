import { ASSETS, env, type Asset } from "./config.js";

type Quote = { price: number; publishTime: number };
const ids: Partial<Record<Asset, string>> = {};
export const latest: Partial<Record<Asset, Quote>> = {};
export const history: Record<Asset, { t: number; p: number }[]> = { BTC: [], ETH: [], BNB: [], SOL: [] };
let lastOk = 0;

async function j<T>(path: string): Promise<T> {
  const r = await fetch(env.hermes + path, { signal: AbortSignal.timeout(8000) });
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
    } catch (e) {
      console.warn("feed discovery failed", a, (e as Error).message);
    }
  }
  return ids;
}

export function feedIds() {
  return ids;
}

type Parsed = { id: string; price: { price: string; expo: number; publish_time: number } };

export async function poll() {
  const found = Object.entries(ids) as [Asset, string][];
  if (!found.length) return;
  try {
    const qs = found.map(([, id]) => `ids[]=${id}`).join("&");
    const r = await j<{ parsed: Parsed[] }>(`/v2/updates/price/latest?${qs}&parsed=true`);
    for (const p of r.parsed) {
      const a = found.find(([, id]) => id.slice(2) === p.id.replace(/^0x/, ""))?.[0];
      if (!a) continue;
      const price = Number(p.price.price) * 10 ** p.price.expo;
      latest[a] = { price, publishTime: p.price.publish_time };
      const h = history[a];
      h.push({ t: p.price.publish_time, p: price });
      if (h.length > 600) h.shift();
    }
    lastOk = Date.now();
  } catch (e) {
    console.warn("price poll failed", (e as Error).message);
  }
}

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
