import { motion, useReducedMotion } from 'framer-motion';

/** Friendly "ledger bot" mascot used on the welcome banner and module pages. */
export function MascotIllustration({ size = 180, mood = 'happy' }: { size?: number; mood?: 'happy' | 'thinking' }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      animate={reduce ? undefined : { y: [0, -6, 0] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        <linearGradient id="mi-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E0E7FF" />
        </linearGradient>
        <linearGradient id="mi-book" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB27A" />
          <stop offset="1" stopColor="#FF7A45" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="186" rx="52" ry="8" fill="#1E1B4B" opacity="0.15" />
      {/* antenna */}
      <line x1="100" y1="34" x2="100" y2="52" stroke="#C7D2FE" strokeWidth="5" strokeLinecap="round" />
      <motion.circle
        cx="100"
        cy="28"
        r="9"
        fill="#FF8A3D"
        animate={reduce ? undefined : { scale: [1, 1.25, 1] }}
        transition={{ duration: 1.6, repeat: Infinity }}
        style={{ transformOrigin: '100px 28px' }}
      />
      {/* head */}
      <rect x="46" y="50" width="108" height="82" rx="34" fill="url(#mi-body)" stroke="#C7D2FE" strokeWidth="3" />
      <rect x="62" y="66" width="76" height="48" rx="22" fill="#1E1B4B" />
      {mood === 'happy' ? (
        <>
          <path d="M80 90q6-8 12 0" stroke="#A5F3FC" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M108 90q6-8 12 0" stroke="#A5F3FC" strokeWidth="5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="86" cy="89" r="6" fill="#A5F3FC" />
          <circle cx="114" cy="89" r="6" fill="#A5F3FC" />
        </>
      )}
      <path d="M90 102q10 7 20 0" stroke="#A5F3FC" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="58" cy="104" r="6" fill="#FDA4AF" opacity="0.7" />
      <circle cx="142" cy="104" r="6" fill="#FDA4AF" opacity="0.7" />
      {/* body */}
      <rect x="64" y="132" width="72" height="44" rx="18" fill="url(#mi-body)" stroke="#C7D2FE" strokeWidth="3" />
      {/* ledger book held in front */}
      <motion.g
        animate={reduce ? undefined : { rotate: [-3, 3, -3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '100px 156px' }}
      >
        <rect x="74" y="138" width="52" height="38" rx="8" fill="url(#mi-book)" />
        <rect x="80" y="146" width="28" height="5" rx="2.5" fill="#FFFFFF" opacity="0.9" />
        <rect x="80" y="156" width="20" height="5" rx="2.5" fill="#FFFFFF" opacity="0.6" />
        <circle cx="116" cy="164" r="6" fill="#10B981" stroke="#FFFFFF" strokeWidth="2" />
      </motion.g>
      {/* arms */}
      <path d="M64 146q-16 4-14 22" stroke="#C7D2FE" strokeWidth="8" strokeLinecap="round" fill="none" />
      <motion.path
        d="M136 146q18-6 22-24"
        stroke="#C7D2FE"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
        animate={reduce || mood !== 'happy' ? undefined : { rotate: [0, -14, 0, -14, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}
        style={{ transformOrigin: '136px 146px' }}
      />
    </motion.svg>
  );
}
