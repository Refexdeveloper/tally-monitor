import { get, post } from './client';
import type { JobDetail, QueueSummary, ReconcileInput, WorkerStatus } from './queueTypes';

type ActionResult = { id: string; status: string };

export const queueApi = {
  summary: () => get<QueueSummary>('/jobs/summary'),
  worker: () => get<WorkerStatus>('/jobs/worker-status'),
  get: (id: string) => get<JobDetail>(`/jobs/${id}`),
  approve: (id: string, notes?: string) => post<ActionResult>(`/jobs/${id}/approve`, { notes: notes || null }),
  bulkApprove: (jobIds: string[], notes?: string) => post<{ approved: number; failed: number; results: { id: string; ok: boolean; error?: string }[] }>('/jobs/bulk-approve', { jobIds, notes }),
  reject: (id: string, reason: string) => post<ActionResult>(`/jobs/${id}/reject`, { reason }),
  cancel: (id: string, reason: string) => post<ActionResult>(`/jobs/${id}/cancel`, { reason }),
  retry: (id: string) => post<ActionResult>(`/jobs/${id}/retry`),
  pause: (id: string) => post<{ id: string; isPaused: boolean }>(`/jobs/${id}/pause`),
  resume: (id: string) => post<{ id: string; isPaused: boolean }>(`/jobs/${id}/resume`),
  revalidate: (id: string) => post<{ status: string; outcome: string }>(`/jobs/${id}/revalidate`),
  reconcile: (id: string, body: ReconcileInput) => post<ActionResult>(`/jobs/${id}/reconcile`, body),
};
