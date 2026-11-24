import { Alert, AlertTitle, Box } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useToastStore, type Toast } from '@/stores/toast';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.severity === 'error' ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  return (
    <motion.div layout initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.96 }}>
      <Alert
        severity={toast.severity}
        variant="filled"
        onClose={() => dismiss(toast.id)}
        sx={{ borderRadius: 3, minWidth: 300, maxWidth: 420, boxShadow: '0 16px 40px -12px rgba(28,29,58,0.45)' }}
      >
        {toast.title && <AlertTitle sx={{ fontWeight: 700 }}>{toast.title}</AlertTitle>}
        {toast.message}
      </Alert>
    </motion.div>
  );
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <Box aria-live="polite" sx={{ position: 'fixed', top: 20, right: 20, zIndex: (t) => t.zIndex.snackbar, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </Box>
  );
}
