export type JobStatus =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'VALIDATION_FAILED'
  | 'MAPPING_REQUIRED'
  | 'MASTER_CREATION_REQUIRED'
  | 'AWAITING_APPROVAL'
  | 'READY_TO_POST'
  | 'PROCESSING'
  | 'POSTED'
  | 'FAILED'
  | 'RETRY_PENDING'
  | 'RECONCILIATION_REQUIRED'
  | 'CANCELLED';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export interface UserProfile {
  uuid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roles: { code: string; name: string }[];
  permissions: string[];
  companyScope: 'ALL' | 'ASSIGNED';
  companies: { uuid: string; name: string; code: string }[] | null;
}

export interface SessionResponse {
  accessToken: string;
  expiresIn: number;
  user: UserProfile;
}

export interface DailyPoint {
  date: string;
  value: number;
}

export interface DashboardOverview {
  generatedAt: string;
  applications: { total: number; active: number };
  companies: { total: number; active: number };
  expenses: { total: number; byCurrency: { currency: string; count: number; amount: string }[]; daily: DailyPoint[]; trendPct: number | null };
  jobs: {
    total: number;
    pending: number;
    processing: number;
    posted: number;
    failed: number;
    awaitingApproval: number;
    needsAttention: number;
    postedDaily: DailyPoint[];
    postedTrendPct: number | null;
    failedDaily: DailyPoint[];
    failedTrendPct: number | null;
  };
  masterRequestsPending: number;
}

export interface DashboardAnalytics {
  range: { days: number; from: string; to: string; tzOffset: number };
  expensesByCompany: { uuid: string; name: string; code: string; currency: string; count: number; amount: number }[];
  expensesByApplication: { uuid: string; name: string; code: string; color: string | null; count: number; amount: number }[];
  dailyTransactions: { date: string; count: number; amount: number }[];
  postingOutcome: { totals: { posted: number; failed: number }; daily: { date: string; posted: number; failed: number }[] };
  queueDistribution: { status: JobStatus; count: number }[];
  monthlyTrends: { month: string; expenses: number; expenseAmount: number; posted: number; postedAmount: number }[];
}

export interface DashboardActivity {
  latestExpenses: {
    uuid: string;
    requestNumber: string | null;
    party: string | null;
    category: string | null;
    amount: string;
    currency: string;
    status: JobStatus;
    receivedAt: string;
    application: string;
    company: string;
  }[];
  latestVouchers: {
    uuid: string;
    voucherNumber: string | null;
    voucherType: string;
    voucherDate: string;
    amount: string;
    currency: string;
    verifiedAt: string;
    company: string;
  }[];
  failedJobs: {
    uuid: string;
    status: JobStatus;
    attempts: number;
    errorCode: string | null;
    errorMessage: string | null;
    updatedAt: string;
    company: string;
    application: string;
    requestNumber: string | null;
    amount: string;
    currency: string;
  }[];
  recentApplications: {
    uuid: string;
    name: string;
    code: string;
    status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
    color: string | null;
    icon: string | null;
    createdAt: string;
    companies: number;
  }[];
  companyActivity: {
    uuid: string;
    action: string;
    actorType: 'USER' | 'SYSTEM' | 'AGENT' | 'WEBHOOK';
    previousStatus: string | null;
    newStatus: string | null;
    reference: string | null;
    createdAt: string;
    company: string;
    user: string | null;
  }[];
}

export type ComponentStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'NOT_CONFIGURED';

export interface IntegrationHealth {
  checkedAt: string;
  overall: ComponentStatus;
  api: { status: ComponentStatus; version: string; environment: string; startedAt: string; uptimeSeconds: number };
  database: { status: ComponentStatus; latencyMs: number | null; error?: string };
  agents: {
    status: ComponentStatus;
    items: { uuid: string; name: string; hostname: string | null; version: string | null; status: ComponentStatus; lastHeartbeatAt: string | null; secondsSinceHeartbeat: number | null }[];
  };
  tally: {
    status: ComponentStatus;
    items: {
      uuid: string;
      name: string;
      endpoint: string | null;
      release: string | null;
      status: ComponentStatus;
      companies: number;
      lastHealthCheckAt: string | null;
      lastSuccessAt: string | null;
      lastError: string | null;
    }[];
  };
  lastSuccessfulSync: string | null;
  lastFailedJob: { uuid: string; company: string; errorCode: string | null; errorMessage: string | null; at: string | null } | null;
}
