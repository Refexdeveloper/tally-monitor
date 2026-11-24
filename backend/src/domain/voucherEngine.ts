/**
 * Builds a Tally voucher draft from a normalized expense. Pure and
 * deterministic: no I/O, all money in integer cents.
 */
import { fromCents, toCents } from './mapping';

export const SUPPORTED_KINDS = ['PAYMENT', 'JOURNAL', 'RECEIPT', 'CONTRA', 'PURCHASE'] as const;

export type LedgerRule =
  | { source: 'LEDGER_MAPPING' }
  | { source: 'FIXED'; ledger: string }
  | { source: 'EMPLOYEE_LEDGER'; template?: string }
  | { source: 'VENDOR_LEDGER'; template?: string }
  | { source: 'NONE' }
  | { source: 'CREDIT_LEDGER' };

export interface VoucherConfigInput {
  id?: string;
  voucherKind: string;
  tallyVoucherTypeName: string;
  numberingMode: 'TALLY_AUTO' | 'SOURCE_REFERENCE' | 'TEMPLATE';
  numberingTemplate: string | null;
  debitLedgerRule: LedgerRule | null;
  creditLedgerRule: LedgerRule | null;
  partyLedgerRule: LedgerRule | null;
  taxLedgerRule: LedgerRule | null;
  narrationTemplate: string | null;
  referenceTemplate: string | null;
  costCentreEnabled: boolean;
  billAllocationEnabled: boolean;
  approvalPolicy: 'ALWAYS' | 'ABOVE_THRESHOLD' | 'NEVER';
  approvalThreshold: string | null;
  isActive: boolean;
}

export interface EngineInput {
  expense: {
    sourceTransactionId: string;
    requestNumber: string | null;
    expenseDate: string;
    employeeName: string | null;
    employeeCode: string | null;
    vendorName: string | null;
    description: string | null;
    category: string | null;
    amount: string;
    taxAmount: string;
    currency: string;
    costCentre: string | null;
  };
  lines: { lineNo: number; category: string | null; description: string | null; amount: string; taxAmount: string; costCentre: string | null }[];
  application: { name: string; code: string };
  company: { code: string; name: string; defaultCurrency: string };
  config: VoucherConfigInput | null;
  /** Active mappings for the company; application-scoped ones take precedence. */
  ledgerMappings: { applicationScoped: boolean; sourceCategory: string; tallyLedgerName: string; costCentre: string | null }[];
  /** Names of active ledger masters known for the company. */
  ledgerNames: string[];
}

export type IssueCode =
  | 'VOUCHER_CONFIG_MISSING'
  | 'VOUCHER_CONFIG_INACTIVE'
  | 'VOUCHER_KIND_UNSUPPORTED'
  | 'CURRENCY_UNSUPPORTED'
  | 'MAPPING_MISSING'
  | 'LEDGER_MISSING'
  | 'RULE_INCOMPLETE'
  | 'UNBALANCED'
  | 'ZERO_AMOUNT'
  | 'TAX_EXCEEDS_LINE'
  | 'TAX_NOT_SPLIT';

export interface EngineIssue {
  code: IssueCode;
  severity: 'error' | 'warning';
  message: string;
  category?: string | null;
  ledger?: string;
}

export interface RequiredMaster {
  masterType: 'LEDGER' | 'PARTY_LEDGER';
  name: string;
  proposedParent: string;
  reason: string;
  category?: string | null;
}

export interface VoucherEntry {
  ledger: string;
  debit: string;
  credit: string;
  costCentre: string | null;
  billReference: string | null;
  role: 'EXPENSE' | 'TAX' | 'CREDIT';
}

export interface VoucherDraft {
  voucherKind: string | null;
  voucherType: string | null;
  voucherDate: string;
  voucherNumber: string | null;
  reference: string;
  narration: string;
  partyLedger: string | null;
  entries: VoucherEntry[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
  approvalRequired: boolean;
  issues: EngineIssue[];
  requiredMasters: RequiredMaster[];
  /** Outcome for the job state machine. */
  outcome: 'OK' | 'MAPPING_REQUIRED' | 'MASTER_CREATION_REQUIRED' | 'VALIDATION_FAILED';
}

const norm = (s: string) => s.trim().toLowerCase();

export function renderTemplate(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => (vars[key] ?? '').toString()).replace(/\s{2,}/g, ' ').trim();
}

