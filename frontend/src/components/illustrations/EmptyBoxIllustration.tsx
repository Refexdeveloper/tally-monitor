import { motion, useReducedMotion } from 'framer-motion';

export function EmptyBoxIllustration({ size = 120 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 160 140" width={size} height={(size * 140) / 160} aria-hidden>
      <ellipse cx="80" cy="128" rx="48" ry="7" fill="#1E1B4B" opacity="0.1" />
      <motion.g animate={reduce ? undefined : { y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
        <path d="M30 58l50-18 50 18v52l-50 18-50-18z" fill="#E0E7FF" />
        <path d="M80 76v52l-50-18V58z" fill="#C7D2FE" />
        <path d="M30 58l50 18 50-18" stroke="#A5B4FC" strokeWidth="2" fill="none" />
        <path d="M30 58l-12 18 50 18 12-18z" fill="#EEF2FF" stroke="#A5B4FC" strokeWidth="2" />
        <path d="M130 58l12 18-50 18-12-18z" fill="#EEF2FF" stroke="#A5B4FC" strokeWidth="2" />
        <circle cx="62" cy="100" r="4" fill="#1E1B4B" />
        <circle cx="74" cy="104" r="4" fill="#1E1B4B" />
        <path d="M62 112q6 4 12 2" stroke="#1E1B4B" strokeWidth="3" strokeLinecap="round" fill="none" />
      </motion.g>
      <motion.circle
        cx="118"
        cy="28"
        r="6"
        fill="#FF8A3D"
        animate={reduce ? undefined : { y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity }}
      />
      <motion.circle
        cx="40"
        cy="30"
        r="4"
        fill="#8B5CF6"
        animate={reduce ? undefined : { y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.8, repeat: Infinity, delay: 0.6 }}
      />
    </svg>
  );
}
