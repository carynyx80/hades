/** Primar mark: a P whose bowl is an eclipse, a letter partly in shadow. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="primar-g" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#ECE6FF" />
          <stop offset="0.5" stopColor="#B9A6FF" />
          <stop offset="1" stopColor="#6FDCFF" />
        </linearGradient>
        <mask id="primar-eclipse">
          <rect width="512" height="512" fill="#fff" />
          <circle cx="296" cy="182" r="86" fill="#000" />
        </mask>
      </defs>
      <rect x="124" y="72" width="72" height="368" rx="36" fill="url(#primar-g)" />
      <circle cx="262" cy="206" r="134" fill="url(#primar-g)" mask="url(#primar-eclipse)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark />
      <span className="text-[19px] font-semibold tracking-tight">primar</span>
    </span>
  );
}
