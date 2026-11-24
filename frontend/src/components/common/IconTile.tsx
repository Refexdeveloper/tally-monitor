import { Box } from '@mui/material';
import type { LucideIcon } from 'lucide-react';

/** Glossy, slightly 3D icon tile used for the cartoon-style metric cards. */
export function IconTile({ icon: Icon, color, size = 48 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${Math.round(size * 0.32)}px`,
        display: 'grid',
        placeItems: 'center',
        color: '#FFFFFF',
        position: 'relative',
        background: `linear-gradient(145deg, ${color} 0%, ${color}CC 100%)`,
        boxShadow: `0 10px 18px -8px ${color}, inset 0 -4px 0 rgba(0,0,0,0.12), inset 0 3px 0 rgba(255,255,255,0.35)`,
        transform: 'rotate(-6deg)',
        flexShrink: 0,
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 6,
          left: 8,
          width: size * 0.32,
          height: size * 0.14,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.45)',
          transform: 'rotate(-12deg)',
        },
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </Box>
  );
}
