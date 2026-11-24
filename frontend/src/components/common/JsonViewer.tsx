import { Box, IconButton, Tooltip } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Copy } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { toast } from '@/stores/toast';

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Read-only, syntax-highlighted JSON with copy. Renders text nodes only (no HTML injection). */
export function JsonViewer({ value, maxHeight = 420 }: { value: unknown; maxHeight?: number }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const text = useMemo(() => (typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'null'), [value]);
  const colors = { key: dark ? '#A5B4FC' : '#4338CA', string: dark ? '#6EE7B7' : '#047857', number: dark ? '#FDBA74' : '#C2410C', literal: dark ? '#F9A8D4' : '#BE185D' };

  const parts = useMemo(() => {
    if (text.length > 400_000) return [text];
    const out: (string | { t: string; c: string })[] = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN)) {
      if (m.index! > last) out.push(text.slice(last, m.index));
      if (m[1]) {
        out.push({ t: m[1], c: m[2] ? colors.key : colors.string });
        if (m[2]) out.push(m[2]);
      } else if (m[3]) out.push({ t: m[3], c: colors.literal });
      else if (m[4]) out.push({ t: m[4], c: colors.number });
      last = m.index! + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, colors.key, colors.string, colors.number, colors.literal]);

  return (
    <Box sx={{ position: 'relative' }}>
      <Tooltip title="Copy JSON">
        <IconButton
          size="small"
          onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Copied'), () => toast.error('Copy failed'))}
          sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper', zIndex: 1 }}
          aria-label="Copy JSON"
        >
          <Copy size={15} />
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          pr: 6,
          maxHeight,
          overflow: 'auto',
          borderRadius: 3,
          fontSize: 12.5,
          lineHeight: 1.55,
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          bgcolor: dark ? alpha('#000', 0.3) : alpha(theme.palette.primary.main, 0.04),
          border: `1px solid ${theme.palette.divider}`,
          color: 'text.primary',
        }}
      >
        {parts.map((p, i) => (typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : <span key={i} style={{ color: p.c }}>{p.t}</span>))}
      </Box>
    </Box>
  );
}
