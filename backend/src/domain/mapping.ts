/**
 * Source payload → common expense structure. Pure functions only, so the
 * same engine powers webhooks, API sync, manual import and the UI preview.
 */

export const TRANSFORMS = ['text', 'number', 'money', 'date', 'datetime', 'upper', 'lower', 'user_name', 'user_id', 'approval', 'attachments', 'boolean', 'array'] as const;
export type Transform = (typeof TRANSFORMS)[number];

export interface TargetFieldDef {
  field: string;
  label: string;
  group: 'header' | 'item';
  required: boolean;
  transform: Transform;
  description: string;
}

export const TARGET_FIELDS: TargetFieldDef[] = [
  { field: 'sourceTransactionId', label: 'Source transaction ID', group: 'header', required: true, transform: 'text', description: 'Unique, immutable item id in Kissflow (e.g. _id). Drives duplicate detection.' },
  { field: 'requestNumber', label: 'Request number', group: 'header', required: false, transform: 'text', description: 'Human-readable request number (e.g. Expense_ID).' },
  { field: 'companyKey', label: 'Company key', group: 'header', required: true, transform: 'text', description: 'Matched against the source company key of a connected company (e.g. Req_Entity).' },
  { field: 'expenseDate', label: 'Expense date', group: 'header', required: true, transform: 'date', description: 'Accounting date of the expense.' },
  { field: 'employeeCode', label: 'Employee code', group: 'header', required: false, transform: 'text', description: 'Employee identifier.' },
  { field: 'employeeName', label: 'Employee name', group: 'header', required: false, transform: 'user_name', description: 'Claimant name.' },
  { field: 'employeeEmail', label: 'Employee email', group: 'header', required: false, transform: 'lower', description: 'Claimant email.' },
  { field: 'vendorName', label: 'Vendor', group: 'header', required: false, transform: 'text', description: 'Vendor / payee for vendor payments.' },
  { field: 'expenseCategory', label: 'Expense category', group: 'header', required: false, transform: 'text', description: 'Category used for ledger mapping when there are no line items.' },
  { field: 'description', label: 'Description / purpose', group: 'header', required: false, transform: 'text', description: 'Narration source.' },
  { field: 'amount', label: 'Amount', group: 'header', required: true, transform: 'money', description: 'Total claim amount. "776 INR", 776 and "1,234.50" are accepted.' },
  { field: 'taxAmount', label: 'Tax amount', group: 'header', required: false, transform: 'money', description: 'Total tax included in the amount.' },
  { field: 'currency', label: 'Currency', group: 'header', required: false, transform: 'upper', description: 'ISO currency. Defaults to the currency inside the amount, then the company currency.' },
  { field: 'costCentre', label: 'Cost centre', group: 'header', required: false, transform: 'text', description: 'Cost centre / department.' },
  { field: 'approvalStatus', label: 'Approval status', group: 'header', required: true, transform: 'approval', description: 'Only APPROVED items are accepted (e.g. _status = Completed).' },
  { field: 'approvedAt', label: 'Approved at', group: 'header', required: false, transform: 'datetime', description: 'Completion / approval timestamp.' },
  { field: 'supportingDocuments', label: 'Supporting documents', group: 'header', required: false, transform: 'attachments', description: 'Attachment array (receipts, bills).' },
  { field: 'lineItems', label: 'Line items (array)', group: 'header', required: false, transform: 'array', description: 'Array of expense lines. item.* fields are read from each element.' },
  { field: 'item.category', label: 'Line category', group: 'item', required: false, transform: 'text', description: 'Falls back to the header category.' },
  { field: 'item.description', label: 'Line description', group: 'item', required: false, transform: 'text', description: '' },
  { field: 'item.amount', label: 'Line amount', group: 'item', required: false, transform: 'money', description: 'Required for each line when line items are mapped.' },
  { field: 'item.taxAmount', label: 'Line tax', group: 'item', required: false, transform: 'money', description: '' },
  { field: 'item.costCentre', label: 'Line cost centre', group: 'item', required: false, transform: 'text', description: 'Falls back to the header cost centre.' },
  { field: 'item.date', label: 'Line date', group: 'item', required: false, transform: 'date', description: '' },
];

