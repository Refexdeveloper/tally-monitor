import {
  AppWindow,
  BookOpenCheck,
  Building2,
  ChartColumnBig,
  FileStack,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  ReceiptText,
  ScrollText,
  Server,
  Settings,
  Users,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  shortLabel: string;
  path: string;
  icon: LucideIcon;
  permission: string;
  /** Delivery phase from the implementation plan; 1 = available now. */
  phase: number;
  description: string;
  capabilities: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Highest delivered phase; modules at or below it are live. */
export const CURRENT_PHASE = 7;

export const PHASE_NAMES: Record<number, string> = {
  1: 'Foundation',
  2: 'Configuration',
  3: 'Expense Integration',
  4: 'Accounting Engine',
  5: 'Queue Engine',
  6: 'Tally Bridge',
  7: 'Reporting',
  8: 'Deployment',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        shortLabel: 'Dashboard',
        path: '/',
        icon: LayoutDashboard,
        permission: 'dashboard.view',
        phase: 1,
        description: 'Live overview of integrations, queue and posting health.',
        capabilities: [],
      },
    ],
  },
  {
    title: 'Integration',
    items: [
      {
        key: 'applications',
        label: 'Applications',
        shortLabel: 'Apps',
        path: '/applications',
        icon: AppWindow,
        permission: 'applications.view',
        phase: 2,
        description: 'Register Kissflow applications and connect them to group companies.',
        capabilities: [
          'Add Application wizard with webhook, API and manual modes',
          'Encrypted credentials and integration secret rotation',
          'Many-to-many company connections with source company keys',
          'Field mapping, API logs and connection testing',
        ],
      },
      {
        key: 'companies',
        label: 'Companies',
        shortLabel: 'Companies',
        path: '/companies',
        icon: Building2,
        permission: 'companies.view',
        phase: 2,
        description: 'Manage group companies and their exact TallyPrime company names.',
        capabilities: [
          'Company profile with GSTIN, currency and financial year',
          'Tally server and Bridge Agent assignment',
          'Company-specific ledger and voucher configuration',
          'Per-company queue, reports and audit history',
        ],
      },
      {
        key: 'expenses',
        label: 'Expense Transactions',
        shortLabel: 'Expenses',
        path: '/expenses',
        icon: ReceiptText,
        permission: 'expenses.view',
        phase: 3,
        description: 'Every expense received from Kissflow, normalized and traceable.',
        capabilities: [
          'Filterable listing by company, application, date, amount and status',
          'Original payload, normalized data, line items and tax details',
          'Validation results and processing timeline',
          'Posted voucher and Tally response details',
        ],
      },
      {
        key: 'queue',
        label: 'Processing Queue',
        shortLabel: 'Queue',
        path: '/queue',
        icon: ListOrdered,
        permission: 'jobs.view',
        phase: 5,
        description: 'Persistent MySQL-backed job queue with controlled state transitions.',
        capabilities: [
          'Approve, reject, retry, pause, resume and cancel jobs',
          'Per-company serialization, locking and worker heartbeat',
          'Exponential backoff, dead-letter handling and idempotency',
          'Reconciliation before any ambiguous retry',
        ],
      },
    ],
  },
  {
    title: 'Accounting',
    items: [
      {
        key: 'ledgers',
        label: 'Ledger Management',
        shortLabel: 'Ledgers',
        path: '/ledgers',
        icon: BookOpenCheck,
        permission: 'ledgers.view',
        phase: 4,
        description: 'Company-specific ledger mappings and missing-master workflows.',
        capabilities: [
          'Synced Tally ledgers per company',
          'Configurable category to ledger mappings',
          'Unmapped ledger detection',
          'Finance-approved ledger creation with read-back verification',
        ],
      },
      {
        key: 'vouchers',
        label: 'Voucher Management',
        shortLabel: 'Vouchers',
        path: '/vouchers',
        icon: FileStack,
        permission: 'vouchers.view',
        phase: 4,
        description: 'Voucher configurations, accounting previews and posted vouchers.',
        capabilities: [
          'Payment, Journal, Receipt, Contra and Purchase vouchers',
          'Debit, credit, party and tax ledger rules',
          'Balanced accounting preview before posting',
          'MasterID, AlterID and voucher number capture after verification',
        ],
      },
      {
        key: 'tally',
        label: 'Tally Connections',
        shortLabel: 'Tally',
        path: '/tally',
        icon: Server,
        permission: 'tally.view',
        phase: 2,
        description: 'TallyPrime servers reached securely through the Bridge Agent.',
        capabilities: [
          'Multiple Tally servers and companies per server',
          'Bridge Agent registration, heartbeat and revocation',
          'Company discovery and exact-name validation',
          'Connection tests and health history',
        ],
      },
    ],
  },
  {
    title: 'Insights',
    items: [
      {
        key: 'reports',
        label: 'Reports & Analytics',
        shortLabel: 'Reports',
        path: '/reports',
        icon: ChartColumnBig,
        permission: 'reports.view',
        phase: 7,
        description: 'Company, application, posting and failure reports with exports.',
        capabilities: ['Ten operational and accounting reports', 'Date, company and application filters', 'Excel, CSV and PDF export'],
      },
      {
        key: 'audit',
        label: 'Audit Logs',
        shortLabel: 'Audit',
        path: '/audit',
        icon: ScrollText,
        permission: 'audit.view',
        phase: 5,
        description: 'Immutable trail of every important action.',
        capabilities: ['Append-only audit records enforced by the database', 'Filter by user, company, job and action', 'Request and response references'],
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        key: 'users',
        label: 'User Management',
        shortLabel: 'Users',
        path: '/users',
        icon: Users,
        permission: 'users.view',
        phase: 2,
        description: 'Users, roles, permissions and company-level access.',
        capabilities: ['Invite and deactivate users', 'Configurable role permissions', 'Company access assignment'],
      },
      {
        key: 'settings',
        label: 'Settings',
        shortLabel: 'Settings',
        path: '/settings',
        icon: Settings,
        permission: 'settings.view',
        phase: 2,
        description: 'Queue, posting and integration settings.',
        capabilities: ['Retry and concurrency policies', 'Approval policies', 'Security and session settings'],
      },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
