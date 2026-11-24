import { motion, useReducedMotion } from 'framer-motion';

const FLOW_PATH = 'M150 150 C 230 120, 300 260, 380 280';

/** Cartoon of a cloud handing receipts across a bridge to a friendly ledger server. */
export function BridgeIllustration({ width = '100%' }: { width?: number | string }) {
  const reduce = useReducedMotion();
  const float = (delay: number, dy = 8) =>
    reduce ? {} : { animate: { y: [0, -dy, 0] }, transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const, delay } };

  return (
    <svg viewBox="0 0 520 440" width={width} role="img" aria-label="Kissflow expenses travelling securely into TallyPrime">
      <defs>
        <linearGradient id="bi-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E7E9FF" />
        </linearGradient>
        <linearGradient id="bi-server" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB27A" />
          <stop offset="1" stopColor="#FF7A45" />
        </linearGradient>
        <linearGradient id="bi-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1E1B4B" />
          <stop offset="1" stopColor="#312E81" />
        </linearGradient>
        <linearGradient id="bi-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
        <filter id="bi-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#1E1B4B" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* soft background blobs */}
      <circle cx="420" cy="90" r="70" fill="#FFFFFF" opacity="0.08" />
      <circle cx="90" cy="360" r="90" fill="#FFFFFF" opacity="0.06" />
      <circle cx="270" cy="230" r="150" fill="#FFFFFF" opacity="0.05" />

      {/* flow path */}
      <path d={FLOW_PATH} stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" fill="none" />

      {/* travelling coins and receipts */}
      {!reduce &&
        [0, 1.1, 2.2].map((begin, i) => (
          <g key={begin}>
            {i % 2 === 0 ? (
              <g>
                <circle r="13" fill="url(#bi-coin)" stroke="#B45309" strokeWidth="2" />
                <text y="5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#92400E" fontFamily="Poppins, sans-serif">
                  ₹
                </text>
              </g>
            ) : (
              <g>
                <rect x="-11" y="-14" width="22" height="28" rx="4" fill="#FFFFFF" stroke="#4F46E5" strokeWidth="2" />
                <path d="M-6 -6h12M-6 0h12M-6 6h7" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
              </g>
            )}
            <animateMotion dur="3.3s" begin={`${begin}s`} repeatCount="indefinite" path={FLOW_PATH} rotate="0" />
          </g>
        ))}

      {/* cloud with face */}
      <motion.g {...float(0)} filter="url(#bi-shadow)">
        <path
          d="M70 170c-26 0-44-18-44-40 0-21 17-38 38-39 6-27 30-46 58-46 27 0 50 18 57 43 24 1 43 20 43 43 0 22-19 39-42 39z"
          fill="url(#bi-cloud)"
        />
        <circle cx="102" cy="122" r="7" fill="#1E1B4B" />
        <circle cx="150" cy="122" r="7" fill="#1E1B4B" />
        <circle cx="104" cy="119" r="2.4" fill="#FFFFFF" />
        <circle cx="152" cy="119" r="2.4" fill="#FFFFFF" />
        <path d="M112 140q14 12 28 0" stroke="#1E1B4B" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="88" cy="138" r="7" fill="#FDA4AF" opacity="0.7" />
        <circle cx="164" cy="138" r="7" fill="#FDA4AF" opacity="0.7" />
      </motion.g>

      {/* ledger server with face */}
      <motion.g {...float(0.6, 6)} filter="url(#bi-shadow)">
        <rect x="340" y="250" width="150" height="150" rx="30" fill="url(#bi-server)" />
        <rect x="358" y="268" width="114" height="72" rx="14" fill="url(#bi-screen)" />
        <circle cx="390" cy="298" r="7" fill="#FFFFFF" />
        <circle cx="440" cy="298" r="7" fill="#FFFFFF" />
        <circle cx="392" cy="296" r="3" fill="#1E1B4B" />
        <circle cx="442" cy="296" r="3" fill="#1E1B4B" />
        <path d="M402 316q13 10 26 0" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" fill="none" />
        <rect x="358" y="352" width="70" height="10" rx="5" fill="#FFFFFF" opacity="0.85" />
        <rect x="358" y="370" width="46" height="10" rx="5" fill="#FFFFFF" opacity="0.55" />
        <circle cx="462" cy="366" r="12" fill="#10B981" stroke="#FFFFFF" strokeWidth="3" />
        <path d="M456 366l4 4 8-8" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </motion.g>

      {/* shield badge in the middle of the bridge */}
      <motion.g {...float(1.2, 10)} filter="url(#bi-shadow)">
        <path d="M262 168l40 14v30c0 26-17 44-40 52-23-8-40-26-40-52v-30z" fill="#FFFFFF" />
        <path d="M262 182l26 9v21c0 17-11 30-26 36-15-6-26-19-26-36v-21z" fill="#4F46E5" />
        <path d="M250 214l9 9 17-18" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </motion.g>

      {/* floating receipt card */}
      <motion.g {...float(0.3, 12)}>
        <rect x="380" y="60" width="104" height="120" rx="18" fill="#FFFFFF" filter="url(#bi-shadow)" />
        <rect x="396" y="80" width="48" height="10" rx="5" fill="#C7D2FE" />
        <rect x="396" y="100" width="72" height="8" rx="4" fill="#E0E7FF" />
        <rect x="396" y="116" width="60" height="8" rx="4" fill="#E0E7FF" />
        <rect x="396" y="140" width="40" height="22" rx="8" fill="#D1FAE5" />
        <path d="M406 151l5 5 10-10" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="462" cy="151" r="9" fill="#FFEDD5" />
      </motion.g>

      {/* sparkles */}
      {[
        [60, 60, 0],
        [300, 70, 0.8],
        [220, 390, 1.6],
        [500, 220, 2.2],
      ].map(([x, y, d]) => (
        <motion.path
          key={`${x}-${y}`}
          d={`M${x} ${y - 10}l3 7 7 3-7 3-3 7-3-7-7-3 7-3z`}
          fill="#FFFFFF"
          initial={{ opacity: 0.4, scale: 0.8 }}
          animate={reduce ? undefined : { opacity: [0.3, 1, 0.3], scale: [0.8, 1.15, 0.8] }}
          transition={{ duration: 2.6, repeat: Infinity, delay: d }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      ))}
    </svg>
  );
}
