"use client";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import Link from "next/link";
import { Reveal } from "./reveal";
import { TIMEFRAMES, CHAINS, roundAt, fmtCountdown } from "@/lib/markets";
import { useNow } from "@/lib/use-prices";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-haze">{children}</div>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-balance text-[clamp(2rem,5vw,3.8rem)] font-semibold leading-[1] tracking-[-0.04em]">{children}</h2>;
}

const STEPS = [
  { n: "01", t: "Deposit into the haze", d: "Move USDT or USDG into the shielded pool. You get a secret note that only your device holds. Every deposit looks identical." },
  { n: "02", t: "Pick a round", d: "BTC, ETH, BNB or SOL. 5 minutes, 10, 15, an hour or a day. Will the price close higher or lower?" },
  { n: "03", t: "Bet with a proof", d: "Your browser proves you own funds in the pool without saying which. A relayer submits it, so your wallet never appears." },
  { n: "04", t: "Settle and vanish", d: "The oracle settles the round. Winners split the pool and claim to any fresh address, or roll winnings into the next round." },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const h = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  return (
    <section id="how" className="mx-auto max-w-6xl px-4 py-32">
      <Reveal className="max-w-2xl">
        <Eyebrow>How it works</Eyebrow>
        <H2>Four steps. <span className="font-serif font-normal italic text-mist">Zero trace.</span></H2>
      </Reveal>
      <div ref={ref} className="relative mt-20 grid gap-6 md:grid-cols-4">
        <div className="absolute left-0 right-0 top-[27px] hidden h-px bg-line md:block">
          <motion.div style={{ width: h }} className="h-px bg-gradient-to-r from-haze to-haze-2" />
        </div>
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.1}>
            <div className="relative">
              <div className="glass relative z-10 mb-6 flex h-14 w-14 items-center justify-center rounded-2xl font-mono text-sm text-haze">{s.n}</div>
              <h3 className="text-xl font-semibold tracking-tight">{s.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-mist">{s.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Markets() {
  const now = useNow();
  return (
    <section id="markets" className="mx-auto max-w-6xl px-4 py-32">
      <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <Eyebrow>Markets</Eyebrow>
          <H2>Always a round <span className="font-serif font-normal italic text-mist">about to close.</span></H2>
        </div>
        <p className="max-w-sm text-mist">Five timeframes on four assets: 20 rounds running at all times, aligned to the clock so everyone sees the same countdown.</p>
      </Reveal>
      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TIMEFRAMES.map((tf, i) => {
          const r = roundAt(tf, now);
          const prog = now ? (now - r.start) / tf.seconds : 0;
          return (
            <Reveal key={tf.id} delay={i * 0.08}>
              <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="glass group relative h-full overflow-hidden rounded-3xl p-6">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-haze/20 blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-0" />
                <div className="font-mono text-xs text-mist">{Math.round(86400 / tf.seconds)} rounds / day</div>
                <div className="mt-6 text-4xl font-semibold tracking-tight">{tf.id}</div>
                <div className="mt-1 text-sm text-mist">{tf.label} rounds</div>
                <div className="mt-8 h-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full bg-gradient-to-r from-haze to-haze-2 transition-[width] duration-1000 ease-linear" style={{ width: `${prog * 100}%` }} />
                </div>
                <div className="mt-2 flex justify-between font-mono text-xs">
                  <span className={r.open ? "text-up" : "text-mist"}>{r.open ? "open" : "locked"}</span>
                  <span className="text-mist">{fmtCountdown(r.end - now, now > 0)}</span>
                </div>
              </motion.div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function Privacy() {
  const rows = [
    { k: "Your wallet", pub: "0x7a3f…c91e", hz: "hidden" },
    { k: "Your side", pub: "UP", hz: "sealed until close" },
    { k: "Your stake", pub: "2,500 USDT", hz: "sealed until close" },
    { k: "Where winnings go", pub: "same wallet", hz: "any fresh address" },
  ];
  return (
    <section id="privacy" className="relative mx-auto max-w-6xl px-4 py-32">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>Privacy</Eyebrow>
          <H2>Public odds. <span className="font-serif font-normal italic text-gradient">Private traders.</span></H2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-mist">
            On a normal market, every bet is a billboard: whales get copied, winners get front-run, and your history follows
            your wallet forever. Haze uses zero-knowledge proofs and a shielded pool, so the market sees liquidity, not people.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Zero-knowledge proofs", "Shielded pool", "Relayed transactions", "Proof of innocence"].map((t) => (
              <span key={t} className="glass rounded-full px-3.5 py-1.5 text-sm text-white/80">{t}</span>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="glass ring-glow overflow-hidden rounded-3xl">
            <div className="grid grid-cols-[1.1fr_1fr_1fr] border-b border-line px-6 py-4 font-mono text-xs uppercase tracking-wider text-mist">
              <span>What others see</span><span>Other markets</span><span className="text-haze">Haze</span>
            </div>
            {rows.map((r, i) => (
              <motion.div
                key={r.k}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.12, duration: 0.6 }}
                className="grid grid-cols-[1.1fr_1fr_1fr] items-center border-b border-line px-6 py-5 text-sm last:border-0"
              >
                <span className="text-white/90">{r.k}</span>
                <span className="font-mono text-down/90">{r.pub}</span>
                <span className="flex items-center gap-2 text-up">
                  <span className="inline-block h-3 w-14 rounded-sm bg-gradient-to-r from-haze/60 to-haze-2/40 blur-[3px]" />
                  <span className="hidden text-xs sm:inline">{r.hz}</span>
                </span>
              </motion.div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Bento() {
  const cards = [
    { t: "Pooled payouts", d: "No house on the other side. Winners split the losing side, minus a 2% fee. One-sided rounds refund everyone.", span: "md:col-span-2" },
    { t: "Oracle settled", d: "Start and end prices come from Pyth and Chainlink feeds. Anyone can trigger settlement, so rounds never get stuck.", span: "" },
    { t: "Two chains, one app", d: "Same contracts on BNB Chain and Robinhood Chain. Switch networks without leaving the board.", span: "" },
    { t: "Fair cutoffs", d: "Betting closes before the end of every round — 1 minute for 5m, up to 1 hour for daily — so nobody bets on a known answer.", span: "md:col-span-2" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c, i) => (
          <Reveal key={c.t} delay={i * 0.08} className={c.span}>
            <motion.div whileHover={{ scale: 1.015 }} className="glass group relative h-full min-h-[220px] overflow-hidden rounded-3xl p-8">
              <div className="absolute inset-0 bg-[radial-gradient(400px_circle_at_var(--x,80%)_0%,rgba(185,166,255,.14),transparent_60%)]" />
              <h3 className="relative text-2xl font-semibold tracking-tight">{c.t}</h3>
              <p className="relative mt-3 max-w-md leading-relaxed text-mist">{c.d}</p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Chains() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <Reveal className="text-center">
        <Eyebrow>Networks</Eyebrow>
        <H2>Built for two chains.</H2>
      </Reveal>
      <div className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-2">
        {CHAINS.map((c, i) => (
          <Reveal key={c.id} delay={i * 0.1}>
            <div className="glass relative overflow-hidden rounded-3xl p-8">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: c.color, opacity: 0.18 }} />
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl font-mono text-sm font-bold text-ink" style={{ background: c.color }}>{c.short.slice(0, 2)}</div>
              <div className="mt-6 text-2xl font-semibold tracking-tight">{c.name}</div>
              <div className="mt-1 font-mono text-xs text-mist">chain id {c.id} · testnet (coming soon)</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const FAQS = [
  { q: "What exactly is private?", a: "Who placed a bet is never visible: bets come from the shielded pool through a relayer. Side and stake are sealed until the round closes, then only the totals matter for payouts." },
  { q: "How are winners paid?", a: "Rounds are parimutuel: everyone on the winning side shares the losing side's stakes in proportion to their stake, minus a 2% protocol fee. If one side is empty, every stake is refunded." },
  { q: "Where do prices come from?", a: "Pyth price feeds on both chains, with Chainlink as a cross-check on BNB Chain. The start and end prices are recorded on-chain for every round." },
  { q: "Is it live with real money?", a: "Not yet. Haze launches on testnets first while the contracts and zero-knowledge circuits are audited. Mainnet comes after the audit." },
  { q: "Can privacy be abused?", a: "Haze supports proof of innocence: users can prove their deposit is not linked to sanctioned addresses without revealing who they are." },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-32">
      <Reveal className="text-center"><Eyebrow>FAQ</Eyebrow><H2>Questions, answered.</H2></Reveal>
      <div className="mt-14 space-y-3">
        {FAQS.map((f, i) => (
          <Reveal key={f.q} delay={i * 0.05}>
            <button onClick={() => setOpen(open === i ? null : i)} className="glass w-full rounded-2xl px-6 py-5 text-left">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">{f.q}</span>
                <motion.span animate={{ rotate: open === i ? 45 : 0 }} className="text-2xl leading-none text-mist">+</motion.span>
              </div>
              <motion.div initial={false} animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }} className="overflow-hidden">
                <p className="pt-3 leading-relaxed text-mist">{f.a}</p>
              </motion.div>
            </button>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section className="px-4 py-24">
      <Reveal>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[40px] border border-line px-6 py-24 text-center">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(123,92,255,.45),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(63,208,255,.3),transparent_55%)]" />
          <h2 className="text-[clamp(2.4rem,6vw,5rem)] font-semibold leading-[0.95] tracking-[-0.045em]">
            Disappear into <span className="font-serif font-normal italic">the haze.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-mist">The next 5-minute round is already counting down.</p>
          <Link href="/app" className="mt-10 inline-block rounded-full bg-white px-8 py-4 font-medium text-ink transition hover:scale-[1.04]">Launch app</Link>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-sm text-mist md:flex-row">
        <span>© {new Date().getFullYear()} Haze. Testnet software. Not available where prohibited.</span>
        <div className="flex gap-6">
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#faq" className="hover:text-white">FAQ</a>
          <a href="https://github.com/carynyx80/hades" className="hover:text-white">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
