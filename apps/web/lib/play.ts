"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

export const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787").replace(/\/$/, "");

export type Side = "UP" | "DOWN";
export type PlayRound = {
  asset: string; timeframe: string; roundId: number; start: number; lockAt: number; end: number;
  startPrice: number | null; endPrice: number | null; up: number; down: number; outcome: "PENDING" | "UP" | "DOWN" | "REFUND";
};
export type Market = PlayRound & { price: number | null; open: boolean; recent: PlayRound[] };
export type PlayBet = {
  id: string; asset: string; tf: string; roundId: number; side: Side; amount: number; placedAt: number;
  status: "OPEN" | "WON" | "LOST" | "REFUND"; payout: number;
};
export type PlayAccount = {
  address: string; balance: number; open: PlayBet[]; settled: PlayBet[];
  stats: { bets: number; wagered: number; returned: number; wins: number };
};

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const r = await fetch(API + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}

export function useMarkets(ms = 2000) {
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      call<Market[]>("/play/markets")
        .then((m) => { if (!stop) { setMarkets(m); setError(null); } })
        .catch((e) => !stop && setError(e.message));
    load();
    const t = setInterval(load, ms);
    return () => { stop = true; clearInterval(t); };
  }, [ms]);
  return { markets, error };
}

const KEY = (a: string) => `haze-session-${a.toLowerCase()}`;

/** Wallet session: sign a free message once, then bet with the returned token. */
export function useSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<PlayAccount | null>(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    setAccount(null);
    if (!address) return setToken(null);
    try {
      const s = JSON.parse(localStorage.getItem(KEY(address)) || "null");
      setToken(s && s.expires > Date.now() ? s.token : null);
    } catch { setToken(null); }
  }, [address]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try { setAccount(await call<PlayAccount>("/play/account", { token })); }
    catch (e) {
      if ((e as Error).message === "sign in" && address) { localStorage.removeItem(KEY(address)); setToken(null); }
    }
  }, [token, address]);

  useEffect(() => {
    refresh();
    if (!token) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [token, refresh]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigning(true);
    try {
      const { nonce, message } = await call<{ nonce: string; message: string }>(`/auth/nonce?address=${address}`);
      const signature = await signMessageAsync({ message });
      const s = await call<{ token: string; expires: number }>("/auth/verify", { method: "POST", body: JSON.stringify({ address, nonce, signature }) });
      try { localStorage.setItem(KEY(address), JSON.stringify(s)); } catch {}
      setToken(s.token);
    } finally {
      setSigning(false);
    }
  }, [address, signMessageAsync]);

  const bet = useCallback(async (asset: string, timeframe: string, side: Side, amount: number) => {
    if (!token) throw new Error("sign in first");
    const r = await call<{ balance: number }>("/play/bet", { method: "POST", token, body: JSON.stringify({ asset, timeframe, side, amount }) });
    await refresh();
    return r;
  }, [token, refresh]);

  const faucet = useCallback(async () => {
    if (!token) return;
    await call("/play/faucet", { method: "POST", token, body: "{}" });
    await refresh();
  }, [token, refresh]);

  return { address, isConnected, signedIn: !!token, account, signing, signIn, bet, faucet };
}
