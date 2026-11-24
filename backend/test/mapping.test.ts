import { describe, expect, it } from 'vitest';
import {
  MAPPING_TEMPLATES,
  normalize,
  parseDate,
  parseDateTime,
  parseMoney,
  redactPayload,
  resolvePath,
  stableStringify,
  toDecimal2,
  validateMappings,
} from '../src/domain/mapping';

const canonical = MAPPING_TEMPLATES.find((t) => t.id === 'tally-monitor-v1')!.mappings;
const raw = MAPPING_TEMPLATES.find((t) => t.id === 'kissflow-expense-raw')!.mappings;

const canonicalPayload = {
  schema: 'tally-monitor.expense.v1',
  source_transaction_id: 'PkEMAn1Bjhya',
  request_number: 'Exp--FY26-009',
  company_key: 'VENWIND REFEX POWER LIMITED',
  expense_date: '2026-10-31',
  employee: { code: 'E1001', name: 'Murugesh Kumar', email: 'Murugesh@Example.com' },
  category: 'Travel',
  description: 'Site visit',
  amount: '600.00',
  currency: 'INR',
  approval_status: 'Completed',
  documents: [{ name: 'bill.pdf', key: 'k/1', id: 'A1', fileExtension: 'pdf' }],
  lines: [
    { category: 'Food Claim', amount: 500, description: 'Lunch' },
    { category: 'Local Conveyance', amount: '100 INR' },
  ],
};

describe('money and dates', () => {
  it('rounds decimals without floating point error', () => {
    expect(toDecimal2('1.005')).toBe('1.01');
    expect(toDecimal2('0.999')).toBe('1.00');
    expect(toDecimal2('1,234.5')).toBe('1234.50');
    expect(toDecimal2('abc')).toBeNull();
  });
  it('parses Kissflow money formats', () => {
    expect(parseMoney('776 INR')).toEqual({ amount: '776.00', currency: 'INR' });
    expect(parseMoney('INR 1,250.75')).toEqual({ amount: '1250.75', currency: 'INR' });
    expect(parseMoney('₹ 99')).toEqual({ amount: '99.00', currency: null });
    expect(parseMoney(323.86)).toEqual({ amount: '323.86', currency: null });
    expect(parseMoney('Text data')).toBeNull();
  });
  it('parses dates and Kissflow timestamps', () => {
    expect(parseDate('2026-10-31')).toBe('2026-10-31');
    expect(parseDate('2026-10-31T07:55:24-08:00 America/Los_Angeles')).toBe('2026-10-31');
    expect(parseDate('31/10/2026')).toBe('2026-10-31');
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDateTime('2026-10-31T07:55:24-08:00 America/Los_Angeles')).toBe('2026-10-31T15:55:24.000Z');
  });
});

describe('paths', () => {
  const p = { a: { b: [{ c: 1 }] }, 'Table::Bulk_Expense_2': [{ x: 'y' }], empty: '', Name: 'n' };
  it('resolves nested, indexed and special keys', () => {
    expect(resolvePath(p, 'a.b[0].c')).toBe(1);
    expect(resolvePath(p, 'Table::Bulk_Expense_2[0].x')).toBe('y');
    expect(resolvePath(p, '["Table::Bulk_Expense_2"][0].x')).toBe('y');
  });
  it('falls back with |', () => {
    expect(resolvePath(p, 'empty|missing|Name')).toBe('n');
    expect(resolvePath(p, 'missing')).toBeUndefined();
  });
});

describe('normalize', () => {
  it('validates the bundled templates', () => {
    expect(validateMappings(canonical)).toEqual([]);
    expect(validateMappings(raw)).toEqual([]);
  });

  it('normalizes the canonical payload with line items', () => {
    const r = normalize(canonicalPayload, canonical);
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({
      sourceTransactionId: 'PkEMAn1Bjhya',
      companyKey: 'VENWIND REFEX POWER LIMITED',
      amount: '600.00',
      currency: 'INR',
      approvalStatus: 'APPROVED',
      employeeEmail: 'murugesh@example.com',
    });
    expect(r.value!.lineItems.map((l) => [l.category, l.amount])).toEqual([
      ['Food Claim', '500.00'],
      ['Local Conveyance', '100.00'],
    ]);
  });

  it('rejects when line items do not add up to the amount', () => {
    const r = normalize({ ...canonicalPayload, amount: 650 }, canonical);
    expect(r.ok).toBe(false);
    expect(r.errors[0]!.message).toMatch(/does not match amount 650.00/);
  });

  it('reports missing required fields with their path', () => {
    const { company_key: _c, ...rest } = canonicalPayload;
    const r = normalize(rest, canonical);
    expect(r.errors.some((e) => e.field === 'companyKey' && e.message.includes('company_key'))).toBe(true);
  });

  it('maps the raw Kissflow item shape into a single line', () => {
    const r = normalize(
      { _id: 'Inst01', Expense_ID: 'EXP-1', Req_Entity: 'VENWIND', Expense_Date: '2026-10-31', Expense_Category: 'Local Conveyance', Expense_Amount: '776 INR', _status: 'Completed', _created_by: { _id: 'U1', Name: 'Murugesh Kumar' } },
      raw,
    );
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ requestNumber: 'EXP-1', amount: '776.00', currency: 'INR', employeeName: 'Murugesh Kumar', employeeCode: 'U1' });
    expect(r.value!.lineItems).toHaveLength(1);
  });

  it('flags unapproved items through approvalStatus', () => {
    const r = normalize({ ...canonicalPayload, approval_status: 'In Progress' }, canonical);
    expect(r.value!.approvalStatus).toBe('PENDING');
  });

  it('rejects non-object payloads and zero amounts', () => {
    expect(normalize([], canonical).ok).toBe(false);
    expect(normalize({ ...canonicalPayload, amount: 0, lines: [] }, canonical).errors.some((e) => e.field === 'amount')).toBe(true);
  });
});

describe('helpers', () => {
  it('hashes independent of key order', () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
  it('redacts banking and contact details', () => {
    expect(redactPayload({ IFSC_Code: 'HDFC0001', Account_ID: '123', Employee_Mobile_Number: '99', Amount: '1', nested: { Bank_Name: 'X' } })).toEqual({
      IFSC_Code: '[REDACTED]',
      Account_ID: '[REDACTED]',
      Employee_Mobile_Number: '[REDACTED]',
      Amount: '1',
      nested: { Bank_Name: '[REDACTED]' },
    });
  });
});
