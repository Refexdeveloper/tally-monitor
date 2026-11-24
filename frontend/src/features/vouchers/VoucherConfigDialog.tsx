import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Divider, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import type { LedgerRule, VoucherConfig, VoucherConfigInput } from '@/api/accountingTypes';
import { vouchersApi } from '@/api/accountingEndpoints';
import type { VoucherKind } from '@/api/adminTypes';
import { DialogHeader } from '@/components/common/Dialogs';
import { useApiMutation } from '@/hooks/useApiMutation';
import { VoucherTable } from './VoucherTable';

const KINDS: VoucherKind[] = ['PAYMENT', 'JOURNAL', 'RECEIPT', 'CONTRA', 'PURCHASE'];
const TEMPLATE_HELP = 'Placeholders: {{application}} {{applicationCode}} {{requestNumber}} {{sourceTransactionId}} {{employeeName}} {{employeeCode}} {{vendorName}} {{description}} {{category}} {{expenseDate}} {{companyCode}}';

type CreditSource = 'FIXED' | 'EMPLOYEE_LEDGER' | 'VENDOR_LEDGER';

function sample(template: string) {
  const vars: Record<string, string> = { application: 'Expense Management', applicationCode: 'EMS', requestNumber: 'Exp--FY26-009', sourceTransactionId: 'PkEMAn1Bjhya', employeeName: 'Murugesh Kumar', employeeCode: 'E1001', vendorName: '', description: 'Site visit', category: 'Food Claim', expenseDate: '2026-10-31', companyCode: 'VRPL' };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '').replace(/\s{2,}/g, ' ').trim();
}

