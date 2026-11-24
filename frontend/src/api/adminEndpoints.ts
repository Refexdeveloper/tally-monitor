import type {
  Agent,
  AppUser,
  Application,
  ApplicationCompanyLink,
  ApplicationInput,
  AuditRow,
  CheckResult,
  Company,
  CompanyApplicationLink,
  CompanyInput,
  ExpenseDetail,
  ExpenseRow,
  FieldMappingRow,
  IntakeOutcome,
  JobRow,
  ListParams,
  MappingCatalog,
  MappingPreview,
  ReceiptDetail,
  ReceiptRow,
  PermissionDto,
  RoleDto,
  SettingDto,
  SettingsResponse,
  TallyServer,
  TallyServerInput,
  UserInput,
} from './adminTypes';
import { del, get, getPage, post, put } from './client';

export const companiesApi = {
  list: (params: ListParams) => getPage<Company>('/companies', params),
  get: (id: string) => get<Company>(`/companies/${id}`),
  create: (body: CompanyInput) => post<Company>('/companies', body),
  update: (id: string, body: Partial<CompanyInput>) => put<Company>(`/companies/${id}`, body),
  applications: (id: string) => get<CompanyApplicationLink[]>(`/companies/${id}/applications`),
};

export const applicationsApi = {
  list: (params: ListParams) => getPage<Application>('/applications', params),
  get: (id: string) => get<Application>(`/applications/${id}`),
  create: (body: ApplicationInput) => post<{ application: Application; webhookSecret: string | null }>('/applications', body),
  update: (id: string, body: Partial<ApplicationInput>) => put<{ application: Application; webhookSecret: string | null }>(`/applications/${id}`, body),
  remove: (id: string) => del<{ deleted: boolean }>(`/applications/${id}`),
  regenerateSecret: (id: string) => post<{ webhookSecret: string; webhookUrl: string }>(`/applications/${id}/regenerate-secret`),
  testConnection: (id: string) => post<CheckResult>(`/applications/${id}/test-connection`),
  companies: (id: string) => get<ApplicationCompanyLink[]>(`/applications/${id}/companies`),
  addCompany: (id: string, body: { companyId: string; sourceCompanyKey: string }) => post<ApplicationCompanyLink[]>(`/applications/${id}/companies`, body),
  updateCompany: (id: string, companyId: string, body: { sourceCompanyKey?: string; isActive?: boolean }) =>
    put<ApplicationCompanyLink[]>(`/applications/${id}/companies/${companyId}`, body),
  removeCompany: (id: string, companyId: string) => del<{ mode: 'REMOVED' | 'DEACTIVATED'; companies: ApplicationCompanyLink[] }>(`/applications/${id}/companies/${companyId}`),
};

export const tallyApi = {
  servers: () => get<TallyServer[]>('/tally/connections'),
  createServer: (body: TallyServerInput) => post<TallyServer>('/tally/connections', body),
  updateServer: (id: string, body: Partial<TallyServerInput>) => put<TallyServer>(`/tally/connections/${id}`, body),
  testServer: (id: string) => post<CheckResult>(`/tally/connections/${id}/test`),
  agents: () => get<Agent[]>('/tally/agents'),
  createAgent: (body: { name: string; maxConcurrency?: number }) => post<{ agent: Agent; agentSecret: string }>('/tally/agents', body),
  rotateAgent: (id: string) => post<{ agentKey: string; agentSecret: string }>(`/tally/agents/${id}/rotate-secret`),
  revokeAgent: (id: string) => post<Agent>(`/tally/agents/${id}/revoke`),
};

export const usersApi = {
  list: (params: ListParams) => getPage<AppUser>('/users', params),
  create: (body: UserInput) => post<AppUser>('/users', body),
  update: (id: string, body: UserInput) => put<AppUser>(`/users/${id}`, body),
  unlock: (id: string) => post<AppUser>(`/users/${id}/unlock`),
  setPassword: (id: string, password: string) => post<{ updated: boolean }>(`/users/${id}/password`, { password }),
  roles: () => get<RoleDto[]>('/roles'),
  permissions: () => get<PermissionDto[]>('/roles/permissions'),
  createRole: (body: { code: string; name: string; description?: string | null; permissions: string[] }) => post<RoleDto>('/roles', body),
  updateRole: (id: string, body: { name?: string; description?: string | null; permissions: string[] }) => put<RoleDto>(`/roles/${id}`, body),
  deleteRole: (id: string) => del<{ deleted: boolean }>(`/roles/${id}`),
};

export const settingsApi = {
  list: () => get<SettingsResponse>('/settings'),
  update: (key: string, value: unknown) => put<SettingDto>(`/settings/${key}`, { value }),
};

export const intakeApi = {
  catalog: () => get<MappingCatalog>('/applications/mapping-catalog'),
  mappings: (id: string) => get<FieldMappingRow[]>(`/applications/${id}/mappings`),
  saveMappings: (id: string, mappings: FieldMappingRow[]) => put<FieldMappingRow[]>(`/applications/${id}/mappings`, { mappings }),
  preview: (id: string, payload: unknown, mappings?: FieldMappingRow[]) => post<MappingPreview>(`/applications/${id}/mappings/preview`, { payload, mappings }),
  importPayload: (id: string, payload: unknown) => post<IntakeOutcome>(`/applications/${id}/import`, { payload }),
  sync: (id: string) => post<{ fetched: number; processed: number; accepted: number; duplicate: number; rejected: number; failed: number }>(`/applications/${id}/sync`),
  receipts: (id: string, params: ListParams) => getPage<ReceiptRow>(`/applications/${id}/receipts`, params),
  receipt: (id: string, receiptId: string) => get<ReceiptDetail>(`/applications/${id}/receipts/${receiptId}`),
};

export const recordsApi = {
  expense: (id: string) => get<ExpenseDetail>(`/expenses/${id}`),
  expenseCategories: () => get<string[]>('/expenses/categories'),
  expenses: (params: ListParams) => getPage<ExpenseRow>('/expenses', params),
  jobs: (params: ListParams) => getPage<JobRow>('/jobs', params),
  audit: (params: ListParams) => getPage<AuditRow>('/audit-logs', params),
};
