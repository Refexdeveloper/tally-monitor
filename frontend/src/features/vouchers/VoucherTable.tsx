import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Scale } from 'lucide-react';
import type { VoucherPreview } from '@/api/accountingTypes';
import { formatMoney } from '@/utils/format';

/** Ledger | Debit | Credit accounting preview with totals and balance check. */
export function VoucherTable({ entries, currency, totalDebit, totalCredit, balanced }: { entries: VoucherPreview['entries']; currency: string; totalDebit: string; totalCredit: string; balanced: boolean }) {
  const theme = useTheme();
  const zero = (v: string) => Number(v) === 0;
  return (
    <Table size="small" sx={{ '& td, & th': { borderColor: theme.palette.divider } }}>
      <TableHead>
        <TableRow>
          <TableCell>Ledger</TableCell>
          <TableCell align="right">Debit</TableCell>
          <TableCell align="right">Credit</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map((e, i) => (
          <TableRow key={`${e.ledger}-${i}`} sx={{ bgcolor: e.role === 'CREDIT' ? alpha(theme.palette.primary.main, 0.04) : undefined }}>
            <TableCell sx={{ pl: e.role === 'CREDIT' ? 4 : 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {e.role === 'CREDIT' ? 'To ' : ''}
                {e.ledger}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                {e.role === 'TAX' && <Chip size="small" label="tax" sx={{ height: 18 }} />}
                {e.costCentre && <Chip size="small" variant="outlined" label={`CC: ${e.costCentre}`} sx={{ height: 18 }} />}
                {e.billReference && <Chip size="small" variant="outlined" label={`Bill: ${e.billReference}`} sx={{ height: 18 }} />}
              </Stack>
            </TableCell>
            <TableCell align="right">{zero(e.debit) ? '' : formatMoney(e.debit, currency)}</TableCell>
            <TableCell align="right">{zero(e.credit) ? '' : formatMoney(e.credit, currency)}</TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell>
            <Chip size="small" icon={<Scale size={14} />} color={balanced ? 'success' : 'error'} label={balanced ? 'Debit = Credit' : 'Not balanced'} />
          </TableCell>
          <TableCell align="right" sx={{ fontWeight: 700 }}>
            {formatMoney(totalDebit, currency)}
          </TableCell>
          <TableCell align="right" sx={{ fontWeight: 700 }}>
            {formatMoney(totalCredit, currency)}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
