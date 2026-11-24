import { DataTypes, Model, type CreationOptional, type ForeignKey, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { bigId, intId, uuidColumn, VOUCHER_KINDS, type VoucherKind } from './common';

export class LedgerMaster extends Model<InferAttributes<LedgerMaster>, InferCreationAttributes<LedgerMaster>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare companyId: ForeignKey<number>;
  declare name: string;
  declare parentGroup: string | null;
  declare tallyGuid: string | null;
  declare tallyMasterId: number | null;
  declare tallyAlterId: number | null;
  declare source: CreationOptional<'TALLY_SYNC' | 'MANUAL_IMPORT' | 'MASTER_REQUEST'>;
  declare openingBalance: string | null;
  declare isActive: CreationOptional<boolean>;
  declare syncedAt: Date | null;
  declare lastVerifiedAt: Date | null;
  declare createdBy: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
LedgerMaster.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    parentGroup: DataTypes.STRING(255),
    tallyGuid: DataTypes.STRING(100),
    tallyMasterId: DataTypes.BIGINT.UNSIGNED,
    tallyAlterId: DataTypes.BIGINT.UNSIGNED,
    source: { type: DataTypes.ENUM('TALLY_SYNC', 'MANUAL_IMPORT', 'MASTER_REQUEST'), allowNull: false, defaultValue: 'MANUAL_IMPORT' },
    openingBalance: DataTypes.DECIMAL(18, 2),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    syncedAt: DataTypes.DATE(3),
    lastVerifiedAt: DataTypes.DATE(3),
    createdBy: DataTypes.BIGINT.UNSIGNED,
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'ledger_masters' },
);

export class LedgerMapping extends Model<InferAttributes<LedgerMapping>, InferCreationAttributes<LedgerMapping>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare companyId: ForeignKey<number>;
  declare applicationId: ForeignKey<number | null>;
  declare sourceCategory: string;
  declare ledgerMasterId: ForeignKey<number | null>;
  declare tallyLedgerName: string;
  declare costCentre: string | null;
  declare isActive: CreationOptional<boolean>;
  declare createdBy: number | null;
  declare updatedBy: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
LedgerMapping.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    applicationId: DataTypes.INTEGER.UNSIGNED,
    sourceCategory: { type: DataTypes.STRING(150), allowNull: false },
    ledgerMasterId: DataTypes.BIGINT.UNSIGNED,
    tallyLedgerName: { type: DataTypes.STRING(255), allowNull: false },
    costCentre: DataTypes.STRING(255),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: DataTypes.BIGINT.UNSIGNED,
    updatedBy: DataTypes.BIGINT.UNSIGNED,
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'ledger_mappings' },
);

export class VoucherConfiguration extends Model<InferAttributes<VoucherConfiguration>, InferCreationAttributes<VoucherConfiguration>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare companyId: ForeignKey<number>;
  declare voucherKind: VoucherKind;
  declare tallyVoucherTypeName: string;
  declare numberingMode: CreationOptional<'TALLY_AUTO' | 'SOURCE_REFERENCE' | 'TEMPLATE'>;
  declare numberingTemplate: string | null;
  declare debitLedgerRule: unknown;
  declare creditLedgerRule: unknown;
  declare partyLedgerRule: unknown;
  declare taxLedgerRule: unknown;
  declare narrationTemplate: string | null;
  declare referenceTemplate: string | null;
  declare costCentreEnabled: CreationOptional<boolean>;
  declare billAllocationEnabled: CreationOptional<boolean>;
  declare approvalPolicy: CreationOptional<'ALWAYS' | 'ABOVE_THRESHOLD' | 'NEVER'>;
  declare approvalThreshold: string | null;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
VoucherConfiguration.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    voucherKind: { type: DataTypes.ENUM(...VOUCHER_KINDS), allowNull: false },
    tallyVoucherTypeName: { type: DataTypes.STRING(150), allowNull: false },
    numberingMode: { type: DataTypes.ENUM('TALLY_AUTO', 'SOURCE_REFERENCE', 'TEMPLATE'), allowNull: false, defaultValue: 'TALLY_AUTO' },
    numberingTemplate: DataTypes.STRING(150),
    debitLedgerRule: DataTypes.JSON,
    creditLedgerRule: DataTypes.JSON,
    partyLedgerRule: DataTypes.JSON,
    taxLedgerRule: DataTypes.JSON,
    narrationTemplate: DataTypes.STRING(1000),
    referenceTemplate: DataTypes.STRING(255),
    costCentreEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    billAllocationEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approvalPolicy: { type: DataTypes.ENUM('ALWAYS', 'ABOVE_THRESHOLD', 'NEVER'), allowNull: false, defaultValue: 'ALWAYS' },
    approvalThreshold: DataTypes.DECIMAL(18, 2),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'voucher_configurations' },
);

export class VoucherMapping extends Model<InferAttributes<VoucherMapping>, InferCreationAttributes<VoucherMapping>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare companyId: ForeignKey<number>;
  declare applicationId: ForeignKey<number>;
  declare expenseCategory: string | null;
  declare voucherConfigurationId: ForeignKey<number>;
  declare priority: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
VoucherMapping.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    applicationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    expenseCategory: DataTypes.STRING(150),
    voucherConfigurationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    priority: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 100 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'voucher_mappings' },
);
