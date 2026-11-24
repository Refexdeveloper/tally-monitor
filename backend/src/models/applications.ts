import { DataTypes, Model, type CreationOptional, type ForeignKey, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { intId, uuidColumn, VOUCHER_KINDS, type VoucherKind } from './common';

export class Application extends Model<InferAttributes<Application>, InferCreationAttributes<Application>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare name: string;
  declare code: string;
  declare description: string | null;
  declare applicationType: CreationOptional<string>;
  declare icon: string | null;
  declare color: string | null;
  declare kissflowAccount: string | null;
  declare kissflowAppId: string | null;
  declare kissflowProcessId: string | null;
  declare integrationMode: CreationOptional<'WEBHOOK' | 'API' | 'MANUAL'>;
  declare apiEndpoint: string | null;
  declare authMethod: CreationOptional<'HMAC_SHA256' | 'BEARER_TOKEN' | 'API_KEY' | 'NONE'>;
  declare defaultVoucherKind: VoucherKind | null;
  declare status: CreationOptional<'DRAFT' | 'ACTIVE' | 'INACTIVE'>;
  declare lastRequestAt: Date | null;
  declare lastSuccessAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;
}
Application.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    name: { type: DataTypes.STRING(150), allowNull: false },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    description: DataTypes.STRING(1000),
    applicationType: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'EXPENSE_CLAIM' },
    icon: DataTypes.STRING(64),
    color: DataTypes.STRING(16),
    kissflowAccount: DataTypes.STRING(150),
    kissflowAppId: DataTypes.STRING(150),
    kissflowProcessId: DataTypes.STRING(150),
    integrationMode: { type: DataTypes.ENUM('WEBHOOK', 'API', 'MANUAL'), allowNull: false, defaultValue: 'WEBHOOK' },
    apiEndpoint: DataTypes.STRING(500),
    authMethod: { type: DataTypes.ENUM('HMAC_SHA256', 'BEARER_TOKEN', 'API_KEY', 'NONE'), allowNull: false, defaultValue: 'HMAC_SHA256' },
    defaultVoucherKind: DataTypes.ENUM(...VOUCHER_KINDS),
    status: { type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'DRAFT' },
    lastRequestAt: DataTypes.DATE(3),
    lastSuccessAt: DataTypes.DATE(3),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
    deletedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'applications', paranoid: true },
);

export class ApplicationCompany extends Model<InferAttributes<ApplicationCompany>, InferCreationAttributes<ApplicationCompany>> {
  declare id: CreationOptional<number>;
  declare applicationId: ForeignKey<number>;
  declare companyId: ForeignKey<number>;
  declare sourceCompanyKey: string;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ApplicationCompany.init(
  {
    id: intId(),
    applicationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sourceCompanyKey: { type: DataTypes.STRING(150), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'application_companies' },
);

export class ApplicationCredential extends Model<InferAttributes<ApplicationCredential>, InferCreationAttributes<ApplicationCredential>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare applicationId: ForeignKey<number>;
  declare credentialType: 'WEBHOOK_SECRET' | 'API_KEY' | 'BEARER_TOKEN' | 'OAUTH_CLIENT';
  declare label: string | null;
  declare encryptedValue: string;
  declare keyVersion: CreationOptional<number>;
  declare hint: string | null;
  declare isActive: CreationOptional<boolean>;
  declare expiresAt: Date | null;
  declare rotatedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ApplicationCredential.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    applicationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    credentialType: { type: DataTypes.ENUM('WEBHOOK_SECRET', 'API_KEY', 'BEARER_TOKEN', 'OAUTH_CLIENT'), allowNull: false },
    label: DataTypes.STRING(120),
    encryptedValue: { type: DataTypes.TEXT, allowNull: false },
    keyVersion: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
    hint: DataTypes.STRING(16),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    expiresAt: DataTypes.DATE(3),
    rotatedAt: DataTypes.DATE(3),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'application_credentials', defaultScope: { attributes: { exclude: ['encryptedValue'] } } },
);

export class SourceFieldMapping extends Model<InferAttributes<SourceFieldMapping>, InferCreationAttributes<SourceFieldMapping>> {
  declare id: CreationOptional<number>;
  declare applicationId: ForeignKey<number>;
  declare targetField: string;
  declare sourcePath: string;
  declare transform: string | null;
  declare defaultValue: string | null;
  declare isRequired: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
SourceFieldMapping.init(
  {
    id: intId(),
    applicationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    targetField: { type: DataTypes.STRING(64), allowNull: false },
    sourcePath: { type: DataTypes.STRING(255), allowNull: false },
    transform: DataTypes.STRING(64),
    defaultValue: DataTypes.STRING(255),
    isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sortOrder: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'source_field_mappings' },
);
