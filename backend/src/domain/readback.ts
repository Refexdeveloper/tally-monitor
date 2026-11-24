/**
 * Verifies a voucher read back from Tally against the approved draft. A job is
 * POSTED only when every identifying field and every ledger amount matches.
 */
import { stableStringify, toCents, toDecimal2 } from './mapping';
import type { VoucherDraft } from './voucherEngine';
import crypto from 'node:crypto';

export interface ReadbackEntry {
  ledger: string;
  debit?: string | number | null;
  credit?: string | number | null;
}

export interface Readback {
  reference: string;
  voucherDate: string;
  voucherType: string;
  voucherNumber?: string | null;
  masterId?: string | number | null;
  alterId?: string | number | null;
  guid?: string | null;
  entries: ReadbackEntry[];
}

/** Hash that binds a Finance approval to one exact voucher draft. */
export function voucherHash(draft: unknown) {
  return crypto.createHash('sha256').update(stableStringify(draft)).digest('hex');
}

const cents = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return 0n;
  const d = toDecimal2(typeof v === 'number' ? String(v) : v);
  if (d === null) throw new Error(`Invalid amount ${String(v)}`);
  return toCents(d);
};

function aggregate(entries: { ledger: string; debit: bigint; credit: bigint }[]) {
  const map = new Map<string, { ledger: string; debit: bigint; credit: bigint }>();
  for (const e of entries) {
    const key = e.ledger.trim().toLowerCase();
    const cur = map.get(key) ?? { ledger: e.ledger.trim(), debit: 0n, credit: 0n };
    cur.debit += e.debit;
    cur.credit += e.credit;
    map.set(key, cur);
  }
  return map;
}

export function verifyReadback(draft: Pick<VoucherDraft, 'reference' | 'voucherDate' | 'voucherType' | 'entries'>, readback: Readback): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if ((readback.reference ?? '').trim() !== draft.reference.trim()) mismatches.push(`Reference "${readback.reference}" ≠ "${draft.reference}"`);
  if (readback.voucherDate !== draft.voucherDate) mismatches.push(`Voucher date ${readback.voucherDate} ≠ ${draft.voucherDate}`);
  if ((readback.voucherType ?? '').trim().toLowerCase() !== (draft.voucherType ?? '').trim().toLowerCase()) mismatches.push(`Voucher type "${readback.voucherType}" ≠ "${draft.voucherType}"`);

  let actual: Map<string, { ledger: string; debit: bigint; credit: bigint }>;
  try {
    actual = aggregate((readback.entries ?? []).map((e) => ({ ledger: e.ledger, debit: cents(e.debit), credit: cents(e.credit) })));
  } catch (err) {
    return { ok: false, mismatches: [...mismatches, (err as Error).message] };
  }
  const expected = aggregate(draft.entries.map((e) => ({ ledger: e.ledger, debit: cents(e.debit), credit: cents(e.credit) })));

  for (const [key, exp] of expected) {
    const got = actual.get(key);
    if (!got) mismatches.push(`Ledger "${exp.ledger}" missing in Tally voucher`);
    else if (got.debit !== exp.debit || got.credit !== exp.credit) mismatches.push(`Ledger "${exp.ledger}" amounts differ`);
  }
  for (const [key, got] of actual) if (!expected.has(key)) mismatches.push(`Unexpected ledger "${got.ledger}" in Tally voucher`);
  return { ok: mismatches.length === 0, mismatches };
}