export interface FieldMapping {
  targetField: string;
  sourcePath: string;
  transform?: Transform | null;
  defaultValue?: string | null;
  isRequired?: boolean;
}

export interface NormalizedLine {
  lineNo: number;
  category: string | null;
  description: string | null;
  amount: string;
  taxAmount: string;
  costCentre: string | null;
  date: string | null;
}

export interface NormalizedExpense {
  sourceTransactionId: string;
  requestNumber: string | null;
  companyKey: string;
  expenseDate: string;
  employeeCode: string | null;
  employeeName: string | null;
  employeeEmail: string | null;
  vendorName: string | null;
  expenseCategory: string | null;
  description: string | null;
  amount: string;
  taxAmount: string;
  currency: string | null;
  costCentre: string | null;
  approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  approvedAt: string | null;
  supportingDocuments: { name: string | null; key: string | null; id: string | null; fileExtension: string | null; size: number | null }[];
  lineItems: NormalizedLine[];
}

export interface Issue {
  field: string;
  message: string;
}

export interface NormalizeResult {
  ok: boolean;
  value: NormalizedExpense | null;
  errors: Issue[];
  warnings: Issue[];
  /** Raw resolved values per target field, for the mapping preview. */
  trace: Record<string, unknown>;
}

// --- Path resolution ---------------------------------------------------------

const TOKEN = /\["([^"]+)"\]|\[(\d+)\]|([^.[\]]+)/g;

export function isValidPath(path: string) {
  if (!path.trim()) return false;
  return path.split('|').every((p) => {
    const trimmed = p.trim();
    if (!trimmed) return false;
    const consumed = [...trimmed.matchAll(TOKEN)].map((m) => m[0]).join('');
    return consumed.replace(/\./g, '') === trimmed.replace(/\./g, '');
  });
}

function resolveOne(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const m of path.trim().matchAll(TOKEN)) {
    if (current === null || current === undefined) return undefined;
    const key = m[1] ?? m[3];
    if (m[2] !== undefined) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(m[2])];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key!];
    } else {
      return undefined;
    }
  }
  return current;
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** Resolves "a.b[0].c" paths; "x|y" falls back to y when x is empty. */
export function resolvePath(source: unknown, path: string): unknown {
  for (const alt of path.split('|')) {
    const v = resolveOne(source, alt);
    if (!isEmpty(v)) return v;
  }
  return undefined;
}

// --- Decimal-safe money --------------------------------------------------------

const MONEY = /^\s*(?:([A-Za-z]{3})\s*)?(?:[₹$€£]\s*)?(-?[\d,]*\.?\d+)\s*([A-Za-z]{3})?\s*$/;

/** Rounds a plain decimal string to 2 places (half-up) without floating point. */
export function toDecimal2(raw: string): string | null {
  const s = raw.replace(/,/g, '').trim();
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const negative = s.startsWith('-');
  const [intPart = '0', frac = ''] = (negative ? s.slice(1) : s).split('.');
  let cents = BigInt(intPart || '0') * 100n + BigInt((frac + '00').slice(0, 2));
  if ((frac[2] ?? '0') >= '5') cents += 1n;
  const str = (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0');
  return negative && cents !== 0n ? `-${str}` : str;
}

export const toCents = (decimal2: string) => BigInt(decimal2.replace('.', ''));
export const fromCents = (cents: bigint) => {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
};

export function parseMoney(value: unknown): { amount: string; currency: string | null } | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const amount = toDecimal2(String(value).includes('e') ? value.toFixed(6) : String(value));
    return amount ? { amount, currency: null } : null;
  }
  if (typeof value === 'string') {
    const m = MONEY.exec(value);
    if (!m) return null;
    const amount = toDecimal2(m[2]!);
    const currency = (m[1] ?? m[3])?.toUpperCase() ?? null;
    return amount ? { amount, currency } : null;
  }
  if (value && typeof value === 'object' && 'amount' in value) {
    const inner = parseMoney((value as { amount: unknown }).amount);
    const cur = (value as { currency?: unknown }).currency;
    return inner ? { amount: inner.amount, currency: typeof cur === 'string' ? cur.toUpperCase() : inner.currency } : null;
  }
  return null;
}

