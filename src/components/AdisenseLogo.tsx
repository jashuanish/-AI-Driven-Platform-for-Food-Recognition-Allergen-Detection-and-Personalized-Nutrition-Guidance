interface AdisenseLogoProps {
  className?: string;
  showWordmark?: boolean;
  stacked?: boolean;
}

export default function AdisenseLogo({ className = "", showWordmark = false, stacked = false }: AdisenseLogoProps) {
  return (
    <div className={`inline-flex ${stacked ? "flex-col items-center gap-2" : "items-center gap-3"}`}>
      <svg viewBox="0 0 260 260" className={`block shrink-0 ${className}`} aria-hidden="true" role="img" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="adisense-logo-gradient" x1="56" y1="40" x2="204" y2="206" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        <path
          d="M130 34L206 168c6 10 7 22 2 33s-16 18-28 18H80c-12 0-23-7-28-18s-4-23 2-33L130 34Z"
          fill="none"
          stroke="url(#adisense-logo-gradient)"
          strokeWidth="14"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M122 163c-1-14 3-28 12-40 8-11 20-18 34-22-2 11-7 21-15 30-4 5-9 9-14 13 3-1 6-1 10 0 4 1 8 3 12 6-8 6-17 10-27 10h-12Z"
          fill="none"
          stroke="url(#adisense-logo-gradient)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M128 119c-5 8-8 16-8 25"
          fill="none"
          stroke="url(#adisense-logo-gradient)"
          strokeWidth="9"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark && <span className="font-bold tracking-[0.34em] uppercase leading-none text-current">Adisense</span>}
    </div>
  );
}