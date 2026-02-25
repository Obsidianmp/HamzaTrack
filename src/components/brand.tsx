export function Brand({
  compact = false,
  subtitle
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <div className="brand-mark" aria-hidden>
        <svg viewBox="0 0 48 48" width="100%" height="100%" role="img">
          <defs>
            <linearGradient id="hamzaTrackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#14b8a6" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#hamzaTrackGrad)" />
          <path
            d="M11 31h6l4-11 5 15 5-14 3 10h3"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="brand-copy">
        <div className="brand-title">HamzaTrack</div>
        {subtitle ? <div className="brand-subtitle">{subtitle}</div> : null}
      </div>
    </div>
  );
}
