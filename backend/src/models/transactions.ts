import { DataTypes, Model, type CreationOptional, type ForeignKey, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { JOB_STATUSES, type JobStatus } from '../domain/jobStatus';
import { bigId, money, uuidColumn, VOUCHER_KINDS, type VoucherKind } from './common';

export class ExpenseTransaction extends Model<InferAttributes<ExpenseTransaction>, InferCreationAttributes<ExpenseTransaction>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare applicationId: ForeignKey<number>;
  declare companyId: ForeignKey<number>;
  declare sourceTransactionId: string;
  declare kissflowRequestId: string | null;
  declare requestNumber: string | null;
  declare idempotencyKey: string;
  declare payloadHash: string;
  declare expenseDate: string;
  declare employeeCode: string | null;
  declare employeeName: string | null;
  declare vendorName: string | null;
  declare expenseCategory: string | null;
  declare description: string | null;
  declare amount: string;
  declare taxAmount: CreationOptional<string>;
  declare currency: CreationOptional<string>;
  declare costCentre: string | null;
  declare voucherKind: VoucherKind | null;
  declare approvalStatus: CreationOptional<'PENDING' | 'APPROVED' | 'REJECTED'>;
  declare processingStatus: CreationOptional<JobStatus>;
  declare supportingDocuments: unknown;
  declare originalPayload: unknown;
  declare normalizedPayload: unknown;
  declare validationResults: unknown;
  declare receivedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ExpenseTransaction.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    applicationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sourceTransactionId: { type: DataTypes.STRING(150), allowNull: false },
    kissflowRequestId: DataTypes.STRING(150),
    requestNumber: DataTypes.STRING(100),
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    payloadHash: { type: DataTypes.CHAR(64), allowNull: false },
    expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
    employeeCode: DataTypes.STRING(64),
    employeeName: DataTypes.STRING(150),
    vendorName: DataTypes.STRING(200),
    expenseCategory: DataTypes.STRING(150),
    description: DataTypes.STRING(1000),
    amount: money(),
    taxAmount: money(),
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR' },
    costCentre: DataTypes.STRING(255),
    voucherKind: DataTypes.ENUM(...VOUCHER_KINDS),
    approvalStatus: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'APPROVED' },
    processingStatus: { type: DataTypes.ENUM(...JOB_STATUSES), allowNull: false, defaultValue: 'RECEIVED' },
    supportingDocuments: DataTypes.JSON,
    originalPayload: { type: DataTypes.JSON, allowNull: false },
    normalizedPayload: DataTypes.JSON,
    validationResults: DataTypes.JSON,
    receivedAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'expense_transactions' },
);

export class ExpenseItem extends Model<InferAttributes<ExpenseItem>, InferCreationAttributes<ExpenseItem>> {
  declare id: CreationOptional<number>;
  declare expenseId: ForeignKey<number>;
  declare lineNo: number;
  declare category: string;
  declare description: string | null;
  declare amount: string;
  declare taxAmount: CreationOptional<string>;
  declare costCentre: string | null;
  declare resolvedLedgerName: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ExpenseItem.init(
  {
    id: bigId(),
    expenseId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    lineNo: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    category: { type: DataTypes.STRING(150), allowNull: false },
    description: DataTypes.STRING(1000),
    amount: money(),
    taxAmount: money(),
    costCentre: DataTypes.STRING(255),
    resolvedLedgerName: DataTypes.STRING(255),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'expense_items' },
);

export class ProcessingJob extends Model<InferAttributes<ProcessingJob>, InferCreationAttributes<ProcessingJob>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare expenseId: ForeignKey<number>;
  declare companyId: ForeignKey<number>;
  declare applicationId: ForeignKey<number>;
  declare voucherConfigurationId: ForeignKey<number | null>;
  declare idempotencyKey: string;
  declare status: CreationOptional<JobStatus>;
  declare priority: CreationOptional<number>;
  declare isPaused: CreationOptional<boolean>;
  declare attempts: CreationOptional<number>;
  declare maxAttempts: CreationOptional<number>;
  declare nextRetryAt: Date | null;
  declare lastAttemptAt: Date | null;
  declare lockedByAgentId: number | null;
  declare lockedAt: Date | null;
  declare lockExpiresAt: Date | null;
  declare heartbeatAt: Date | null;
  declare submissionStartedAt: Date | null;
  declare lastErrorCode: string | null;
  declare lastErrorMessage: string | null;
  declare voucherPayload: unknown;
  declare isDeadLetter: CreationOptional<boolean>;
  declare approvedBy: number | null;
  declare approvedAt: Date | null;
  declare approvedVoucherHash: CreationOptional<string | null>;
  declare approvalNotes: CreationOptional<string | null>;
  declare rejectedBy: number | null;
  declare rejectedAt: Date | null;
  declare rejectionReason: string | null;
  declare cancelledBy: CreationOptional<number | null>;
  declare cancelledAt: CreationOptional<Date | null>;
  declare cancellationReason: CreationOptional<string | null>;
  declare pausedBy: CreationOptional<number | null>;
  declare pausedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ProcessingJob.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    expenseId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    applicationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    voucherConfigurationId: DataTypes.INTEGER.UNSIGNED,
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM(...JOB_STATUSES), allowNull: false, defaultValue: 'RECEIVED' },
    priority: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 5 },
    isPaused: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    attempts: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 5 },
    nextRetryAt: DataTypes.DATE(3),
    lastAttemptAt: DataTypes.DATE(3),
    lockedByAgentId: DataTypes.INTEGER.UNSIGNED,
    lockedAt: DataTypes.DATE(3),
    lockExpiresAt: DataTypes.DATE(3),
    heartbeatAt: DataTypes.DATE(3),
    submissionStartedAt: DataTypes.DATE(3),
    lastErrorCode: DataTypes.STRING(64),
    lastErrorMessage: DataTypes.STRING(2000),
    voucherPayload: DataTypes.JSON,
    isDeadLetter: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approvedBy: DataTypes.BIGINT.UNSIGNED,
    approvedAt: DataTypes.DATE(3),
    approvedVoucherHash: DataTypes.CHAR(64),
    approvalNotes: DataTypes.STRING(1000),
    rejectedBy: DataTypes.BIGINT.UNSIGNED,
    rejectedAt: DataTypes.DATE(3),
    rejectionReason: DataTypes.STRING(1000),
    cancelledBy: DataTypes.BIGINT.UNSIGNED,
    cancelledAt: DataTypes.DATE(3),
    cancellationReason: DataTypes.STRING(1000),
    pausedBy: DataTypes.BIGINT.UNSIGNED,
    pausedAt: DataTypes.DATE(3),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'processing_jobs' },
);

