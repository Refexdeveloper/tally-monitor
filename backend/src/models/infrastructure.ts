import { DataTypes, Model, type CreationOptional, type ForeignKey, type InferAttributes, type InferCreationAttributes, type NonAttribute } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { intId, uuidColumn } from './common';

export class IntegrationAgent extends Model<InferAttributes<IntegrationAgent>, InferCreationAttributes<IntegrationAgent>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare name: string;
  declare agentKey: string;
  declare secretHash: string;
  declare status: CreationOptional<'PENDING' | 'ONLINE' | 'OFFLINE' | 'REVOKED'>;
  declare hostname: string | null;
  declare osInfo: string | null;
  declare agentVersion: string | null;
  declare lastHeartbeatAt: Date | null;
  declare lastIp: string | null;
  declare maxConcurrency: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare revokedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
IntegrationAgent.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    name: { type: DataTypes.STRING(120), allowNull: false },
    agentKey: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    secretHash: { type: DataTypes.CHAR(64), allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'ONLINE', 'OFFLINE', 'REVOKED'), allowNull: false, defaultValue: 'PENDING' },
    hostname: DataTypes.STRING(255),
    osInfo: DataTypes.STRING(255),
    agentVersion: DataTypes.STRING(32),
    lastHeartbeatAt: DataTypes.DATE(3),
    lastIp: DataTypes.STRING(64),
    maxConcurrency: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    revokedAt: DataTypes.DATE(3),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'integration_agents', defaultScope: { attributes: { exclude: ['secretHash'] } } },
);

export class TallyServer extends Model<InferAttributes<TallyServer>, InferCreationAttributes<TallyServer>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare name: string;
  declare host: string;
  declare port: CreationOptional<number>;
  declare protocol: CreationOptional<'HTTP' | 'HTTPS'>;
  declare tallyRelease: string | null;
  declare integrationAgentId: ForeignKey<number | null>;
  declare status: CreationOptional<'UNKNOWN' | 'ONLINE' | 'OFFLINE' | 'ERROR'>;
  declare lastHealthCheckAt: Date | null;
  declare lastSuccessAt: Date | null;
  declare lastError: string | null;
  declare discoveredCompanies: CreationOptional<string[] | null>;
  declare discoveredAt: CreationOptional<Date | null>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare agent?: NonAttribute<IntegrationAgent | null>;
}
TallyServer.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    host: { type: DataTypes.STRING(255), allowNull: false },
    port: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 9000 },
    protocol: { type: DataTypes.ENUM('HTTP', 'HTTPS'), allowNull: false, defaultValue: 'HTTP' },
    tallyRelease: DataTypes.STRING(32),
    integrationAgentId: DataTypes.INTEGER.UNSIGNED,
    status: { type: DataTypes.ENUM('UNKNOWN', 'ONLINE', 'OFFLINE', 'ERROR'), allowNull: false, defaultValue: 'UNKNOWN' },
    lastHealthCheckAt: DataTypes.DATE(3),
    lastSuccessAt: DataTypes.DATE(3),
    lastError: DataTypes.STRING(1000),
    discoveredCompanies: DataTypes.JSON,
    discoveredAt: DataTypes.DATE(3),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'tally_servers' },
);

export class Company extends Model<InferAttributes<Company>, InferCreationAttributes<Company>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare name: string;
  declare code: string;
  declare gstin: string | null;
  declare tallyCompanyName: string;
  declare tallyServerId: ForeignKey<number | null>;
  declare integrationAgentId: ForeignKey<number | null>;
  declare defaultCurrency: CreationOptional<string>;
  declare financialYearStart: string | null;
  declare ledgersSyncedAt: CreationOptional<Date | null>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;
  declare tallyServer?: NonAttribute<TallyServer | null>;
}
Company.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    name: { type: DataTypes.STRING(200), allowNull: false },
    code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    gstin: DataTypes.STRING(15),
    tallyCompanyName: { type: DataTypes.STRING(255), allowNull: false },
    tallyServerId: DataTypes.INTEGER.UNSIGNED,
    integrationAgentId: DataTypes.INTEGER.UNSIGNED,
    defaultCurrency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR' },
    financialYearStart: DataTypes.DATEONLY,
    ledgersSyncedAt: DataTypes.DATE(3),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
    deletedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'companies', paranoid: true },
);