// --- Dates -----------------------------------------------------------------------

function validYmd(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1900 && y <= 2200;
}
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Keeps the calendar date as written by the source (Kissflow sends local dates). */
export function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(s);
  if (m && validYmd(+m[1]!, +m[2]!, +m[3]!)) return ymd(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/.exec(s);
  if (m && validYmd(+m[3]!, +m[2]!, +m[1]!)) return ymd(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m && validYmd(+m[1]!, +m[2]!, +m[3]!)) return ymd(+m[1]!, +m[2]!, +m[3]!);
  return null;
}

/** Accepts Kissflow's "2026-10-31T07:55:24-08:00 America/Los_Angeles". */
export function parseDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value.trim().split(/\s+/)[0]!);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// --- Transforms ------------------------------------------------------------------

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(', ') || null;
  if (typeof v === 'object' && 'Name' in v) return toText((v as { Name: unknown }).Name);
  return null;
}

export function approvalOf(v: unknown): 'APPROVED' | 'PENDING' | 'REJECTED' {
  const s = (toText(v) ?? '').toLowerCase();
  if (['approved', 'approve', 'completed', 'complete', 'done', 'closed', 'reimbursed', 'paid'].includes(s)) return 'APPROVED';
  if (['rejected', 'reject', 'withdrawn', 'cancelled', 'canceled', 'declined'].includes(s)) return 'REJECTED';
  return 'PENDING';
}

export function applyTransform(transform: Transform, v: unknown): unknown {
  switch (transform) {
    case 'text':
      return toText(v);
    case 'upper':
      return toText(v)?.toUpperCase() ?? null;
    case 'lower':
      return toText(v)?.toLowerCase() ?? null;
    case 'number': {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const n = Number(String(v ?? '').replace(/,/g, '').trim());
      return v === null || v === undefined || String(v).trim() === '' || !Number.isFinite(n) ? null : n;
    }
    case 'money':
      return parseMoney(v);
    case 'date':
      return parseDate(v);
    case 'datetime':
      return parseDateTime(v);
    case 'user_name':
      return v && typeof v === 'object' && !Array.isArray(v) ? toText((v as Record<string, unknown>).Name) : toText(v);
    case 'user_id':
      return v && typeof v === 'object' && !Array.isArray(v) ? toText((v as Record<string, unknown>)._id) : toText(v);
    case 'approval':
      return approvalOf(v);
    case 'boolean':
      return v === true || ['true', 'yes', '1', 'y'].includes(String(v).toLowerCase());
    case 'attachments': {
      const arr = Array.isArray(v) ? v : v ? [v] : [];
      return arr
        .filter((a) => a && typeof a === 'object')
        .map((a: Record<string, unknown>) => ({
          name: toText(a.name ?? a.Name),
          key: toText(a.key),
          id: toText(a.id ?? a._id),
          fileExtension: toText(a.fileExtension),
          size: typeof a.size === 'number' ? a.size : null,
        }));
    }
    case 'array':
      return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  }
}

// --- Normalization -------------------------------------------------------------

const FIELD_DEFS = new Map(TARGET_FIELDS.map((f) => [f.field, f]));

