export const JOB_STATUSES = [
  'RECEIVED',
  'VALIDATING',
  'VALIDATION_FAILED',
  'MAPPING_REQUIRED',
  'MASTER_CREATION_REQUIRED',
  'AWAITING_APPROVAL',
  'READY_TO_POST',
  'PROCESSING',
  'POSTED',
  'FAILED',
  'RETRY_PENDING',
  'RECONCILIATION_REQUIRED',
  'CANCELLED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Allowed transitions. PROCESSING never goes straight back to READY_TO_POST:
 * once a submission may have reached Tally, the outcome is either verified
 * (POSTED), definitively rejected (FAILED), retryable because the request never
 * left the agent (RETRY_PENDING), or ambiguous (RECONCILIATION_REQUIRED).
 */
export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  RECEIVED: ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['VALIDATION_FAILED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED', 'AWAITING_APPROVAL', 'READY_TO_POST', 'CANCELLED'],
  VALIDATION_FAILED: ['VALIDATING', 'CANCELLED'],
  MAPPING_REQUIRED: ['VALIDATING', 'CANCELLED'],
  MASTER_CREATION_REQUIRED: ['VALIDATING', 'CANCELLED'],
  AWAITING_APPROVAL: ['READY_TO_POST', 'VALIDATING', 'CANCELLED'],
  READY_TO_POST: ['PROCESSING', 'VALIDATING', 'CANCELLED'],
  PROCESSING: ['POSTED', 'FAILED', 'RETRY_PENDING', 'RECONCILIATION_REQUIRED'],
  RETRY_PENDING: ['PROCESSING', 'VALIDATING', 'CANCELLED'],
  FAILED: ['RETRY_PENDING', 'VALIDATING', 'CANCELLED'],
  // Only after an operator has checked Tally: found => POSTED, confirmed absent => RETRY_PENDING.
  RECONCILIATION_REQUIRED: ['POSTED', 'RETRY_PENDING'],
  POSTED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly JobStatus[] = ['POSTED', 'CANCELLED'];

/** Dashboard groupings of the queue. */
export const STATUS_GROUPS = {
  pending: ['RECEIVED', 'VALIDATING', 'READY_TO_POST', 'RETRY_PENDING'],
  processing: ['PROCESSING'],
  posted: ['POSTED'],
  failed: ['FAILED'],
  awaitingApproval: ['AWAITING_APPROVAL'],
  attention: ['VALIDATION_FAILED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED', 'RECONCILIATION_REQUIRED'],
} as const satisfies Record<string, readonly JobStatus[]>;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: JobStatus,
    public readonly to: JobStatus,
  ) {
    super(`Job cannot move from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Exponential backoff with +/-20% jitter, capped at maxSeconds. */
export function retryDelaySeconds(attempt: number, baseSeconds: number, maxSeconds: number, random: () => number = Math.random): number {
  const exp = baseSeconds * 2 ** Math.max(0, attempt - 1);
  const jitter = 0.8 + random() * 0.4;
  return Math.min(maxSeconds, Math.round(exp * jitter));
}