export class JobAttempt extends Model<InferAttributes<JobAttempt>, InferCreationAttributes<JobAttempt>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare jobId: ForeignKey<number>;
  declare attemptNo: number;
  declare agentId: number | null;
  declare triggeredBy: number | null;
  declare operation: CreationOptional<string>;
  declare fromStatus: JobStatus | null;
  declare toStatus: JobStatus | null;
  declare outcome: CreationOptional<'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'AMBIGUOUS' | 'TIMEOUT'>;
  declare errorCode: string | null;
  declare errorMessage: string | null;
  declare startedAt: CreationOptional<Date>;
  declare finishedAt: Date | null;
  declare durationMs: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
JobAttempt.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    jobId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    attemptNo: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    agentId: DataTypes.INTEGER.UNSIGNED,
    triggeredBy: DataTypes.BIGINT.UNSIGNED,
    operation: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'POST_VOUCHER' },
    fromStatus: DataTypes.ENUM(...JOB_STATUSES),
    toStatus: DataTypes.ENUM(...JOB_STATUSES),
    outcome: { type: DataTypes.ENUM('IN_PROGRESS', 'SUCCESS', 'FAILED', 'AMBIGUOUS', 'TIMEOUT'), allowNull: false, defaultValue: 'IN_PROGRESS' },
    errorCode: DataTypes.STRING(64),
    errorMessage: DataTypes.STRING(2000),
    startedAt: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
    finishedAt: DataTypes.DATE(3),
    durationMs: DataTypes.INTEGER.UNSIGNED,
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'job_attempts' },
);

export const TALLY_OPERATIONS = ['HEALTH_CHECK', 'LIST_COMPANIES', 'LIST_LEDGERS', 'CREATE_LEDGER', 'CREATE_VOUCHER', 'READ_VOUCHER', 'READ_LEDGER'] as const;

export class TallyResponse extends Model<InferAttributes<TallyResponse>, InferCreationAttributes<TallyResponse>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare jobId: number | null;
  declare attemptId: number | null;
  declare companyId: number | null;
  declare agentId: number | null;
  declare operation: (typeof TALLY_OPERATIONS)[number];
  declare requestHash: string | null;
  declare requestStorageRef: string | null;
  declare httpStatus: number | null;
  declare createdCount: number | null;
  declare alteredCount: number | null;
  declare errorCount: number | null;
  declare lineError: string | null;
  declare responseBody: string | null;
  declare createdAt: CreationOptional<Date>;
}
TallyResponse.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    jobId: DataTypes.BIGINT.UNSIGNED,
    attemptId: DataTypes.BIGINT.UNSIGNED,
    companyId: DataTypes.INTEGER.UNSIGNED,
    agentId: DataTypes.INTEGER.UNSIGNED,
    operation: { type: DataTypes.ENUM(...TALLY_OPERATIONS), allowNull: false },
    requestHash: DataTypes.CHAR(64),
    requestStorageRef: DataTypes.STRING(500),
    httpStatus: DataTypes.SMALLINT.UNSIGNED,
    createdCount: DataTypes.INTEGER.UNSIGNED,
    alteredCount: DataTypes.INTEGER.UNSIGNED,
    errorCount: DataTypes.INTEGER.UNSIGNED,
    lineError: DataTypes.STRING(2000),
    responseBody: DataTypes.TEXT('medium'),
    createdAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'tally_responses', updatedAt: false },
);

