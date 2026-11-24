import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { bigId, intId, uuidColumn } from './common';

export type ActorType = 'USER' | 'SYSTEM' | 'AGENT' | 'WEBHOOK';

export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare actorType: ActorType;
  declare userId: number | null;
  declare agentId: number | null;
  declare action: string;
  declare entityType: string | null;
  declare entityUuid: string | null;
  declare companyId: number | null;
  declare applicationId: number | null;
  declare expenseId: number | null;
  declare jobId: number | null;
  declare previousStatus: string | null;
  declare newStatus: string | null;
  declare requestRef: string | null;
  declare responseRef: string | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare metadata: unknown;
  declare createdAt: CreationOptional<Date>;
}
AuditLog.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    actorType: { type: DataTypes.ENUM('USER', 'SYSTEM', 'AGENT', 'WEBHOOK'), allowNull: false },
    userId: DataTypes.BIGINT.UNSIGNED,
    agentId: DataTypes.INTEGER.UNSIGNED,
    action: { type: DataTypes.STRING(100), allowNull: false },
    entityType: DataTypes.STRING(64),
    entityUuid: DataTypes.CHAR(36),
    companyId: DataTypes.INTEGER.UNSIGNED,
    applicationId: DataTypes.INTEGER.UNSIGNED,
    expenseId: DataTypes.BIGINT.UNSIGNED,
    jobId: DataTypes.BIGINT.UNSIGNED,
    previousStatus: DataTypes.STRING(64),
    newStatus: DataTypes.STRING(64),
    requestRef: DataTypes.STRING(255),
    responseRef: DataTypes.STRING(255),
    ipAddress: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(500),
    metadata: DataTypes.JSON,
    createdAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'audit_logs', updatedAt: false },
);

export class WebhookReceipt extends Model<InferAttributes<WebhookReceipt>, InferCreationAttributes<WebhookReceipt>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare applicationId: number;
  declare source: 'WEBHOOK' | 'API' | 'MANUAL';
  declare status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';
  declare httpStatus: number;
  declare authResult: 'VALID' | 'INVALID' | 'MISSING' | 'NOT_REQUIRED' | 'USER';
  declare errorCode: string | null;
  declare errorMessage: string | null;
  declare errorDetails: unknown;
  declare sourceTransactionId: string | null;
  declare idempotencyKey: string | null;
  declare payloadHash: string | null;
  declare payloadSize: number | null;
  declare payload: string | null;
  declare normalized: unknown;
  declare requestHeaders: unknown;
  declare ipAddress: string | null;
  declare expenseId: number | null;
  declare triggeredBy: number | null;
  declare durationMs: number | null;
  declare createdAt: CreationOptional<Date>;
}
WebhookReceipt.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    applicationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    source: { type: DataTypes.ENUM('WEBHOOK', 'API', 'MANUAL'), allowNull: false },
    status: { type: DataTypes.ENUM('ACCEPTED', 'DUPLICATE', 'REJECTED', 'FAILED'), allowNull: false },
    httpStatus: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    authResult: { type: DataTypes.ENUM('VALID', 'INVALID', 'MISSING', 'NOT_REQUIRED', 'USER'), allowNull: false },
    errorCode: DataTypes.STRING(64),
    errorMessage: DataTypes.STRING(2000),
    errorDetails: DataTypes.JSON,
    sourceTransactionId: DataTypes.STRING(150),
    idempotencyKey: DataTypes.STRING(200),
    payloadHash: DataTypes.CHAR(64),
    payloadSize: DataTypes.INTEGER.UNSIGNED,
    payload: DataTypes.TEXT('medium'),
    normalized: DataTypes.JSON,
    requestHeaders: DataTypes.JSON,
    ipAddress: DataTypes.STRING(64),
    expenseId: DataTypes.BIGINT.UNSIGNED,
    triggeredBy: DataTypes.BIGINT.UNSIGNED,
    durationMs: DataTypes.INTEGER.UNSIGNED,
    createdAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'webhook_receipts', updatedAt: false },
);

export class SystemSetting extends Model<InferAttributes<SystemSetting>, InferCreationAttributes<SystemSetting>> {
  declare id: CreationOptional<number>;
  declare settingKey: string;
  declare value: unknown;
  declare category: CreationOptional<string>;
  declare description: string | null;
  declare updatedBy: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
SystemSetting.init(
  {
    id: intId(),
    settingKey: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    value: { type: DataTypes.JSON, allowNull: false },
    category: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'general' },
    description: DataTypes.STRING(500),
    updatedBy: DataTypes.BIGINT.UNSIGNED,
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'system_settings' },
);
