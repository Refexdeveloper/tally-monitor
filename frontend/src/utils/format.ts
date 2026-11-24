const numberFmt = new Intl.NumberFormat('en-IN');
const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export const formatNumber = (n: number) => numberFmt.format(n);
export const formatCompact = (n: number) => (Math.abs(n) < 10_000 ? numberFmt.format(n) : compactFmt.format(n));

/** Money arrives from the API as decimal strings; Number() here is for display only. */
export function formatMoney(amount: string | number, currency = 'INR', opts: { compact?: boolean } = {}) {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    notation: opts.compact && Math.abs(value) >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 2,
    minimumFractionDigits: opts.compact ? 0 : 2,
  }).format(value);
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(value: string | null | undefined): string {
  if (!value) return 'never';
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
export const shortMonth = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

export const humanize = (code: string) => code.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
