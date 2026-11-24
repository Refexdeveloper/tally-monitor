import type { ComponentStatus, JobStatus } from '@/api/types';
import { brand } from '@/theme/theme';

export const JOB_STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  RECEIVED: { label: 'Received', color: brand.sky.main },
  VALIDATING: { label: 'Validating', color: brand.indigo.light },
  VALIDATION_FAILED: { label: 'Validation failed', color: brand.coral.dark },
  MAPPING_REQUIRED: { label: 'Mapping required', color: brand.amber.main },
  MASTER_CREATION_REQUIRED: { label: 'Master required', color: brand.orange.main },
  AWAITING_APPROVAL: { label: 'Awaiting approval', color: brand.purple.main },
  READY_TO_POST: { label: 'Ready to post', color: brand.indigo.main },
  PROCESSING: { label: 'Processing', color: brand.sky.dark },
  POSTED: { label: 'Posted', color: brand.emerald.main },
  FAILED: { label: 'Failed', color: brand.coral.main },
  RETRY_PENDING: { label: 'Retry pending', color: brand.amber.dark },
  RECONCILIATION_REQUIRED: { label: 'Reconciliation', color: '#EC4899' },
  CANCELLED: { label: 'Cancelled', color: '#94A3B8' },
};

export const COMPONENT_STATUS_META: Record<ComponentStatus, { label: string; color: string }> = {
  UP: { label: 'Online', color: brand.emerald.main },
  DEGRADED: { label: 'Degraded', color: brand.amber.main },
  DOWN: { label: 'Offline', color: brand.coral.main },
  UNKNOWN: { label: 'Unknown', color: '#94A3B8' },
  NOT_CONFIGURED: { label: 'Not configured', color: '#94A3B8' },
};
