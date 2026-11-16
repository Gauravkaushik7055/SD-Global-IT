interface BrandLogoProps {
  compact?: boolean;
  lightText?: boolean;
}

export function BrandLogo({ compact = false, lightText = false }: BrandLogoProps) {
  return (
    <div className="flex items-center gap-2.5 shrink-0 select-none">
      <svg
        width="32"
        height="32"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="SD Global Logistics Emblem"
        className="shrink-0"
      >
        <rect width="36" height="36" rx="8" fill="#1D4ED8" />
        <path
          d="M8 13.5L18 8L28 13.5V22.5L18 28L8 22.5V13.5Z"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M18 8V18M18 18L28 13.5M18 18L8 13.5M18 18V28" stroke="white" strokeWidth="1.75" strokeLinejoin="round" />
        <circle cx="18" cy="18" r="2.2" fill="#93C5FD" />
      </svg>
      {!compact && (
        <div className="leading-tight whitespace-nowrap">
          <div className={`font-display text-sm font-bold tracking-tight ${lightText ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
            SD Global Logistics
          </div>
          <div className={`text-[11px] font-medium ${lightText ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>
            LogiCore IT CRM
          </div>
        </div>
      )}
    </div>
  );
}
