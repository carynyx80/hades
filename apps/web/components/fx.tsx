"use client";
import { motion, useInView, useMotionValue, useScroll, useSpring, useTransform, animate, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Button that leans toward the cursor. */
export function Magnetic({ children, strength = 0.35 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 200, damping: 15 });
  const y = useSpring(0, { stiffness: 200, damping: 15 });
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className="inline-block"
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/** Card with a soft light that follows the cursor. */
export function Spotlight({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  const bg = useTransform([mx, my] as MotionValue[], ([x, y]) => `radial-gradient(420px circle at ${x}px ${y}px, rgba(185,166,255,0.16), transparent 60%)`);
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onMouseLeave={() => { mx.set(-400); my.set(-400); }}
      className={`group relative overflow-hidden ${className}`}
    >
      <motion.div className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ background: bg }} />
      {children}
    </div>
  );
}

/** Number that counts up when scrolled into view. */
export function Counter({ to, suffix = "", duration = 1.8 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (n) => setV(n) });
    return () => c.stop();
  }, [inView, to, duration]);
  return <span ref={ref}>{Math.round(v).toLocaleString("en-US")}{suffix}</span>;
}

/** Paragraph whose words light up as it scrolls through the viewport. */
export function ScrollText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>{w}</Word>
      ))}
    </p>
  );
}

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.12, 1]);
  const blur = useTransform(progress, range, [4, 0]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  const accent = /^(unseen|invisible|primar\.?|nobody|you\.?)$/i.test(children);
  return (
    <motion.span style={{ opacity, filter }} className={`mr-[0.25em] inline-block ${accent ? "font-serif italic text-gradient" : ""}`}>
      {children}
    </motion.span>
  );
}