export function validateMappings(mappings: FieldMapping[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const m of mappings) {
    if (!FIELD_DEFS.has(m.targetField)) issues.push({ field: m.targetField, message: 'Unknown target field' });
    if (seen.has(m.targetField)) issues.push({ field: m.targetField, message: 'Mapped more than once' });
    seen.add(m.targetField);
    if (m.transform && !TRANSFORMS.includes(m.transform)) issues.push({ field: m.targetField, message: `Unknown transform ${m.transform}` });
    if (!m.sourcePath.trim() && !m.defaultValue) issues.push({ field: m.targetField, message: 'Provide a source path or a default value' });
    if (m.sourcePath.trim() && !isValidPath(m.sourcePath)) issues.push({ field: m.targetField, message: 'Invalid source path' });
  }
  for (const def of TARGET_FIELDS) {
    if (def.required && !seen.has(def.field)) issues.push({ field: def.field, message: `${def.label} must be mapped` });
  }
  const hasItems = seen.has('lineItems');
  for (const m of mappings) {
    if (m.targetField.startsWith('item.') && !hasItems) issues.push({ field: m.targetField, message: 'Map "Line items (array)" before mapping line fields' });
  }
  if (hasItems && !seen.has('item.amount')) issues.push({ field: 'item.amount', message: 'Line amount must be mapped when line items are mapped' });
  return issues;
}

function readField(source: unknown, mapping: FieldMapping | undefined, def: TargetFieldDef) {
  if (!mapping) return { raw: undefined, value: undefined };
  let raw = mapping.sourcePath.trim() ? resolvePath(source, mapping.sourcePath) : undefined;
  if (isEmpty(raw) && mapping.defaultValue !== null && mapping.defaultValue !== undefined && mapping.defaultValue !== '') raw = mapping.defaultValue;
  const value = isEmpty(raw) ? undefined : applyTransform(mapping.transform ?? def.transform, raw);
  return { raw, value };
}

