import { get, http, toApiError } from './client';
import type { ReportCatalogItem, ReportFilters, ReportKey, ReportResult } from './reportTypes';

function clean(params?: ReportFilters) {
  return Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== ''));
}

export const reportsApi = {
  catalog: () => get<ReportCatalogItem[]>('/reports'),
  run: (key: ReportKey, params?: ReportFilters) => get<ReportResult>(`/reports/${key}`, clean(params)),
  export: async (key: ReportKey, format: 'csv' | 'xlsx' | 'pdf', params?: ReportFilters) => {
    try {
      const res = await http.get(`/reports/${key}/export`, {
        params: { ...clean(params), format },
        responseType: 'blob',
        timeout: 120_000,
      });
      const disposition = String(res.headers['content-disposition'] ?? '');
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `report-${key}.${format === 'xlsx' ? 'xlsx' : format}`;
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Axios may put a JSON error body inside a Blob when responseType is blob.
      if (err && typeof err === 'object' && 'response' in err) {
        const ax = err as { response?: { data?: Blob; status?: number } };
        if (ax.response?.data instanceof Blob && ax.response.data.type.includes('json')) {
          const body = JSON.parse(await ax.response.data.text()) as { error?: { message?: string; code?: string } };
          throw toApiError({
            isAxiosError: true,
            response: { status: ax.response.status ?? 400, data: body },
            message: body.error?.message,
          } as never);
        }
      }
      throw toApiError(err);
    }
  },
};
