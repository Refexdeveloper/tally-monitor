import { describe, expect, it } from 'vitest';
import { buildVoucher, renderTemplate, type EngineInput, type VoucherConfigInput } from '../src/domain/voucherEngine';

const config = (over: Partial<VoucherConfigInput> = {}): VoucherConfigInput => ({
  voucherKind: 'JOURNAL',
  tallyVoucherTypeName: 'Journal',
  numberingMode: 'TALLY_AUTO',
  numberingTemplate: null,
  debitLedgerRule: { source: 'LEDGER_MAPPING' },
  creditLedgerRule: { source: 'FIXED', ledger: 'Suspense' },
  partyLedgerRule: { source: 'CREDIT_LEDGER' },
  taxLedgerRule: { source: 'NONE' },
  narrationTemplate: '{{application}} {{requestNumber}} - {{employeeName}}',
  referenceTemplate: null,
  costCentreEnabled: false,
  billAllocationEnabled: false,
  approvalPolicy: 'ALWAYS',
  approvalThreshold: null,
  isActive: true,
  ...over,
});

// Mirrors the proven pilot voucher: Food 500 + Conveyance 100 against Suspense 600.
const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  expense: {
    sourceTransactionId: 'PkEMAn1Bjhya',
    requestNumber: 'Exp--FY26-009',
    expenseDate: '2026-03-31',
    employeeName: 'Murugesh Kumar',
    employeeCode: 'E1',
    vendorName: null,
    description: 'Site visit',
    category: 'Multiple',
    amount: '600.00',
    taxAmount: '0.00',
    currency: 'INR',
    costCentre: 'Ops',
  },
  lines: [
    { lineNo: 1, category: 'Food Claim', description: null, amount: '500.00', taxAmount: '0.00', costCentre: null },
    { lineNo: 2, category: 'Local Conveyance', description: null, amount: '100.00', taxAmount: '0.00', costCentre: 'Site' },
  ],
  application: { name: 'Expense Management', code: 'EMS' },
  company: { code: 'VRPL', name: 'VENWIND REFEX POWER LIMITED', defaultCurrency: 'INR' },
  config: config(),
  ledgerMappings: [
    { applicationScoped: false, sourceCategory: 'Food Claim', tallyLedgerName: 'Food & Refreshment', costCentre: null },
    { applicationScoped: false, sourceCategory: 'local conveyance', tallyLedgerName: 'Travelling and Conveyance Expenses', costCentre: null },
  ],
  ledgerNames: ['Food & Refreshment', 'Travelling and Conveyance Expenses', 'Suspense', 'Input GST', 'Murugesh Kumar'],
  ...over,
});