export function normalize(payload: unknown, mappings: FieldMapping[]): NormalizeResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const trace: Record<string, unknown> = {};
  const byField = new Map(mappings.map((m) => [m.targetField, m]));

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, value: null, errors: [{ field: '$', message: 'Payload must be a JSON object' }], warnings, trace };
  }

  const header: Record<string, unknown> = {};
  for (const def of TARGET_FIELDS.filter((d) => d.group === 'header')) {
    const mapping = byField.get(def.field);
    const { raw, value } = readField(payload, mapping, def);
    if (mapping) trace[def.field] = { raw: def.field === 'lineItems' ? (Array.isArray(raw) ? `[${raw.length} items]` : raw) : raw, value: def.field === 'lineItems' ? undefined : value };
    header[def.field] = value;
    const required = def.required || mapping?.isRequired;
    if (required && (value === undefined || value === null)) {
      errors.push({ field: def.field, message: raw === undefined ? `${def.label} is missing (path ${mapping?.sourcePath ?? 'not mapped'})` : `${def.label} could not be read from value ${JSON.stringify(raw).slice(0, 60)}` });
    }
  }

  const amount = header.amount as { amount: string; currency: string | null } | null | undefined;
  const tax = header.taxAmount as { amount: string; currency: string | null } | null | undefined;
  let currency = (header.currency as string | null | undefined) ?? amount?.currency ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    errors.push({ field: 'currency', message: `"${currency}" is not a 3-letter currency code` });
    currency = null;
  }
  if (amount && amount.currency && currency && amount.currency !== currency) {
    errors.push({ field: 'amount', message: `Amount currency ${amount.currency} differs from currency ${currency}` });
  }
  if (amount && toCents(amount.amount) <= 0n) errors.push({ field: 'amount', message: 'Amount must be greater than zero' });
  if (tax && amount && toCents(tax.amount) > toCents(amount.amount)) errors.push({ field: 'taxAmount', message: 'Tax amount exceeds the total amount' });
  if (tax && toCents(tax.amount) < 0n) errors.push({ field: 'taxAmount', message: 'Tax amount cannot be negative' });

  // Line items
  const lines: NormalizedLine[] = [];
  const rawLines = (header.lineItems as unknown[] | undefined) ?? [];
  if (byField.has('lineItems') && rawLines.length) {
    rawLines.forEach((item, i) => {
      const read = (field: string) => readField(item, byField.get(field), FIELD_DEFS.get(field)!).value;
      const lineAmount = read('item.amount') as { amount: string; currency: string | null } | null | undefined;
      const lineTax = read('item.taxAmount') as { amount: string } | null | undefined;
      const lineNo = i + 1;
      if (!lineAmount) {
        errors.push({ field: `lineItems[${i}].amount`, message: `Line ${lineNo}: amount is missing or invalid` });
        return;
      }
      if (toCents(lineAmount.amount) <= 0n) errors.push({ field: `lineItems[${i}].amount`, message: `Line ${lineNo}: amount must be greater than zero` });
      if (lineAmount.currency && currency && lineAmount.currency !== currency) errors.push({ field: `lineItems[${i}].amount`, message: `Line ${lineNo}: currency ${lineAmount.currency} differs from ${currency}` });
      const category = (read('item.category') as string | null | undefined) ?? (header.expenseCategory as string | null | undefined) ?? null;
      if (!category) errors.push({ field: `lineItems[${i}].category`, message: `Line ${lineNo}: category is missing` });
      lines.push({
        lineNo,
        category,
        description: (read('item.description') as string | null | undefined) ?? null,
        amount: lineAmount.amount,
        taxAmount: lineTax?.amount ?? '0.00',
        costCentre: (read('item.costCentre') as string | null | undefined) ?? (header.costCentre as string | null | undefined) ?? null,
        date: (read('item.date') as string | null | undefined) ?? null,
      });
    });
    if (amount && lines.length && errors.length === 0) {
      const sum = lines.reduce((acc, l) => acc + toCents(l.amount), 0n);
      if (sum !== toCents(amount.amount)) errors.push({ field: 'lineItems', message: `Line items total ${fromCents(sum)} does not match amount ${amount.amount}` });
    }
  } else if (amount) {
    if (!header.expenseCategory) warnings.push({ field: 'expenseCategory', message: 'No category; a ledger mapping cannot be resolved until one is provided' });
    lines.push({
      lineNo: 1,
      category: (header.expenseCategory as string | null | undefined) ?? null,
      description: (header.description as string | null | undefined) ?? null,
      amount: amount.amount,
      taxAmount: tax?.amount ?? '0.00',
      costCentre: (header.costCentre as string | null | undefined) ?? null,
      date: (header.expenseDate as string | null | undefined) ?? null,
    });
  }

  const sourceId = header.sourceTransactionId as string | undefined;
  if (sourceId && (sourceId.length > 150 || /[\u0000-\u001f]/.test(sourceId))) errors.push({ field: 'sourceTransactionId', message: 'Source transaction ID is too long or contains control characters' });

  if (errors.length) return { ok: false, value: null, errors, warnings, trace };

  const value: NormalizedExpense = {
    sourceTransactionId: sourceId!,
    requestNumber: (header.requestNumber as string | null) ?? null,
    companyKey: header.companyKey as string,
    expenseDate: header.expenseDate as string,
    employeeCode: (header.employeeCode as string | null) ?? null,
    employeeName: (header.employeeName as string | null) ?? null,
    employeeEmail: (header.employeeEmail as string | null) ?? null,
    vendorName: (header.vendorName as string | null) ?? null,
    expenseCategory: (header.expenseCategory as string | null) ?? null,
    description: (header.description as string | null) ?? null,
    amount: amount!.amount,
    taxAmount: tax?.amount ?? '0.00',
    currency,
    costCentre: (header.costCentre as string | null) ?? null,
    approvalStatus: (header.approvalStatus as NormalizedExpense['approvalStatus']) ?? 'PENDING',
    approvedAt: (header.approvedAt as string | null) ?? null,
    supportingDocuments: (header.supportingDocuments as NormalizedExpense['supportingDocuments']) ?? [],
    lineItems: lines,
  };
  return { ok: true, value, errors, warnings, trace };
}