export class MasterCreationRequest extends Model<InferAttributes<MasterCreationRequest>, InferCreationAttributes<MasterCreationRequest>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare companyId: ForeignKey<number>;
  declare jobId: number | null;
  declare masterType: 'LEDGER' | 'GROUP' | 'COST_CENTRE' | 'COST_CATEGORY' | 'STOCK_ITEM' | 'PARTY_LEDGER' | 'BANK_LEDGER';
  declare sourceValue: string | null;
  declare proposedName: string;
  declare proposedParent: string | null;
  declare details: unknown;
  declare status: CreationOptional<'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'CREATING' | 'CREATED' | 'VERIFIED' | 'FAILED'>;
  declare requestedBy: number | null;
  declare reviewedBy: number | null;
  declare reviewedAt: Date | null;
  declare reviewNotes: string | null;
  declare tallyResponseId: number | null;
  declare ledgerMasterId: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
MasterCreationRequest.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    jobId: DataTypes.BIGINT.UNSIGNED,
    masterType: { type: DataTypes.ENUM('LEDGER', 'GROUP', 'COST_CENTRE', 'COST_CATEGORY', 'STOCK_ITEM', 'PARTY_LEDGER', 'BANK_LEDGER'), allowNull: false },
    sourceValue: DataTypes.STRING(255),
    proposedName: { type: DataTypes.STRING(255), allowNull: false },
    proposedParent: DataTypes.STRING(255),
    details: DataTypes.JSON,
    status: {
      type: DataTypes.ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CREATING', 'CREATED', 'VERIFIED', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING_REVIEW',
    },
    requestedBy: DataTypes.BIGINT.UNSIGNED,
    reviewedBy: DataTypes.BIGINT.UNSIGNED,
    reviewedAt: DataTypes.DATE(3),
    reviewNotes: DataTypes.STRING(1000),
    tallyResponseId: DataTypes.BIGINT.UNSIGNED,
    ledgerMasterId: DataTypes.BIGINT.UNSIGNED,
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'master_creation_requests' },
);

export class PostedVoucher extends Model<InferAttributes<PostedVoucher>, InferCreationAttributes<PostedVoucher>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare jobId: ForeignKey<number>;
  declare expenseId: ForeignKey<number>;
  declare companyId: ForeignKey<number>;
  declare voucherKind: VoucherKind;
  declare tallyVoucherTypeName: string;
  declare voucherNumber: string | null;
  declare voucherDate: string;
  declare reference: string;
  declare tallyMasterId: number | null;
  declare tallyAlterId: number | null;
  declare tallyGuid: string | null;
  declare totalAmount: string;
  declare currency: CreationOptional<string>;
  declare verificationStatus: CreationOptional<'PENDING' | 'VERIFIED' | 'MISMATCH'>;
  declare verifiedAt: Date | null;
  declare readback: unknown;
  declare tallyResponseId: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
PostedVoucher.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    jobId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    expenseId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    voucherKind: { type: DataTypes.ENUM(...VOUCHER_KINDS), allowNull: false },
    tallyVoucherTypeName: { type: DataTypes.STRING(150), allowNull: false },
    voucherNumber: DataTypes.STRING(100),
    voucherDate: { type: DataTypes.DATEONLY, allowNull: false },
    reference: { type: DataTypes.STRING(200), allowNull: false },
    tallyMasterId: DataTypes.BIGINT.UNSIGNED,
    tallyAlterId: DataTypes.BIGINT.UNSIGNED,
    tallyGuid: DataTypes.STRING(100),
    totalAmount: money(),
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR' },
    verificationStatus: { type: DataTypes.ENUM('PENDING', 'VERIFIED', 'MISMATCH'), allowNull: false, defaultValue: 'PENDING' },
    verifiedAt: DataTypes.DATE(3),
    readback: DataTypes.JSON,
    tallyResponseId: DataTypes.BIGINT.UNSIGNED,
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'posted_vouchers' },
);
