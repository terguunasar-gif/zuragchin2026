/** Zuragchin.mn лого — камерын диафрагм (линзний хаалт) */
export default function BrandMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Zuragchin.mn">
      <path d="M50.00 30.80L80.68 13.09A48 48 0 0 1 97.31 58.11L66.63 40.40Z" fill="#fbbf24" />
      <path d="M66.63 40.40L97.31 58.11A48 48 0 0 1 66.63 95.03L66.63 59.60Z" fill="#f59e0b" />
      <path d="M66.63 59.60L66.63 95.03A48 48 0 0 1 19.32 86.91L50.00 69.20Z" fill="#f59e0b" />
      <path d="M50.00 69.20L19.32 86.91A48 48 0 0 1 2.69 41.89L33.37 59.60Z" fill="#d97706" />
      <path d="M33.37 59.60L2.69 41.89A48 48 0 0 1 33.37 4.97L33.37 40.40Z" fill="#b45309" />
      <path d="M33.37 40.40L33.37 4.97A48 48 0 0 1 80.68 13.09L50.00 30.80Z" fill="#d97706" />
      <g stroke="#0c0a09" strokeWidth="2.16" strokeLinecap="round">
        <line x1="50.00" y1="30.80" x2="80.68" y2="13.09" />
        <line x1="66.63" y1="40.40" x2="97.31" y2="58.11" />
        <line x1="66.63" y1="59.60" x2="66.63" y2="95.03" />
        <line x1="50.00" y1="69.20" x2="19.32" y2="86.91" />
        <line x1="33.37" y1="59.60" x2="2.69" y2="41.89" />
        <line x1="33.37" y1="40.40" x2="33.37" y2="4.97" />
      </g>
      <polygon points="50.00,30.80 66.63,40.40 66.63,59.60 50.00,69.20 33.37,59.60 33.37,40.40" fill="#0c0a09" stroke="#0c0a09" strokeWidth="2.16" strokeLinejoin="round" />
      <circle cx="55.76" cy="44.24" r="3.60" fill="#fff" opacity="0.9" />
    </svg>
  );
}

/** Лого + «Zuragchin.mn» бичиг */
export function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const mark = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const text = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className={`${mark} flex-shrink-0`} />
      <span className={`font-brand font-semibold tracking-tight ${text}`}>
        <span className="text-white">Zuragchin</span><span className="text-amber-400">.mn</span>
      </span>
    </span>
  );
}