export function buildVoucher(input: EngineInput): VoucherDraft {
  const { expense: e, config: cfg } = input;
  const issues: EngineIssue[] = [];
  const required: RequiredMaster[] = [];
  const known = new Set(input.ledgerNames.map(norm));
  const vars = {
    application: input.application.name,
    applicationCode: input.application.code,
    companyCode: input.company.code,
    requestNumber: e.requestNumber ?? e.sourceTransactionId,
    sourceTransactionId: e.sourceTransactionId,
    employeeName: e.employeeName,
    employeeCode: e.employeeCode,
    vendorName: e.vendorName,
    description: e.description,
    category: e.category,
    expenseDate: e.expenseDate,
    amount: e.amount,
  };

  const reference = renderTemplate(cfg?.referenceTemplate || '{{applicationCode}}/{{sourceTransactionId}}', vars).slice(0, 200);
  const narration = renderTemplate(cfg?.narrationTemplate || '{{application}} {{requestNumber}} - {{employeeName}}: {{description}}', vars).slice(0, 1000);

  const needLedger = (name: string, masterType: RequiredMaster['masterType'], proposedParent: string, reason: string, category?: string | null) => {
    if (known.has(norm(name))) return;
    issues.push({ code: 'LEDGER_MISSING', severity: 'error', message: `Ledger "${name}" does not exist in ${input.company.name}`, ledger: name, category });
    if (!required.some((r) => norm(r.name) === norm(name))) required.push({ masterType, name, proposedParent, reason, category });
  };

  if (!cfg) issues.push({ code: 'VOUCHER_CONFIG_MISSING', severity: 'error', message: `No voucher configuration applies to ${input.application.name} in ${input.company.name}` });
  else {
    if (!cfg.isActive) issues.push({ code: 'VOUCHER_CONFIG_INACTIVE', severity: 'error', message: `Voucher configuration "${cfg.tallyVoucherTypeName}" is inactive` });
    if (!(SUPPORTED_KINDS as readonly string[]).includes(cfg.voucherKind)) issues.push({ code: 'VOUCHER_KIND_UNSUPPORTED', severity: 'error', message: `${cfg.voucherKind} vouchers are not supported yet` });
  }
  if (e.currency !== input.company.defaultCurrency) {
    issues.push({ code: 'CURRENCY_UNSUPPORTED', severity: 'error', message: `Expense currency ${e.currency} differs from company currency ${input.company.defaultCurrency}; foreign-currency posting is not supported yet` });
  }
  if (toCents(e.amount) <= 0n) issues.push({ code: 'ZERO_AMOUNT', severity: 'error', message: 'Expense amount must be greater than zero' });

  // --- Debit side ---------------------------------------------------------------
  const debitRule = cfg?.debitLedgerRule ?? { source: 'LEDGER_MAPPING' as const };
  const taxRule = cfg?.taxLedgerRule ?? { source: 'NONE' as const };
  const debits = new Map<string, { ledger: string; cents: bigint; costCentre: string | null; role: 'EXPENSE' | 'TAX' }>();
  const addDebit = (ledger: string, cents: bigint, costCentre: string | null, role: 'EXPENSE' | 'TAX') => {
    const key = `${role}|${norm(ledger)}|${costCentre ?? ''}`;
    const existing = debits.get(key);
    if (existing) existing.cents += cents;
    else debits.set(key, { ledger, cents, costCentre, role });
  };

  for (const line of input.lines) {
    const cents = toCents(line.amount);
    const tax = toCents(line.taxAmount);
    let ledger: string | null = null;
    let mappedCostCentre: string | null = null;
    if (debitRule.source === 'FIXED') ledger = debitRule.ledger;
    else {
      const cat = line.category ?? e.category;
      const candidates = input.ledgerMappings.filter((m) => cat && norm(m.sourceCategory) === norm(cat));
      const m = candidates.find((c) => c.applicationScoped) ?? candidates[0];
      if (!m) {
        issues.push({ code: 'MAPPING_MISSING', severity: 'error', message: `No ledger mapping for category "${cat ?? '(none)'}"`, category: cat });
        continue;
      }
      ledger = m.tallyLedgerName;
      mappedCostCentre = m.costCentre;
    }
    needLedger(ledger, 'LEDGER', 'Indirect Expenses', `Debit ledger for ${line.category ?? 'expense'}`, line.category);
    const costCentre = cfg?.costCentreEnabled ? (line.costCentre ?? mappedCostCentre ?? e.costCentre) : null;

    if (tax > cents) {
      issues.push({ code: 'TAX_EXCEEDS_LINE', severity: 'error', message: `Line ${line.lineNo}: tax exceeds the line amount` });
      continue;
    }
    if (tax > 0n && taxRule.source === 'FIXED') {
      addDebit(ledger, cents - tax, costCentre, 'EXPENSE');
      addDebit(taxRule.ledger, tax, null, 'TAX');
    } else {
      if (tax > 0n) issues.push({ code: 'TAX_NOT_SPLIT', severity: 'warning', message: `Line ${line.lineNo}: tax ${fromCents(tax)} stays in the expense ledger because no tax ledger rule is configured` });
      addDebit(ledger, cents, costCentre, 'EXPENSE');
    }
  }
  if (taxRule.source === 'FIXED' && [...debits.values()].some((d) => d.role === 'TAX')) needLedger(taxRule.ledger, 'LEDGER', 'Duties & Taxes', 'Input tax ledger');

  // --- Credit side ----------------------------------------------------------------
  const creditRule = cfg?.creditLedgerRule ?? null;
  let creditLedger: string | null = null;
  if (!creditRule || creditRule.source === 'NONE' || creditRule.source === 'LEDGER_MAPPING' || creditRule.source === 'CREDIT_LEDGER') {
    if (cfg) issues.push({ code: 'RULE_INCOMPLETE', severity: 'error', message: `Voucher configuration "${cfg.tallyVoucherTypeName}" has no credit ledger rule` });
  } else if (creditRule.source === 'FIXED') {
    creditLedger = creditRule.ledger;
    needLedger(creditLedger, 'LEDGER', 'Current Liabilities', 'Credit ledger');
  } else {
    const name = renderTemplate(creditRule.template || (creditRule.source === 'EMPLOYEE_LEDGER' ? '{{employeeName}}' : '{{vendorName}}'), vars);
    if (!name) issues.push({ code: 'RULE_INCOMPLETE', severity: 'error', message: `Cannot derive the ${creditRule.source === 'EMPLOYEE_LEDGER' ? 'employee' : 'vendor'} ledger: the expense has no ${creditRule.source === 'EMPLOYEE_LEDGER' ? 'employee name' : 'vendor'}` });
    else {
      creditLedger = name;
      needLedger(name, 'PARTY_LEDGER', 'Sundry Creditors', creditRule.source === 'EMPLOYEE_LEDGER' ? 'Employee party ledger' : 'Vendor party ledger');
    }
  }

  const partyRule = cfg?.partyLedgerRule ?? { source: 'CREDIT_LEDGER' as const };
  const partyLedger = partyRule.source === 'FIXED' ? partyRule.ledger : partyRule.source === 'NONE' ? null : creditLedger;
  if (partyRule.source === 'FIXED') needLedger(partyRule.ledger, 'PARTY_LEDGER', 'Sundry Creditors', 'Party ledger');

  const entries: VoucherEntry[] = [...debits.values()]
    .sort((a, b) => (a.role === b.role ? a.ledger.localeCompare(b.ledger) : a.role === 'EXPENSE' ? -1 : 1))
    .map((d) => ({ ledger: d.ledger, debit: fromCents(d.cents), credit: '0.00', costCentre: d.costCentre, billReference: null, role: d.role }));
  const totalDebitCents = [...debits.values()].reduce((a, d) => a + d.cents, 0n);
  if (creditLedger && totalDebitCents > 0n) {
    entries.push({ ledger: creditLedger, debit: '0.00', credit: fromCents(totalDebitCents), costCentre: null, billReference: cfg?.billAllocationEnabled ? reference : null, role: 'CREDIT' });
  }
  const totalCreditCents = entries.reduce((a, x) => a + toCents(x.credit), 0n);
  const mappingComplete = !issues.some((i) => i.code === 'MAPPING_MISSING');
  const balanced = totalDebitCents > 0n && totalDebitCents === totalCreditCents && totalDebitCents === toCents(e.amount);
  if (mappingComplete && creditLedger && !balanced) {
    issues.push({ code: 'UNBALANCED', severity: 'error', message: `Debits ${fromCents(totalDebitCents)} and credits ${fromCents(totalCreditCents)} must both equal the expense amount ${e.amount}` });
  }

  const voucherNumber =
    cfg?.numberingMode === 'SOURCE_REFERENCE' ? (e.requestNumber ?? e.sourceTransactionId) : cfg?.numberingMode === 'TEMPLATE' && cfg.numberingTemplate ? renderTemplate(cfg.numberingTemplate, vars) : null;

  const amountCents = toCents(e.amount);
  const approvalRequired = !cfg || cfg.approvalPolicy !== 'ABOVE_THRESHOLD' ? true : cfg.approvalThreshold === null || amountCents > toCents(cfg.approvalThreshold);

  const errors = issues.filter((i) => i.severity === 'error');
  const blocking = errors.filter((i) => i.code !== 'MAPPING_MISSING' && i.code !== 'LEDGER_MISSING');
  const outcome: VoucherDraft['outcome'] = blocking.length
    ? 'VALIDATION_FAILED'
    : errors.some((i) => i.code === 'MAPPING_MISSING')
      ? 'MAPPING_REQUIRED'
      : errors.some((i) => i.code === 'LEDGER_MISSING')
        ? 'MASTER_CREATION_REQUIRED'
        : 'OK';

  return {
    voucherKind: cfg?.voucherKind ?? null,
    voucherType: cfg?.tallyVoucherTypeName ?? null,
    voucherDate: e.expenseDate,
    voucherNumber,
    reference,
    narration,
    partyLedger,
    entries,
    totalDebit: fromCents(totalDebitCents),
    totalCredit: fromCents(totalCreditCents),
    balanced,
    approvalRequired,
    issues,
    requiredMasters: required,
    outcome,
  };
}
