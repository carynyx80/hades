export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="hz" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#d9cfff" />
            <stop offset="1" stopColor="#7de3ff" />
          </linearGradient>
        </defs>
        <path d="M4 11c4-3 8-3 12 0s8 3 12 0" stroke="url(#hz)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M4 17c4-3 8-3 12 0s8 3 12 0" stroke="url(#hz)" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".7" />
        <path d="M4 23c4-3 8-3 12 0s8 3 12 0" stroke="url(#hz)" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".4" />
      </svg>
      <span className="text-[19px] font-semibold tracking-tight">primar</span>
    </span>
  );
}
