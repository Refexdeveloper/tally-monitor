import type {
  LedgerImportResult,
  LedgerMappingInput,
  LedgerMappingRow,
  LedgerRow,
  MasterRequest,
  MasterType,
  MissingLedger,
  PostedVoucherRow,
  UnmappedCategory,
  ValidationResult,
  VoucherConfig,
  VoucherConfigInput,
  VoucherPreview,
  VoucherRoutingRule,
} from './accountingTypes';
import type { ListParams } from './adminTypes';
import { del, get, getPage, post, put } from './client';

export const ledgersApi = {
  list: (params: ListParams) => getPage<LedgerRow>('/ledgers', params),
  importList: (companyId: string, text: string) => post<LedgerImportResult>('/ledgers/import', { companyId, text }),
  update: (id: string, body: { isActive?: boolean; parentGroup?: string | null }) => put<{ id: string }>(`/ledgers/${id}`, body),
  unmapped: (companyId: string) => get<UnmappedCategory[]>('/ledgers/unmapped', { companyId }),
  missing: (companyId: string) => get<MissingLedger[]>('/ledgers/missing', { companyId }),
  mappings: (companyId: string, search?: string) => get<LedgerMappingRow[]>('/ledger-mappings', { companyId, search: search || undefined }),
  createMapping: (body: LedgerMappingInput) => post<LedgerMappingRow>('/ledger-mappings', body),
  updateMapping: (id: string, body: LedgerMappingInput) => put<LedgerMappingRow>(`/ledger-mappings/${id}`, body),
  deleteMapping: (id: string) => del<{ deleted: boolean }>(`/ledger-mappings/${id}`),
  requests: (params: ListParams) => getPage<MasterRequest>('/master-requests', params),
  createRequest: (body: { companyId: string; masterType: MasterType; proposedName: string; proposedParent: string; sourceValue?: string | null; notes?: string | null }) =>
    post<MasterRequest>('/master-requests', body),
  editRequest: (id: string, body: { proposedName?: string; proposedParent?: string }) => put<MasterRequest>(`/master-requests/${id}`, body),
  approve: (id: string, notes?: string) => post<MasterRequest>(`/master-requests/${id}/approve`, { notes }),
  reject: (id: string, notes: string) => post<MasterRequest>(`/master-requests/${id}/reject`, { notes }),
  markCreated: (id: string) => post<MasterRequest>(`/master-requests/${id}/mark-created`),
  retryCreation: (id: string) => post<MasterRequest>(`/master-requests/${id}/retry-creation`),
};

export const vouchersApi = {
  configs: (companyId: string) => get<VoucherConfig[]>('/voucher-configurations', { companyId }),
  createConfig: (body: VoucherConfigInput) => post<VoucherConfig>('/voucher-configurations', body),
  updateConfig: (id: string, body: Partial<VoucherConfigInput>) => put<VoucherConfig>(`/voucher-configurations/${id}`, body),
  rules: (companyId: string) => get<VoucherRoutingRule[]>('/voucher-mappings', { companyId }),
  createRule: (body: { companyId: string; applicationId: string; expenseCategory: string | null; voucherConfigurationId: string; priority: number; isActive: boolean }) =>
    post<VoucherRoutingRule>('/voucher-mappings', body),
  updateRule: (id: string, body: { expenseCategory?: string | null; voucherConfigurationId?: string; priority?: number; isActive?: boolean }) => put<VoucherRoutingRule>(`/voucher-mappings/${id}`, body),
  deleteRule: (id: string) => del<{ deleted: boolean }>(`/voucher-mappings/${id}`),
  posted: (params: ListParams) => getPage<PostedVoucherRow>('/vouchers', params),
};

export const accountingApi = {
  preview: (expenseId: string) => get<VoucherPreview>(`/expenses/${expenseId}/voucher-preview`),
  validate: (expenseId: string) => post<ValidationResult>(`/expenses/${expenseId}/validate`),
  revalidateCompany: (companyId: string) => post<Record<string, number | string>>(`/companies/${companyId}/revalidate`),
};
