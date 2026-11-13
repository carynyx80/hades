"use client";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";
import { Logo } from "./logo";

export function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setSolid(v > 24));
  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <nav
        className={`flex w-full max-w-5xl items-center justify-between rounded-full px-5 py-2.5 transition-all duration-500 ${
          solid ? "glass shadow-2xl shadow-black/40" : "border border-transparent"
        }`}
      >
        <Link href="/"><Logo /></Link>
        <div className="hidden items-center gap-7 text-sm text-mist md:flex">
          <a href="#how" className="transition hover:text-white">How it works</a>
          <a href="#markets" className="transition hover:text-white">Markets</a>
          <a href="#privacy" className="transition hover:text-white">Privacy</a>
          <a href="#faq" className="transition hover:text-white">FAQ</a>
        </div>
        <Link
          href="/app"
          className="group relative overflow-hidden rounded-full bg-white px-4 py-2 text-sm font-medium text-ink transition hover:scale-[1.03]"
        >
          <span className="relative z-10">Launch app</span>
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-accent to-accent-2 transition-transform duration-500 group-hover:translate-x-0" />
        </Link>
      </nav>
    </motion.header>
  );
}
