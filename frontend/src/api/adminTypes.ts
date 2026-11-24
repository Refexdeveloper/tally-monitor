import type { JobStatus } from './types';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: string | number | undefined;
}

export type CompanyIntegrationStatus = 'INACTIVE' | 'NOT_CONFIGURED' | 'NO_AGENT' | 'AGENT_OFFLINE' | 'CONNECTED';

export interface Company {
  id: string;
  name: string;
  code: string;
  gstin: string | null;
  tallyCompanyName: string;
  defaultCurrency: string;
  financialYearStart: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  tallyServer: {
    id: string;
    name: string;
    endpoint: string | null;
    release: string | null;
    status: string;
    lastHealthCheckAt: string | null;
    companyLoaded?: boolean | null;
    discoveredAt?: string | null;
  } | null;
  ledgersSyncedAt?: string | null;
  agent: { id: string; name: string; lastHeartbeatAt: string | null; overridden: boolean } | null;
  integrationStatus: CompanyIntegrationStatus;
  stats: { connectedApplications: number; expenses: number; expenseAmount: string; postedVouchers: number; openJobs: number; failedJobs: number };
}

export interface CompanyInput {
  name: string;
  code: string;
  gstin?: string | null;
  tallyCompanyName: string;
  tallyServerId?: string | null;
  integrationAgentId?: string | null;
  defaultCurrency?: string;
  financialYearStart?: string | null;
  isActive?: boolean;
}

export interface CompanyApplicationLink {
  applicationId: string;
  name: string;
  code: string;
  status: Application['status'];
  integrationMode: Application['integrationMode'];
  color: string | null;
  icon: string | null;
  sourceCompanyKey: string;
  isActive: boolean;
  linkedAt: string;
  expenses: number;
  lastReceivedAt: string | null;
}

export type IntegrationMode = 'WEBHOOK' | 'API' | 'MANUAL';
export type AuthMethod = 'HMAC_SHA256' | 'BEARER_TOKEN' | 'API_KEY' | 'NONE';
export type VoucherKind = 'PAYMENT' | 'JOURNAL' | 'RECEIPT' | 'CONTRA' | 'PURCHASE' | 'SALES' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type ApplicationType = 'EXPENSE_CLAIM' | 'TRAVEL' | 'PAYMENT_REQUEST' | 'PURCHASE' | 'ADVANCE' | 'OTHER';

export interface Application {
  id: string;
  name: string;
  code: string;
  description: string | null;
  applicationType: ApplicationType;
  icon: string | null;
  color: string | null;
  kissflowAccount: string | null;
  kissflowAppId: string | null;
  kissflowProcessId: string | null;
  integrationMode: IntegrationMode;
  apiEndpoint: string | null;
  authMethod: AuthMethod;
  defaultVoucherKind: VoucherKind | null;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  webhookUrl: string | null;
  hasWebhookSecret: boolean;
  lastRequestAt: string | null;
  lastSuccessAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: { connectedCompanies: number; expenses: number; expenseAmount: string; openJobs: number };
  credentials?: { id: string; type: string; label: string | null; hint: string | null; createdAt: string; rotatedAt: string | null }[];
}

export interface ApplicationInput {
  name: string;
  code: string;
  description?: string | null;
  applicationType: ApplicationType;
  icon?: string | null;
  color?: string | null;
  kissflowAccount?: string | null;
  kissflowAppId?: string | null;
  kissflowProcessId?: string | null;
  integrationMode: IntegrationMode;
  apiEndpoint?: string | null;
  authMethod: AuthMethod;
  defaultVoucherKind?: VoucherKind | null;
  status?: Application['status'];
  credentials?: { apiKeyId?: string; apiKeySecret?: string; bearerToken?: string };
  companies?: { companyId: string; sourceCompanyKey: string }[];
}

export interface ApplicationCompanyLink {
  companyId: string;
  name: string;
  code: string;
  tallyCompanyName: string;
  companyActive: boolean;
  sourceCompanyKey: string;
  isActive: boolean;
  linkedAt: string;
  expenses: number;
  lastReceivedAt: string | null;
}

export interface CheckResult {
  ok: boolean;
  testedAt: string;
  checks: { name: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }[];
  note?: string;
}

