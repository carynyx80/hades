"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { bsc } from "viem/chains";
import { robinhood } from "@/lib/wagmi";

const CHAIN_META: Record<number, { name: string; color: string }> = {
  [bsc.id]: { name: "BNB Chain", color: "#F3BA2F" },
  [robinhood.id]: { name: "Robinhood Chain", color: "#CCFF00" },
};

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function ChainSwitcher() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  return (
    <div className="hidden gap-1 rounded-full bg-white/5 p-1 sm:flex">
      {[bsc.id, robinhood.id].map((id) => (
        <button
          key={id}
          disabled={isPending}
          onClick={() => isConnected && switchChain({ chainId: id })}
          className="relative rounded-full px-3 py-1.5 text-xs"
          title={isConnected ? `Switch to ${CHAIN_META[id].name}` : "Connect a wallet to switch networks"}
        >
          {chainId === id && <motion.span layoutId="chainPill" className="absolute inset-0 rounded-full bg-white/10" />}
          <span className="relative flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: CHAIN_META[id].color }} />
            <span className={chainId === id ? "text-white" : "text-mist"}>{CHAIN_META[id].name}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ConnectButton() {
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (isConnected) setOpen(false); }, [isConnected]);

  // EIP-6963 wallets each appear as their own connector; hide the generic one when specific wallets exist.
  const list = connectors.filter((c) => !(c.id === "injected" && connectors.some((o) => o.type === "injected" && o.id !== "injected")));

  if (!mounted) return <div className="h-9 w-28 rounded-full bg-white/10" />;

  if (isConnected) {
    return (
      <div className="relative">
        <button onClick={() => setMenu((m) => !m)} className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-up" />
          <span className="font-mono">{short(address)}</span>
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              className="glass absolute right-0 top-12 z-50 w-56 rounded-2xl p-2 shadow-2xl"
            >
              <div className="px-3 py-2 text-xs text-mist">Connected with {connector?.name}</div>
              <button onClick={() => { navigator.clipboard?.writeText(address!); setMenu(false); }} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5">Copy address</button>
              <button onClick={() => { disconnect(); setMenu(false); }} className="w-full rounded-xl px-3 py-2 text-left text-sm text-down hover:bg-white/5">Disconnect</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => { reset(); setOpen(true); }} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink transition hover:scale-[1.03]">
        Connect wallet
      </button>
      {createPortal(<AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              onClick={(e) => e.stopPropagation()}
              className="glass ring-glow w-full max-w-sm rounded-3xl bg-ink-2/90 p-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Connect a wallet</h3>
                <button onClick={() => setOpen(false)} className="text-2xl leading-none text-mist hover:text-white">×</button>
              </div>
              <p className="mt-1 text-sm text-mist">BNB Chain and Robinhood Chain. Connecting sends no transaction.</p>
              <div className="mt-5 space-y-2">
                {list.map((c) => (
                  <button
                    key={c.uid}
                    disabled={isPending}
                    onClick={() => connect({ connector: c })}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-left transition hover:border-accent/40 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {c.icon ? <img src={c.icon} alt="" className="h-7 w-7 rounded-lg" /> : <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs">{c.name[0]}</span>}
                    <span className="font-medium">{c.id === "injected" ? "Browser wallet" : c.name}</span>
                  </button>
                ))}
                {list.length === 0 && <p className="text-sm text-mist">No wallet found. Install MetaMask, Rabby, Trust or the Robinhood Wallet extension.</p>}
              </div>
              {error && <p className="mt-3 text-sm text-down">{error.message.split("\n")[0]}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
