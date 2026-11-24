import { Box, InputAdornment, Stack, TextField } from '@mui/material';
import { Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** Debounced search box plus a slot for filter controls. */
export function SearchToolbar({ value, onChange, placeholder = 'Search...', children }: { value: string; onChange: (v: string) => void; placeholder?: string; children?: ReactNode }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return undefined;
    const t = setTimeout(() => onChange(draft), 350);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2.5, alignItems: { sm: 'center' } }}>
      <TextField
        size="small"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        sx={{ flex: 1, maxWidth: { sm: 380 } }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={17} /></InputAdornment> } }}
      />
      <Box sx={{ flex: 1 }} />
      {children}
    </Stack>
  );
}
