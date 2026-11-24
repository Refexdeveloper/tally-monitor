import { Box, Typography } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { LogoMark } from './Logo';

export function LoadingScreen({ label = 'Loading Tally Monitor' }: { label?: string }) {
  const reduce = useReducedMotion();
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }} aria-busy aria-label={label}>
      <Box sx={{ textAlign: 'center' }}>
        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.08, 1], rotate: [0, 4, -4, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ display: 'inline-block' }}
        >
          <LogoMark size={64} />
        </motion.div>
        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 3 }}>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              style={{ width: 8, height: 8, borderRadius: 8, background: '#8B5CF6', display: 'block' }}
              animate={reduce ? undefined : { y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}
