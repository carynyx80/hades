"use client";
import { motion, useScroll, useTransform } from "framer-motion";

/** Drifting blurred orbs behind the hero. */
export function AuraBackground() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, 200]);
  const o = useTransform(scrollY, [0, 700], [1, 0.25]);
  const orbs = [
    { c: "#7b5cff", x: "-10%", y: "-10%", s: 620, d: 22 },
    { c: "#3fd0ff", x: "55%", y: "0%", s: 520, d: 26 },
    { c: "#ff7ad9", x: "25%", y: "35%", s: 460, d: 30 },
  ];
  return (
    <motion.div style={{ y, opacity: o }} className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {orbs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-[120px]"
          style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c, opacity: 0.28 }}
          animate={{ x: [0, 60, -40, 0], y: [0, -50, 40, 0], scale: [1, 1.12, 0.94, 1] }}
          transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--color-ink)_80%)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
    </motion.div>
  );
}
