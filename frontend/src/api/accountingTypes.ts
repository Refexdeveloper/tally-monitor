import type { JobStatus } from './types';
import type { VoucherKind } from './adminTypes';

export interface LedgerRow {
  id: string;
  name: string;
  parentGroup: string | null;
  source: 'TALLY_SYNC' | 'MANUAL_IMPORT' | 'MASTER_REQUEST';
  isActive: boolean;
  syncedAt: string | null;
  lastVerifiedAt: string | null;
  tallyMasterId: string | null;
  mappings: number;
  updatedAt: string;
}

export interface LedgerImportResult {
  created: number;
  updated: number;
  reactivated: number;
  unchanged: number;
  skipped: { line: number; text: string; reason: string }[];
}

export interface LedgerMappingRow {
  id: string;
  sourceCategory: string;
  tallyLedgerName: string;
  costCentre: string | null;
  isActive: boolean;
  application: { id: string; name: string } | null;
  ledgerExists: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface LedgerMappingInput {
  companyId?: string;
  applicationId?: string | null;
  sourceCategory?: string;
  tallyLedgerName?: string;
  costCentre?: string | null;
  isActive?: boolean;
}

export interface UnmappedCategory {
  category: string;
  lines: number;
  expenses: number;
  amount: string;
  currency: string;
  lastSeenAt: string | null;
  applications: string | null;
}

export interface MissingLedger {
  name: string;
  usedBy: string;
  openRequest: { id: string; status: string } | null;
}

export type MasterStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'CREATING' | 'CREATED' | 'VERIFIED' | 'FAILED';
export type MasterType = 'LEDGER' | 'GROUP' | 'COST_CENTRE' | 'COST_CATEGORY' | 'STOCK_ITEM' | 'PARTY_LEDGER' | 'BANK_LEDGER';

export interface MasterRequest {
  id: string;
  masterType: MasterType;
  proposedName: string;
  proposedParent: string | null;
  sourceValue: string | null;
  status: MasterStatus;
  /** error is set by the Bridge Agent when Tally refused to create the master. */
  details: { reason?: string; raisedBy?: string; notes?: string; error?: string } | null;
  reviewNotes: string | null;
  requestedBy: string | null;
  requestedById: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  company: { id: string; name: string };
  job: { id: string; expenseId: string; requestNumber: string | null } | null;
  blockedJobs: number;
  createdAt: string;
  updatedAt: string;
}

export type LedgerRule =
  | { source: 'LEDGER_MAPPING' }
  | { source: 'FIXED'; ledger: string }
  | { source: 'EMPLOYEE_LEDGER'; template?: string }
  | { source: 'VENDOR_LEDGER'; template?: string }
  | { source: 'NONE' }
  | { source: 'CREDIT_LEDGER' };

export interface VoucherConfig {
  id: string;
  voucherKind: VoucherKind;
  tallyVoucherTypeName: string;
  numberingMode: 'TALLY_AUTO' | 'SOURCE_REFERENCE' | 'TEMPLATE';
  numberingTemplate: string | null;
  debitLedgerRule: LedgerRule | null;
  creditLedgerRule: LedgerRule | null;
  partyLedgerRule: LedgerRule | null;
  taxLedgerRule: LedgerRule | null;
  narrationTemplate: string | null;
  referenceTemplate: string | null;
  costCentreEnabled: boolean;
  billAllocationEnabled: boolean;
  approvalPolicy: 'ALWAYS' | 'ABOVE_THRESHOLD' | 'NEVER';
  approvalThreshold: string | null;
  isActive: boolean;
  usage: { mappings: number; jobs: number; defaultFor: string[] };
  updatedAt: string;
}

export type VoucherConfigInput = Omit<VoucherConfig, 'id' | 'usage' | 'updatedAt' | 'approvalPolicy'> & { approvalPolicy: 'ALWAYS' | 'ABOVE_THRESHOLD'; companyId?: string };

export interface VoucherRoutingRule {
  id: string;
  application: { id: string; name: string };
  expenseCategory: string | null;
  priority: number;
  isActive: boolean;
  configuration: { id: string; name: string; voucherKind: VoucherKind; isActive: boolean };
  updatedAt: string;
}

export interface PostedVoucherRow {
  id: string;
  voucherKind: VoucherKind;
  voucherType: string;
  voucherNumber: string | null;
  voucherDate: string;
  reference: string;
  tallyMasterId: string | null;
  tallyAlterId: string | null;
  amount: string;
  currency: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'MISMATCH';
  verifiedAt: string | null;
  company: { id: string; name: string };
  expense: { id: string; requestNumber: string | null };
  application: string;
}

export interface EngineIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  category?: string | null;
  ledger?: string;
}

export interface VoucherPreview {
  voucherKind: string | null;
  voucherType: string | null;
  voucherDate: string;
  voucherNumber: string | null;
  reference: string;
  narration: string;
  partyLedger: string | null;
  entries: { ledger: string; debit: string; credit: string; costCentre: string | null; billReference: string | null; role: 'EXPENSE' | 'TAX' | 'CREDIT' }[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
  approvalRequired: boolean;
  issues: EngineIssue[];
  requiredMasters: { masterType: string; name: string; proposedParent: string; reason: string; category?: string | null }[];
  outcome: 'OK' | 'MAPPING_REQUIRED' | 'MASTER_CREATION_REQUIRED' | 'VALIDATION_FAILED';
  configSource: string;
  configId: string | null;
  currency: string;
  companyName: string;
  tallyCompanyName: string;
  job: { id: string; status: JobStatus; canValidate: boolean } | null;
}

export interface ValidationResult {
  expenseId: string;
  jobId: string;
  previousStatus: JobStatus;
  status: JobStatus;
  outcome: VoucherPreview['outcome'];
  issues: EngineIssue[];
  masterRequestsCreated: number;
}
