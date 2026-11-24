import { describe, expect, it } from 'vitest';
import { verifyReadback, voucherHash } from '../src/domain/readback';

const draft = {
  reference: 'EMS/PkEMAn1Bjhya',
  voucherDate: '2026-03-31',
  voucherType: 'Journal',
  entries: [
    { ledger: 'Food & Refreshment', debit: '500.00', credit: '0.00', costCentre: null, billReference: null, role: 'EXPENSE' as const },
    { ledger: 'Travelling and Conveyance Expenses', debit: '100.00', credit: '0.00', costCentre: null, billReference: null, role: 'EXPENSE' as const },
    { ledger: 'Suspense', debit: '0.00', credit: '600.00', costCentre: null, billReference: null, role: 'CREDIT' as const },
  ],
};
const ok = {
  reference: 'EMS/PkEMAn1Bjhya',
  voucherDate: '2026-03-31',
  voucherType: 'journal',
  voucherNumber: '2734',
  entries: [
    { ledger: 'Suspense', credit: 600 },
    { ledger: 'food & refreshment', debit: '500' },
    { ledger: 'Travelling and Conveyance Expenses', debit: 100 },
  ],
};

describe('read-back verification', () => {
  it('accepts an identical voucher regardless of order, case and number format', () => {
    expect(verifyReadback(draft, ok)).toEqual({ ok: true, mismatches: [] });
  });
  it('rejects a different amount', () => {
    const r = verifyReadback(draft, { ...ok, entries: [...ok.entries.slice(0, 2), { ledger: 'Travelling and Conveyance Expenses', debit: 100.5 }] });
    expect(r.ok).toBe(false);
    expect(r.mismatches[0]).toMatch(/Travelling and Conveyance Expenses/);
  });
  it('rejects missing or extra ledgers, wrong date, type or reference', () => {
    const r = verifyReadback(draft, { ...ok, reference: 'EMS/other', voucherDate: '2026-04-01', voucherType: 'Payment', entries: [...ok.entries.slice(1), { ledger: 'Cash', credit: 600 }] });
    expect(r.mismatches).toHaveLength(5);
  });
  it('binds approvals to an exact draft', () => {
    expect(voucherHash(draft)).toBe(voucherHash(JSON.parse(JSON.stringify(draft))));
    expect(voucherHash(draft)).not.toBe(voucherHash({ ...draft, reference: 'X' }));
  });
});
