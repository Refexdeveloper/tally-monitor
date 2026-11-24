import { Box, Typography } from '@mui/material';

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 64 64" sx={{ width: size, height: size, flexShrink: 0, filter: 'drop-shadow(0 6px 12px rgba(79,70,229,0.35))' }}>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#logo-g)" />
      <path d="M17 21h30v7H35.5v19h-7V28H17z" fill="#FFFFFF" />
      <path d="M11 41h7l3-6 4 11 3-5h5" stroke="#C7D2FE" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
      <circle cx="48" cy="45" r="6" fill="#FF8A3D" stroke="#FFFFFF" strokeWidth="2" />
    </Box>
  );
}

export function Logo({ collapsed = false, inverse = false }: { collapsed?: boolean; inverse?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <LogoMark size={collapsed ? 38 : 40} />
      {!collapsed && (
        <Box sx={{ lineHeight: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1, color: inverse ? '#FFFFFF' : 'text.primary' }}>
            Tally Monitor
          </Typography>
          <Typography variant="caption" sx={{ color: inverse ? 'rgba(255,255,255,0.72)' : 'text.secondary', letterSpacing: 0.3 }}>
            Expense ⇄ TallyPrime
          </Typography>
        </Box>
      )}
    </Box>
  );
}
