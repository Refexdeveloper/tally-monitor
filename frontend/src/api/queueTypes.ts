import type { VoucherPreview } from './accountingTypes';
import type { JobStatus } from './types';

export interface QueueSummary {
  byStatus: Partial<Record<JobStatus, number>>;
  paused: number;
  deadLetter: number;
  total: number;
}

export interface WorkerStatus {
  status: 'RUNNING' | 'STALLED' | 'NOT_STARTED';
  owner: string | null;
  heartbeatAt: string | null;
  stats: { lastTickAt: string; durationMs: number; recovered: number; validated: number; duePostings: number } | null;
  settings: { autoValidate: boolean; serializePerCompany: boolean; maxAttempts: number; lockTtlSeconds: number; intervalSeconds: number };
}

export interface JobDetail {
  id: string;
  status: JobStatus;
  priority: number;
  isPaused: boolean;
  pausedBy: string | null;
  pausedAt: string | null;
  isDeadLetter: boolean;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  lock: { agent: string | null; lockedAt: string | null; expiresAt: string | null; heartbeatAt: string | null; submissionStartedAt: string | null } | null;
  submissionStartedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string;
  approval: { by: string | null; at: string | null; notes: string | null; hashMatches: boolean | null } | null;
  rejection: { by: string | null; at: string | null; reason: string | null } | null;
  cancellation: { by: string | null; at: string | null; reason: string | null } | null;
  voucherDraft: (Omit<VoucherPreview, 'configSource' | 'configId' | 'currency' | 'companyName' | 'tallyCompanyName' | 'job'>) | null;
  voucherConfiguration: { id: string; name: string } | null;
  expense: { id: string; requestNumber: string | null; sourceTransactionId: string; amount: string; currency: string; expenseDate: string; party: string | null; category: string | null; originalPayload: unknown; normalizedPayload: unknown };
  company: { id: string; name: string; tallyCompanyName: string };
  application: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  attemptsHistory: { id: string; attemptNo: number; operation: string; fromStatus: string | null; toStatus: string | null; outcome: string; errorCode: string | null; errorMessage: string | null; startedAt: string; finishedAt: string | null; durationMs: number | null; by: string }[];
  tallyResponses: { id: string; attemptNo: number | null; operation: string; httpStatus: number | null; created: number; altered: number; errors: number; lineError: string | null; responseBody: string | null; requestHash: string | null; createdAt: string }[];
  timeline: { id: string; action: string; actorType: string; previousStatus: string | null; newStatus: string | null; by: string; metadata: Record<string, unknown> | null; createdAt: string }[];
}

export type ReconcileInput =
  | { resolution: 'FOUND'; notes: string; voucherNumber: string; voucherDate: string; tallyMasterId?: string; tallyAlterId?: string }
  | { resolution: 'NOT_FOUND'; notes: string };
