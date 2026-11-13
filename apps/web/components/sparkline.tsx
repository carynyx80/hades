export function Sparkline({ data, up, w = 120, h = 36, fluid = false }: { data: number[]; up: boolean; w?: number; h?: number; fluid?: boolean }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / r) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const c = up ? "var(--color-up)" : "var(--color-down)";
  const id = `g${up ? "u" : "d"}${w}`;
  return (
    <svg width={fluid ? "100%" : w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity=".35" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