describe('voucher engine', () => {
  it('builds a balanced journal (pilot shape)', () => {
    const v = buildVoucher(input());
    expect(v.outcome).toBe('OK');
    expect(v.balanced).toBe(true);
    expect(v.entries.map((x) => [x.ledger, x.debit, x.credit])).toEqual([
      ['Food & Refreshment', '500.00', '0.00'],
      ['Travelling and Conveyance Expenses', '100.00', '0.00'],
      ['Suspense', '0.00', '600.00'],
    ]);
    expect(v.reference).toBe('EMS/PkEMAn1Bjhya');
    expect(v.narration).toBe('Expense Management Exp--FY26-009 - Murugesh Kumar');
    expect(v.partyLedger).toBe('Suspense');
    expect(v.approvalRequired).toBe(true);
  });

  it('merges lines that map to the same ledger and prefers application-scoped mappings', () => {
    const v = buildVoucher(
      input({
        lines: [
          { lineNo: 1, category: 'Food Claim', description: null, amount: '250.00', taxAmount: '0.00', costCentre: null },
          { lineNo: 2, category: 'Food Claim', description: null, amount: '350.00', taxAmount: '0.00', costCentre: null },
        ],
        ledgerMappings: [
          { applicationScoped: false, sourceCategory: 'Food Claim', tallyLedgerName: 'Staff Welfare', costCentre: null },
          { applicationScoped: true, sourceCategory: 'Food Claim', tallyLedgerName: 'Food & Refreshment', costCentre: null },
        ],
      }),
    );
    expect(v.entries).toHaveLength(2);
    expect(v.entries[0]).toMatchObject({ ledger: 'Food & Refreshment', debit: '600.00' });
  });

  it('reports unmapped categories as MAPPING_REQUIRED', () => {
    const v = buildVoucher(input({ ledgerMappings: [] }));
    expect(v.outcome).toBe('MAPPING_REQUIRED');
    expect(v.issues.filter((i) => i.code === 'MAPPING_MISSING')).toHaveLength(2);
  });

  it('reports missing Tally ledgers as MASTER_CREATION_REQUIRED with proposals', () => {
    const v = buildVoucher(input({ ledgerNames: ['Food & Refreshment', 'Suspense'] }));
    expect(v.outcome).toBe('MASTER_CREATION_REQUIRED');
    expect(v.requiredMasters).toEqual([expect.objectContaining({ name: 'Travelling and Conveyance Expenses', masterType: 'LEDGER', proposedParent: 'Indirect Expenses' })]);
  });

  it('fails validation without a voucher configuration or with a foreign currency', () => {
    expect(buildVoucher(input({ config: null })).outcome).toBe('VALIDATION_FAILED');
    expect(buildVoucher(input({ expense: { ...input().expense, currency: 'USD' } })).issues.some((i) => i.code === 'CURRENCY_UNSUPPORTED')).toBe(true);
  });

  it('detects an unbalanced voucher when lines do not equal the header amount', () => {
    const v = buildVoucher(input({ expense: { ...input().expense, amount: '650.00' } }));
    expect(v.outcome).toBe('VALIDATION_FAILED');
    expect(v.issues.some((i) => i.code === 'UNBALANCED')).toBe(true);
  });

  it('splits tax into the tax ledger when configured', () => {
    const v = buildVoucher(
      input({
        config: config({ taxLedgerRule: { source: 'FIXED', ledger: 'Input GST' } }),
        lines: [
          { lineNo: 1, category: 'Food Claim', description: null, amount: '590.00', taxAmount: '90.00', costCentre: null },
          { lineNo: 2, category: 'Local Conveyance', description: null, amount: '10.00', taxAmount: '0.00', costCentre: null },
        ],
      }),
    );
    expect(v.balanced).toBe(true);
    expect(v.entries.find((x) => x.ledger === 'Food & Refreshment')!.debit).toBe('500.00');
    expect(v.entries.find((x) => x.ledger === 'Input GST')!.debit).toBe('90.00');
  });

  it('uses the employee party ledger, cost centres and bill references when enabled', () => {
    const v = buildVoucher(input({ config: config({ creditLedgerRule: { source: 'EMPLOYEE_LEDGER' }, costCentreEnabled: true, billAllocationEnabled: true }) }));
    const credit = v.entries.find((x) => x.role === 'CREDIT')!;
    expect(credit).toMatchObject({ ledger: 'Murugesh Kumar', credit: '600.00', billReference: 'EMS/PkEMAn1Bjhya' });
    expect(v.entries.find((x) => x.ledger === 'Food & Refreshment')!.costCentre).toBe('Ops');
    expect(v.entries.find((x) => x.ledger === 'Travelling and Conveyance Expenses')!.costCentre).toBe('Site');
  });

  it('flags a missing employee party ledger', () => {
    const v = buildVoucher(input({ config: config({ creditLedgerRule: { source: 'EMPLOYEE_LEDGER', template: '{{employeeName}} (Emp)' } }) }));
    expect(v.outcome).toBe('MASTER_CREATION_REQUIRED');
    expect(v.requiredMasters[0]).toMatchObject({ name: 'Murugesh Kumar (Emp)', masterType: 'PARTY_LEDGER', proposedParent: 'Sundry Creditors' });
  });

  it('applies the approval threshold policy', () => {
    expect(buildVoucher(input({ config: config({ approvalPolicy: 'ABOVE_THRESHOLD', approvalThreshold: '1000.00' }) })).approvalRequired).toBe(false);
    expect(buildVoucher(input({ config: config({ approvalPolicy: 'ABOVE_THRESHOLD', approvalThreshold: '500.00' }) })).approvalRequired).toBe(true);
    // NEVER is not allowed to bypass Finance approval.
    expect(buildVoucher(input({ config: config({ approvalPolicy: 'NEVER' }) })).approvalRequired).toBe(true);
  });

  it('numbers vouchers from the source reference or a template', () => {
    expect(buildVoucher(input({ config: config({ numberingMode: 'SOURCE_REFERENCE' }) })).voucherNumber).toBe('Exp--FY26-009');
    expect(buildVoucher(input({ config: config({ numberingMode: 'TEMPLATE', numberingTemplate: '{{companyCode}}-{{requestNumber}}' }) })).voucherNumber).toBe('VRPL-Exp--FY26-009');
  });

  it('renders templates safely', () => {
    expect(renderTemplate('{{a}} - {{missing}} {{ b }}', { a: 'x', b: 'y' })).toBe('x - y');
  });
});