/** Deterministic JSON for hashing (key order independent). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

const SENSITIVE_PAYLOAD_KEYS = /(ifsc|account_?(id|no|number)|bank_?(account|name)|password|secret|token|mobile|phone|whatsapp)/i;

/** Copy of a source payload with banking/contact details masked, for storage. */
export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactPayload(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_PAYLOAD_KEYS.test(k) && (typeof v === 'string' || typeof v === 'number') ? '[REDACTED]' : redactPayload(v, depth + 1);
  }
  return out;
}

// --- Templates ---------------------------------------------------------------

export interface MappingTemplate {
  id: string;
  name: string;
  description: string;
  mappings: FieldMapping[];
}

export const MAPPING_TEMPLATES: MappingTemplate[] = [
  {
    id: 'tally-monitor-v1',
    name: 'Tally Monitor canonical payload (recommended)',
    description: 'Use with the Kissflow Run Script in docs/KISSFLOW-SETUP.md, which builds a small, explicit payload with one line per category.',
    mappings: [
      { targetField: 'sourceTransactionId', sourcePath: 'source_transaction_id' },
      { targetField: 'requestNumber', sourcePath: 'request_number' },
      { targetField: 'companyKey', sourcePath: 'company_key' },
      { targetField: 'expenseDate', sourcePath: 'expense_date' },
      { targetField: 'employeeCode', sourcePath: 'employee.code' },
      { targetField: 'employeeName', sourcePath: 'employee.name' },
      { targetField: 'employeeEmail', sourcePath: 'employee.email' },
      { targetField: 'vendorName', sourcePath: 'vendor.name|vendor' },
      { targetField: 'expenseCategory', sourcePath: 'category' },
      { targetField: 'description', sourcePath: 'description' },
      { targetField: 'amount', sourcePath: 'amount' },
      { targetField: 'taxAmount', sourcePath: 'tax_amount' },
      { targetField: 'currency', sourcePath: 'currency' },
      { targetField: 'costCentre', sourcePath: 'cost_centre' },
      { targetField: 'approvalStatus', sourcePath: 'approval_status' },
      { targetField: 'approvedAt', sourcePath: 'approved_at' },
      { targetField: 'supportingDocuments', sourcePath: 'documents' },
      { targetField: 'lineItems', sourcePath: 'lines' },
      { targetField: 'item.category', sourcePath: 'category' },
      { targetField: 'item.description', sourcePath: 'description' },
      { targetField: 'item.amount', sourcePath: 'amount' },
      { targetField: 'item.taxAmount', sourcePath: 'tax_amount' },
      { targetField: 'item.costCentre', sourcePath: 'cost_centre' },
      { targetField: 'item.date', sourcePath: 'date' },
    ],
  },
  {
    id: 'kissflow-expense-raw',
    name: 'Kissflow Expense Management (raw item)',
    description: 'Maps the default Kissflow integration output directly. Review the amount and company fields with Finance before going live.',
    mappings: [
      { targetField: 'sourceTransactionId', sourcePath: '_id' },
      { targetField: 'requestNumber', sourcePath: 'Expense_ID|_request_number' },
      { targetField: 'companyKey', sourcePath: 'Req_Entity|Billing_Entity|Entity' },
      { targetField: 'expenseDate', sourcePath: 'Expense_Date|Request_Date|Completed_at_date' },
      { targetField: 'employeeCode', sourcePath: '_created_by._id', transform: 'text' },
      { targetField: 'employeeName', sourcePath: '_created_by' },
      { targetField: 'employeeEmail', sourcePath: 'Requester_Email|Created_by_Email' },
      { targetField: 'expenseCategory', sourcePath: 'Expense_Category|Expense_Type' },
      { targetField: 'description', sourcePath: 'Expense_Purpose|Purpose' },
      { targetField: 'amount', sourcePath: 'Expense_Amount' },
      { targetField: 'costCentre', sourcePath: 'Department' },
      { targetField: 'approvalStatus', sourcePath: '_status' },
      { targetField: 'approvedAt', sourcePath: '_completed_at' },
      { targetField: 'supportingDocuments', sourcePath: 'Attach_Receipts|Attach_Bill|Upload_Bill' },
    ],
  },
];