export function VoucherConfigDialog({ companyId, config, onClose }: { companyId: string; config: VoucherConfig | null; onClose: () => void }) {
  const credit = config?.creditLedgerRule;
  const [kind, setKind] = useState<VoucherKind>(config?.voucherKind ?? 'JOURNAL');
  const [typeName, setTypeName] = useState(config?.tallyVoucherTypeName ?? 'Journal');
  const [numbering, setNumbering] = useState(config?.numberingMode ?? 'TALLY_AUTO');
  const [numberingTemplate, setNumberingTemplate] = useState(config?.numberingTemplate ?? '');
  const [debitFixed, setDebitFixed] = useState(config?.debitLedgerRule?.source === 'FIXED' ? (config.debitLedgerRule as { ledger: string }).ledger : '');
  const [creditSource, setCreditSource] = useState<CreditSource>((credit?.source as CreditSource) ?? 'FIXED');
  const [creditLedger, setCreditLedger] = useState(credit?.source === 'FIXED' ? credit.ledger : '');
  const [creditTemplate, setCreditTemplate] = useState(credit && 'template' in credit ? (credit.template ?? '') : '');
  const [partySource, setPartySource] = useState<'CREDIT_LEDGER' | 'NONE' | 'FIXED'>((config?.partyLedgerRule?.source as 'CREDIT_LEDGER') ?? 'CREDIT_LEDGER');
  const [partyLedger, setPartyLedger] = useState(config?.partyLedgerRule?.source === 'FIXED' ? (config.partyLedgerRule as { ledger: string }).ledger : '');
  const [taxLedger, setTaxLedger] = useState(config?.taxLedgerRule?.source === 'FIXED' ? (config.taxLedgerRule as { ledger: string }).ledger : '');
  const [narration, setNarration] = useState(config?.narrationTemplate ?? '{{application}} {{requestNumber}} - {{employeeName}}: {{description}}');
  const [reference, setReference] = useState(config?.referenceTemplate ?? '{{applicationCode}}/{{sourceTransactionId}}');
  const [costCentre, setCostCentre] = useState(config?.costCentreEnabled ?? false);
  const [billAlloc, setBillAlloc] = useState(config?.billAllocationEnabled ?? false);
  const [policy, setPolicy] = useState<'ALWAYS' | 'ABOVE_THRESHOLD'>(config?.approvalPolicy === 'ABOVE_THRESHOLD' ? 'ABOVE_THRESHOLD' : 'ALWAYS');
  const [threshold, setThreshold] = useState(config?.approvalThreshold ?? '');
  const [active, setActive] = useState(config?.isActive ?? true);

  const creditRule: LedgerRule = creditSource === 'FIXED' ? { source: 'FIXED', ledger: creditLedger.trim() } : { source: creditSource, template: creditTemplate.trim() || undefined };
  const body: VoucherConfigInput = {
    voucherKind: kind,
    tallyVoucherTypeName: typeName.trim(),
    numberingMode: numbering,
    numberingTemplate: numbering === 'TEMPLATE' ? numberingTemplate.trim() : null,
    debitLedgerRule: debitFixed.trim() ? { source: 'FIXED', ledger: debitFixed.trim() } : { source: 'LEDGER_MAPPING' },
    creditLedgerRule: creditRule,
    partyLedgerRule: partySource === 'FIXED' ? { source: 'FIXED', ledger: partyLedger.trim() } : { source: partySource },
    taxLedgerRule: taxLedger.trim() ? { source: 'FIXED', ledger: taxLedger.trim() } : { source: 'NONE' },
    narrationTemplate: narration.trim() || null,
    referenceTemplate: reference.trim() || null,
    costCentreEnabled: costCentre,
    billAllocationEnabled: billAlloc,
    approvalPolicy: policy,
    approvalThreshold: policy === 'ABOVE_THRESHOLD' ? threshold : null,
    isActive: active,
  };
  const save = useApiMutation(() => (config ? vouchersApi.updateConfig(config.id, body) : vouchersApi.createConfig({ ...body, companyId })), {
    success: config ? 'Voucher configuration saved' : 'Voucher configuration created',
    invalidate: [['voucher-configs'], ['voucher-rules'], ['ledgers']],
    onSuccess: onClose,
  });

  const creditName = creditSource === 'FIXED' ? creditLedger || '(credit ledger)' : sample(creditTemplate || (creditSource === 'EMPLOYEE_LEDGER' ? '{{employeeName}}' : '{{vendorName}}')) || '(party ledger)';
  const previewEntries = useMemo(
    () => [
      { ledger: debitFixed || 'Food & Refreshment (from mapping)', debit: taxLedger ? '450.00' : '500.00', credit: '0.00', costCentre: costCentre ? 'Ops' : null, billReference: null, role: 'EXPENSE' as const },
      ...(taxLedger ? [{ ledger: taxLedger, debit: '50.00', credit: '0.00', costCentre: null, billReference: null, role: 'TAX' as const }] : []),
      { ledger: debitFixed || 'Travelling and Conveyance Expenses (from mapping)', debit: '100.00', credit: '0.00', costCentre: costCentre ? 'Site' : null, billReference: null, role: 'EXPENSE' as const },
      { ledger: creditName, debit: '0.00', credit: '600.00', costCentre: null, billReference: billAlloc ? sample(reference) : null, role: 'CREDIT' as const },
    ],
    [debitFixed, taxLedger, costCentre, creditName, billAlloc, reference],
  );
  const valid = typeName.trim() && (creditSource !== 'FIXED' || creditLedger.trim()) && (partySource !== 'FIXED' || partyLedger.trim()) && (policy !== 'ABOVE_THRESHOLD' || /^\d+(\.\d{1,2})?$/.test(threshold)) && (numbering !== 'TEMPLATE' || numberingTemplate.trim());

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogHeader title={config ? `Edit ${config.tallyVoucherTypeName}` : 'New voucher configuration'} subtitle="Defines how expenses become Tally vouchers for this company. Nothing is hardcoded." onClose={onClose} />
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1.2fr 1fr' }, pt: 1 }}>
          <Stack spacing={2.5}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField select label="Voucher kind" value={kind} onChange={(e) => setKind(e.target.value as VoucherKind)}>
                {KINDS.map((k) => (
                  <MenuItem key={k} value={k}>
                    {k.charAt(0) + k.slice(1).toLowerCase()}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Tally voucher type name" value={typeName} onChange={(e) => setTypeName(e.target.value)} helperText="Exactly as in Tally, e.g. Journal or Expense Journal" />
              <TextField select label="Numbering" value={numbering} onChange={(e) => setNumbering(e.target.value as typeof numbering)}>
                <MenuItem value="TALLY_AUTO">Tally automatic</MenuItem>
                <MenuItem value="SOURCE_REFERENCE">Kissflow request number</MenuItem>
                <MenuItem value="TEMPLATE">Template</MenuItem>
              </TextField>
              {numbering === 'TEMPLATE' && <TextField label="Number template" value={numberingTemplate} onChange={(e) => setNumberingTemplate(e.target.value)} placeholder="{{companyCode}}-{{requestNumber}}" />}
            </Box>
            <Divider textAlign="left">
              <Typography variant="overline">Ledger rules</Typography>
            </Divider>
            <TextField label="Debit ledger override" value={debitFixed} onChange={(e) => setDebitFixed(e.target.value)} helperText="Leave empty to debit each line's mapped category ledger (recommended)" />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField select label="Credit side" value={creditSource} onChange={(e) => setCreditSource(e.target.value as CreditSource)}>
                <MenuItem value="FIXED">Fixed ledger (bank, payable, suspense)</MenuItem>
                <MenuItem value="EMPLOYEE_LEDGER">Employee party ledger</MenuItem>
                <MenuItem value="VENDOR_LEDGER">Vendor party ledger</MenuItem>
              </TextField>
              {creditSource === 'FIXED' ? (
                <TextField label="Credit ledger" value={creditLedger} onChange={(e) => setCreditLedger(e.target.value)} placeholder="Employee Reimbursements Payable" error={!creditLedger.trim()} />
              ) : (
                <TextField label="Party ledger name template" value={creditTemplate} onChange={(e) => setCreditTemplate(e.target.value)} placeholder={creditSource === 'EMPLOYEE_LEDGER' ? '{{employeeName}}' : '{{vendorName}}'} helperText={`e.g. ${sample(creditTemplate || '{{employeeName}}')}`} />
              )}
              <TextField select label="Party ledger" value={partySource} onChange={(e) => setPartySource(e.target.value as typeof partySource)}>
                <MenuItem value="CREDIT_LEDGER">Same as credit ledger</MenuItem>
                <MenuItem value="NONE">None</MenuItem>
                <MenuItem value="FIXED">Fixed ledger</MenuItem>
              </TextField>
              {partySource === 'FIXED' ? <TextField label="Party ledger name" value={partyLedger} onChange={(e) => setPartyLedger(e.target.value)} /> : <Box />}
              <TextField label="Tax ledger" value={taxLedger} onChange={(e) => setTaxLedger(e.target.value)} helperText="Optional; splits line tax into this ledger (e.g. Input GST)" sx={{ gridColumn: '1 / -1' }} />
            </Box>
            <Divider textAlign="left">
              <Typography variant="overline">Text & allocation</Typography>
            </Divider>
            <TextField label="Narration template" value={narration} onChange={(e) => setNarration(e.target.value)} helperText={TEMPLATE_HELP} multiline />
            <TextField label="Reference template" value={reference} onChange={(e) => setReference(e.target.value)} helperText="Unique per company; used for duplicate protection and read-back" />
            <Stack direction="row" spacing={3}>
              <FormControlLabel control={<Switch checked={costCentre} onChange={(e) => setCostCentre(e.target.checked)} />} label="Cost centre allocation" />
              <FormControlLabel control={<Switch checked={billAlloc} onChange={(e) => setBillAlloc(e.target.checked)} />} label="Bill allocation (new ref)" />
            </Stack>
            <Divider textAlign="left">
              <Typography variant="overline">Approval</Typography>
            </Divider>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField select label="Finance approval" value={policy} onChange={(e) => setPolicy(e.target.value as typeof policy)}>
                <MenuItem value="ALWAYS">Always required</MenuItem>
                <MenuItem value="ABOVE_THRESHOLD">Required above an amount</MenuItem>
              </TextField>
              {policy === 'ABOVE_THRESHOLD' && <TextField label="Threshold amount" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d.]/g, ''))} error={!/^\d+(\.\d{1,2})?$/.test(threshold)} />}
            </Box>
            <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
          </Stack>
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Sample voucher
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Food 500 (incl. tax 50 when a tax ledger is set) + Conveyance 100 for Murugesh Kumar.
            </Typography>
            <VoucherTable entries={previewEntries} currency="INR" totalDebit="600.00" totalCredit="600.00" balanced />
            <Stack spacing={0.75} sx={{ mt: 2 }}>
              <Typography variant="body2">
                <b>Type:</b> {typeName || '-'} ({kind.toLowerCase()})
              </Typography>
              <Typography variant="body2">
                <b>Narration:</b> {sample(narration)}
              </Typography>
              <Typography variant="body2">
                <b>Reference:</b> {sample(reference)}
              </Typography>
              <Typography variant="body2">
                <b>Approval:</b> {policy === 'ALWAYS' ? 'Always by Finance' : `Finance approval above ₹${threshold || '…'}`}
              </Typography>
            </Stack>
            <Alert severity="info" sx={{ mt: 2, borderRadius: 3 }}>
              Ledgers named here must exist in the company's Tally ledger list; validation raises master requests for any that do not.
            </Alert>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!valid || save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => save.mutate(undefined)}>
          {config ? 'Save configuration' : 'Create configuration'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