export interface TallyServer {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'HTTP' | 'HTTPS';
  tallyRelease: string | null;
  isActive: boolean;
  reportedStatus: string;
  effectiveStatus: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN' | 'INACTIVE';
  lastHealthCheckAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  agent: { id: string; name: string; online: boolean; lastHeartbeatAt: string | null } | null;
  /** loadedInTally is null until the agent has reported which companies are open in TallyPrime. */
  companies: { id: string; name: string; code: string; tallyCompanyName: string; isActive: boolean; loadedInTally: boolean | null }[];
  discoveredCompanies: string[] | null;
  discoveredAt: string | null;
  createdAt: string;
}

export interface TallyServerInput {
  name: string;
  host: string;
  port: number;
  protocol: 'HTTP' | 'HTTPS';
  tallyRelease?: string | null;
  integrationAgentId?: string | null;
  isActive?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  agentKey: string;
  status: 'PENDING' | 'ONLINE' | 'OFFLINE' | 'REVOKED';
  hostname: string | null;
  osInfo: string | null;
  agentVersion: string | null;
  lastHeartbeatAt: string | null;
  lastIp: string | null;
  maxConcurrency: number;
  servers: number;
  createdAt: string;
  revokedAt: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  isActive: boolean;
  companyScope: 'ALL' | 'ASSIGNED';
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { code: string; name: string }[];
  companies: { id: string; name: string }[];
}

export interface UserInput {
  email?: string;
  fullName?: string;
  password?: string;
  roles?: string[];
  companyScope?: 'ALL' | 'ASSIGNED';
  companyIds?: string[];
  isActive?: boolean;
}

export interface RoleDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  editable: boolean;
  users: number;
  permissions: string[];
}

export interface PermissionDto {
  code: string;
  module: string;
  description: string | null;
}

export interface SettingDto {
  key: string;
  category: string;
  label: string;
  description: string | null;
  type: 'integer' | 'boolean';
  unit: string | null;
  min: number | null;
  max: number | null;
  value: unknown;
  locked: { reason: string } | null;
  updatedAt: string | null;
}

export interface SettingsResponse {
  settings: SettingDto[];
  security: Record<string, number>;
}

export interface ExpenseRow {
  id: string;
  requestNumber: string | null;
  sourceTransactionId: string;
  expenseDate: string;
  party: string | null;
  category: string | null;
  amount: string;
  currency: string;
  approvalStatus: string;
  status: JobStatus;
  voucherNumber: string | null;
  voucherKind: VoucherKind | null;
  kissflowRequestId: string | null;
  receivedAt: string;
  createdAt: string;
  application: { id: string; name: string };
  company: { id: string; name: string };
}

export interface JobRow {
  id: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  isPaused: boolean;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  expense: { id: string; requestNumber: string | null; amount: string; currency: string };
  application: string;
  company: string;
  voucherType: string | null;
}

// --- Phase 3: intake & expenses ----------------------------------------------

export type Transform = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'upper' | 'lower' | 'user_name' | 'user_id' | 'approval' | 'attachments' | 'boolean' | 'array';

export interface TargetField {
  field: string;
  label: string;
  group: 'header' | 'item';
  required: boolean;
  transform: Transform;
  description: string;
}

export interface FieldMappingRow {
  targetField: string;
  sourcePath: string;
  transform?: Transform | null;
  defaultValue?: string | null;
  isRequired?: boolean;
}

export interface MappingCatalog {
  fields: TargetField[];
  transforms: Transform[];
  templates: { id: string; name: string; description: string; mappings: FieldMappingRow[] }[];
}

export interface Issue {
  field: string;
  message: string;
}

export interface NormalizedExpense {
  sourceTransactionId: string;
  requestNumber: string | null;
  companyKey: string;
  expenseDate: string;
  employeeCode: string | null;
  employeeName: string | null;
  employeeEmail: string | null;
  vendorName: string | null;
  expenseCategory: string | null;
  description: string | null;
  amount: string;
  taxAmount: string;
  currency: string | null;
  costCentre: string | null;
  approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  approvedAt: string | null;
  supportingDocuments: { name: string | null; key: string | null }[];
  lineItems: { lineNo: number; category: string | null; description: string | null; amount: string; taxAmount: string; costCentre: string | null; date: string | null }[];
}

