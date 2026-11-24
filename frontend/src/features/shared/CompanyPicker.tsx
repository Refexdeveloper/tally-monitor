import { MenuItem, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { companiesApi } from '@/api/adminEndpoints';

/** Company selection kept in the URL (?company=) so pages are linkable and data never mixes across companies. */
export function useSelectedCompany() {
  const [params, setParams] = useSearchParams();
  const companies = useQuery({ queryKey: ['companies', 'picker'], queryFn: () => companiesApi.list({ pageSize: 100, sort: 'name', order: 'asc' }) });
  const selected = params.get('company') ?? '';
  const items = companies.data?.items ?? [];

  useEffect(() => {
    if (!selected && items.length) {
      const next = new URLSearchParams(params);
      next.set('company', items[0]!.id);
      setParams(next, { replace: true });
    }
  }, [selected, items, params, setParams]);

  const setCompany = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('company', id);
    setParams(next, { replace: true });
  };
  return { companyId: selected || null, company: items.find((c) => c.id === selected) ?? null, companies: items, loading: companies.isLoading, setCompany };
}

export function CompanyPicker({ value, companies, onChange }: { value: string | null; companies: { id: string; name: string; code: string }[]; onChange: (id: string) => void }) {
  return (
    <TextField
      select
      size="small"
      label="Company"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 280 }}
      slotProps={{ input: { startAdornment: <Building2 size={16} style={{ marginRight: 8 }} /> } }}
    >
      {companies.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.name} ({c.code})
        </MenuItem>
      ))}
    </TextField>
  );
}
