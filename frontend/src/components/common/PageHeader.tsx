import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

export function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: { label: string; to?: string }[];
  icon?: ReactNode;
}) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', mb: 3 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
        {icon}
        <Box sx={{ minWidth: 0 }}>
          {crumbs && (
            <Breadcrumbs separator={<ChevronRight size={14} />} sx={{ mb: 0.5, '& .MuiBreadcrumbs-li': { fontSize: 13 } }}>
              {crumbs.map((c) =>
                c.to ? (
                  <Link key={c.label} component={RouterLink} to={c.to} underline="hover" color="text.secondary">
                    {c.label}
                  </Link>
                ) : (
                  <Typography key={c.label} variant="body2" color="text.primary">
                    {c.label}
                  </Typography>
                ),
              )}
            </Breadcrumbs>
          )}
          <Typography variant="h3" noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {actions && (
        <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
