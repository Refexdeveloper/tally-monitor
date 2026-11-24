import { DataTypes, Model, type CreationOptional, type ForeignKey, type InferAttributes, type InferCreationAttributes, type NonAttribute } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { bigId, intId, uuidColumn } from './common';

export class Permission extends Model<InferAttributes<Permission>, InferCreationAttributes<Permission>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare module: string;
  declare description: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
Permission.init(
  {
    id: intId(),
    code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    module: { type: DataTypes.STRING(64), allowNull: false },
    description: DataTypes.STRING(255),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'permissions' },
);

export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare code: string;
  declare name: string;
  declare description: string | null;
  declare isSystem: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare permissions?: NonAttribute<Permission[]>;
}
Role.init(
  {
    id: intId(),
    uuid: uuidColumn(),
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: DataTypes.STRING(500),
    isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'roles' },
);

export class RolePermission extends Model<InferAttributes<RolePermission>, InferCreationAttributes<RolePermission>> {
  declare roleId: ForeignKey<number>;
  declare permissionId: ForeignKey<number>;
  declare createdAt: CreationOptional<Date>;
}
RolePermission.init(
  {
    roleId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    permissionId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    createdAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'role_permissions', updatedAt: false },
);

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare email: string;
  declare passwordHash: string;
  declare fullName: string;
  declare avatarUrl: string | null;
  declare isActive: CreationOptional<boolean>;
  declare companyScope: CreationOptional<'ALL' | 'ASSIGNED'>;
  declare failedLoginAttempts: CreationOptional<number>;
  declare lockedUntil: Date | null;
  declare lastLoginAt: Date | null;
  declare lastLoginIp: string | null;
  declare passwordChangedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;
  declare roles?: NonAttribute<Role[]>;
}
User.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    fullName: { type: DataTypes.STRING(150), allowNull: false },
    avatarUrl: DataTypes.STRING(500),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    companyScope: { type: DataTypes.ENUM('ALL', 'ASSIGNED'), allowNull: false, defaultValue: 'ASSIGNED' },
    failedLoginAttempts: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    lockedUntil: DataTypes.DATE(3),
    lastLoginAt: DataTypes.DATE(3),
    lastLoginIp: DataTypes.STRING(64),
    passwordChangedAt: DataTypes.DATE(3),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
    deletedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'users', paranoid: true, defaultScope: { attributes: { exclude: ['passwordHash'] } }, scopes: { withPassword: {} } },
);

export class UserRole extends Model<InferAttributes<UserRole>, InferCreationAttributes<UserRole>> {
  declare userId: ForeignKey<number>;
  declare roleId: ForeignKey<number>;
  declare createdAt: CreationOptional<Date>;
}
UserRole.init(
  {
    userId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    roleId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    createdAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'user_roles', updatedAt: false },
);

export class UserCompany extends Model<InferAttributes<UserCompany>, InferCreationAttributes<UserCompany>> {
  declare userId: ForeignKey<number>;
  declare companyId: ForeignKey<number>;
  declare createdAt: CreationOptional<Date>;
}
UserCompany.init(
  {
    userId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    createdAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'user_companies', updatedAt: false },
);

export class UserSession extends Model<InferAttributes<UserSession>, InferCreationAttributes<UserSession>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare userId: ForeignKey<number>;
  declare familyId: string;
  declare tokenHash: string;
  declare rememberMe: boolean;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare revokedReason: string | null;
  declare replacedById: number | null;
  declare lastUsedAt: Date | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
UserSession.init(
  {
    id: bigId(),
    uuid: uuidColumn(),
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    familyId: { type: DataTypes.CHAR(36), allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    rememberMe: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    expiresAt: { type: DataTypes.DATE(3), allowNull: false },
    revokedAt: DataTypes.DATE(3),
    revokedReason: DataTypes.STRING(64),
    replacedById: DataTypes.BIGINT.UNSIGNED,
    lastUsedAt: DataTypes.DATE(3),
    ipAddress: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(500),
    createdAt: DataTypes.DATE(3),
    updatedAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'user_sessions' },
);

export class PasswordResetToken extends Model<InferAttributes<PasswordResetToken>, InferCreationAttributes<PasswordResetToken>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<number>;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare requestedIp: string | null;
  declare createdAt: CreationOptional<Date>;
}
PasswordResetToken.init(
  {
    id: bigId(),
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE(3), allowNull: false },
    usedAt: DataTypes.DATE(3),
    requestedIp: DataTypes.STRING(64),
    createdAt: DataTypes.DATE(3),
  },
  { sequelize, tableName: 'password_reset_tokens', updatedAt: false },
);
