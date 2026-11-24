import { Button, Stack, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useRouteError } from 'react-router';
import { MascotIllustration } from '@/components/illustrations/MascotIllustration';

function StatusPage({ code, title, text }: { code: string; title: string; text: string }) {
  const navigate = useNavigate();
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 8 }} component={motion.div} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <MascotIllustration size={180} mood="thinking" />
      <Typography variant="overline" color="primary">
        {code}
      </Typography>
      <Typography variant="h3">{title}</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 460 }}>
        {text}
      </Typography>
      <Button variant="contained" startIcon={<ArrowLeft size={18} />} onClick={() => navigate('/')}>
        Back to dashboard
      </Button>
    </Stack>
  );
}

export const ForbiddenPage = () => (
  <StatusPage code="403" title="You don't have access to this" text="Your role does not include permission for this module. Ask an administrator if you need access." />
);

/** Route-level error boundary: keeps a render crash from showing a raw stack trace. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'Something went wrong while showing this page.';
  return (
    <Stack spacing={2} sx={{ py: 8, px: 2, alignItems: 'center', textAlign: 'center', minHeight: '100vh', justifyContent: 'center' }}>
      <MascotIllustration size={180} mood="thinking" />
      <Typography variant="h3">Oops, this page hit a snag</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520 }}>
        {message}
      </Typography>
      <Button variant="contained" startIcon={<RefreshCw size={18} />} onClick={() => window.location.assign('/')}>
        Reload Tally Monitor
      </Button>
    </Stack>
  );
}

export const NotFoundPage = () => <StatusPage code="404" title="We couldn't find that page" text="The page you're looking for doesn't exist or has moved." />;