export interface MappingPreview {
  ok: boolean;
  mappingIssues: Issue[];
  normalized: NormalizedExpense | null;
  errors: Issue[];
  warnings: Issue[];
  trace: Record<string, { raw: unknown; value: unknown }>;
  checks: CheckResult['checks'];
}

export interface IntakeOutcome {
  httpStatus: number;
  status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';
  code?: string;
  message: string;
  details?: unknown;
  receiptId?: string;
  expenseId?: string;
  jobId?: string;
  warnings?: Issue[];
}

export interface ReceiptRow {
  id: string;
  source: 'WEBHOOK' | 'API' | 'MANUAL';
  status: IntakeOutcome['status'];
  httpStatus: number;
  authResult: string;
  errorCode: string | null;
  errorMessage: string | null;
  sourceTransactionId: string | null;
  payloadSize: number | null;
  ipAddress: string | null;
  durationMs: number | null;
  expenseId: string | null;
  createdAt: string;
}

export interface ReceiptDetail extends ReceiptRow {
  errorDetails: unknown;
  idempotencyKey: string | null;
  payloadHash: string | null;
  payload: unknown;
  normalized: unknown;
  requestHeaders: Record<string, string> | null;
}

export interface ExpenseDetail {
  id: string;
  sourceTransactionId: string;
  kissflowRequestId: string | null;
  requestNumber: string | null;
  idempotencyKey: string;
  payloadHash: string;
  expenseDate: string;
  employeeCode: string | null;
  employeeName: string | null;
  vendorName: string | null;
  category: string | null;
  description: string | null;
  amount: string;
  taxAmount: string;
  currency: string;
  costCentre: string | null;
  voucherKind: VoucherKind | null;
  approvalStatus: string;
  status: JobStatus;
  receivedAt: string;
  updatedAt: string;
  supportingDocuments: { name: string | null; key: string | null; fileExtension?: string | null; size?: number | null }[];
  originalPayload: unknown;
  normalizedPayload: unknown;
  validationResults: { intake?: { source: string; receivedAt: string; warnings: Issue[] } } | null;
  application: { id: string; name: string; code: string; integrationMode: IntegrationMode; color: string | null; icon: string | null };
  company: { id: string; name: string; code: string; tallyCompanyName: string; defaultCurrency: string };
  items: { lineNo: number; category: string | null; description: string | null; amount: string; taxAmount: string; costCentre: string | null; ledger: string | null; ledgerStatus: 'RESOLVED' | 'MAPPED' | 'MASTER_MISSING' | 'UNMAPPED' }[];
  jobs: {
    id: string;
    status: JobStatus;
    priority: number;
    attempts: number;
    maxAttempts: number;
    isPaused: boolean;
    isDeadLetter: boolean;
    nextRetryAt: string | null;
    lastAttemptAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    voucherType: string | null;
    approvedAt: string | null;
    approvedBy: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
    updatedAt: string;
    attempts_: { id: string; attemptNo: number; operation: string; fromStatus: string | null; toStatus: string | null; outcome: string; errorCode: string | null; errorMessage: string | null; startedAt: string; finishedAt: string | null; durationMs: number | null }[];
  }[];
  tallyResponses: { id: string; operation: string; httpStatus: number | null; created: number; altered: number; errors: number; lineError: string | null; responseExcerpt: string | null; createdAt: string }[];
  postedVouchers: { id: string; voucherKind: VoucherKind; voucherType: string; voucherNumber: string | null; voucherDate: string; reference: string; tallyMasterId: string | null; tallyAlterId: string | null; tallyGuid: string | null; amount: string; currency: string; verificationStatus: string; verifiedAt: string | null }[];
  receipts: { id: string; source: string; status: string; httpStatus: number; errorCode: string | null; createdAt: string }[];
  timeline: { id: string; action: string; actorType: string; previousStatus: string | null; newStatus: string | null; user: string | null; createdAt: string }[];
}

export interface AuditRow {
  id: string;
  actorType: 'USER' | 'SYSTEM' | 'AGENT' | 'WEBHOOK';
  action: string;
  entityType: string | null;
  entityId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  reference: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: string | null;
  company: string | null;
  application: string | null;
}
