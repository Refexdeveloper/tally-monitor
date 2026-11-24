import { AppWindow, FileText, HandCoins, type LucideIcon, Plane, ReceiptText, ShoppingCart, Wallet } from 'lucide-react';
import type { ApplicationType, AuthMethod, IntegrationMode, VoucherKind } from '@/api/adminTypes';

export const APP_ICONS: Record<string, LucideIcon> = {
  receipt: ReceiptText,
  plane: Plane,
  wallet: Wallet,
  'shopping-cart': ShoppingCart,
  'hand-coins': HandCoins,
  'file-text': FileText,
  app: AppWindow,
};
export const appIcon = (name: string | null | undefined) => APP_ICONS[name ?? ''] ?? AppWindow;

export const APP_COLORS = ['#4F46E5', '#8B5CF6', '#FF8A3D', '#10B981', '#0EA5E9', '#F59E0B', '#EC4899', '#F7685B'];

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  EXPENSE_CLAIM: 'Expense claim',
  TRAVEL: 'Travel request',
  PAYMENT_REQUEST: 'Payment request',
  PURCHASE: 'Purchase / procurement',
  ADVANCE: 'Advance request',
  OTHER: 'Other',
};

export const MODE_LABELS: Record<IntegrationMode, { label: string; text: string }> = {
  WEBHOOK: { label: 'Webhook', text: 'Kissflow pushes approved items to a unique, signed endpoint.' },
  API: { label: 'API retrieval', text: 'Tally Monitor pulls approved items from the Kissflow API.' },
  MANUAL: { label: 'Manual import', text: 'Upload test files; useful while designing mappings.' },
};

export const AUTH_LABELS: Record<AuthMethod, string> = {
  HMAC_SHA256: 'HMAC-SHA256 signature',
  BEARER_TOKEN: 'Bearer token',
  API_KEY: 'Kissflow access key',
  NONE: 'None',
};

export const AUTH_OPTIONS: Record<IntegrationMode, AuthMethod[]> = {
  WEBHOOK: ['HMAC_SHA256', 'BEARER_TOKEN'],
  API: ['API_KEY', 'BEARER_TOKEN'],
  MANUAL: ['NONE'],
};

export const VOUCHER_KIND_LABELS: Record<VoucherKind, string> = {
  PAYMENT: 'Payment',
  JOURNAL: 'Journal',
  RECEIPT: 'Receipt',
  CONTRA: 'Contra',
  PURCHASE: 'Purchase',
  SALES: 'Sales (future)',
  CREDIT_NOTE: 'Credit note (future)',
  DEBIT_NOTE: 'Debit note (future)',
};
