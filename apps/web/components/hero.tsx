"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { HazeBackground } from "./haze-bg";
import { SplitHeading } from "./reveal";
import { LiveCard } from "./live-card";

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col items-center px-4 pt-36 pb-20 text-center">
      <HazeBackground />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="glass mb-8 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-mist"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
        </span>
        Launching on BNB Chain &amp; Robinhood Chain testnets
      </motion.div>

      <h1 className="max-w-5xl text-[clamp(2.8rem,8vw,6.8rem)] font-semibold leading-[0.95] tracking-[-0.045em]">
        <SplitHeading text="Call the move." />
        <br />
        <span className="font-serif font-normal italic tracking-[-0.02em] text-gradient">
          <SplitHeading text="Stay unseen." delay={0.25} />
        </span>
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ delay: 0.6, duration: 0.9 }}
        className="mt-7 max-w-xl text-balance text-lg text-mist"
      >
        Private Up/Down prediction markets on BTC, ETH, BNB and SOL. Rounds every 5 minutes to every day. Zero-knowledge
        proofs keep your wallet, your side and your size out of sight.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8 }}
        className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
      >
        <Link href="/app" className="ring-glow rounded-full bg-white px-7 py-3.5 font-medium text-ink transition hover:scale-[1.04]">
          Start predicting
        </Link>
        <a href="#how" className="glass rounded-full px-7 py-3.5 font-medium text-white/90 transition hover:bg-white/10">
          How it works
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 60, rotateX: 18 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: 1, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ perspective: 1200 }}
        className="mt-20 w-full max-w-4xl"
      >
        <LiveCard />
      </motion.div>
    </section>
  );
}
