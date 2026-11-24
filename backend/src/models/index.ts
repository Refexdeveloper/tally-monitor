import { sequelize } from '../db/sequelize';
import { Application, ApplicationCompany, ApplicationCredential, SourceFieldMapping } from './applications';
import { LedgerMapping, LedgerMaster, VoucherConfiguration, VoucherMapping } from './accounting';
import { PasswordResetToken, Permission, Role, RolePermission, User, UserCompany, UserRole, UserSession } from './auth';
import { Company, IntegrationAgent, TallyServer } from './infrastructure';
import { AuditLog, SystemSetting, WebhookReceipt } from './system';
import { ExpenseItem, ExpenseTransaction, JobAttempt, MasterCreationRequest, PostedVoucher, ProcessingJob, TallyResponse } from './transactions';

// --- Identity & access ---------------------------------------------------
Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'roleId', otherKey: 'permissionId', as: 'permissions' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permissionId', otherKey: 'roleId', as: 'roles' });
User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', otherKey: 'roleId', as: 'roles' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', otherKey: 'userId', as: 'users' });
User.belongsToMany(Company, { through: UserCompany, foreignKey: 'userId', otherKey: 'companyId', as: 'companies' });
Company.belongsToMany(User, { through: UserCompany, foreignKey: 'companyId', otherKey: 'userId', as: 'users' });
User.hasMany(UserSession, { foreignKey: 'userId', as: 'sessions' });
UserSession.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'resetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// --- Infrastructure --------------------------------------------------------
IntegrationAgent.hasMany(TallyServer, { foreignKey: 'integrationAgentId', as: 'tallyServers' });
TallyServer.belongsTo(IntegrationAgent, { foreignKey: 'integrationAgentId', as: 'agent' });
TallyServer.hasMany(Company, { foreignKey: 'tallyServerId', as: 'companies' });
Company.belongsTo(TallyServer, { foreignKey: 'tallyServerId', as: 'tallyServer' });
Company.belongsTo(IntegrationAgent, { foreignKey: 'integrationAgentId', as: 'agent' });

// --- Applications (many-to-many with companies) ----------------------------
Application.belongsToMany(Company, { through: ApplicationCompany, foreignKey: 'applicationId', otherKey: 'companyId', as: 'companies' });
Company.belongsToMany(Application, { through: ApplicationCompany, foreignKey: 'companyId', otherKey: 'applicationId', as: 'applications' });
Application.hasMany(ApplicationCompany, { foreignKey: 'applicationId', as: 'companyLinks' });
ApplicationCompany.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });
ApplicationCompany.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Application.hasMany(ApplicationCredential, { foreignKey: 'applicationId', as: 'credentials' });
Application.hasMany(SourceFieldMapping, { foreignKey: 'applicationId', as: 'fieldMappings' });

// --- Accounting ------------------------------------------------------------
Company.hasMany(LedgerMaster, { foreignKey: 'companyId', as: 'ledgers' });
LedgerMaster.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Company.hasMany(LedgerMapping, { foreignKey: 'companyId', as: 'ledgerMappings' });
LedgerMapping.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
LedgerMapping.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });
LedgerMapping.belongsTo(LedgerMaster, { foreignKey: 'ledgerMasterId', as: 'ledger' });
Company.hasMany(VoucherConfiguration, { foreignKey: 'companyId', as: 'voucherConfigurations' });
VoucherConfiguration.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
VoucherMapping.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
VoucherMapping.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });
VoucherMapping.belongsTo(VoucherConfiguration, { foreignKey: 'voucherConfigurationId', as: 'configuration' });

// --- Transactions & queue --------------------------------------------------
ExpenseTransaction.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });
ExpenseTransaction.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
ExpenseTransaction.hasMany(ExpenseItem, { foreignKey: 'expenseId', as: 'items' });
ExpenseItem.belongsTo(ExpenseTransaction, { foreignKey: 'expenseId', as: 'expense' });
ExpenseTransaction.hasMany(ProcessingJob, { foreignKey: 'expenseId', as: 'jobs' });
ProcessingJob.belongsTo(ExpenseTransaction, { foreignKey: 'expenseId', as: 'expense' });
ProcessingJob.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
ProcessingJob.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });
ProcessingJob.belongsTo(VoucherConfiguration, { foreignKey: 'voucherConfigurationId', as: 'voucherConfiguration' });
ProcessingJob.hasMany(JobAttempt, { foreignKey: 'jobId', as: 'attemptHistory' });
JobAttempt.belongsTo(ProcessingJob, { foreignKey: 'jobId', as: 'job' });
ProcessingJob.hasOne(PostedVoucher, { foreignKey: 'jobId', as: 'postedVoucher' });
PostedVoucher.belongsTo(ProcessingJob, { foreignKey: 'jobId', as: 'job' });
PostedVoucher.belongsTo(ExpenseTransaction, { foreignKey: 'expenseId', as: 'expense' });
PostedVoucher.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
MasterCreationRequest.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
MasterCreationRequest.belongsTo(ProcessingJob, { foreignKey: 'jobId', as: 'job' });
TallyResponse.belongsTo(ProcessingJob, { foreignKey: 'jobId', as: 'job' });

// --- Audit -----------------------------------------------------------------
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
AuditLog.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
SystemSetting.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater' });
WebhookReceipt.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });
WebhookReceipt.belongsTo(ExpenseTransaction, { foreignKey: 'expenseId', as: 'expense' });

export {
  sequelize,
  Application,
  ApplicationCompany,
  ApplicationCredential,
  AuditLog,
  Company,
  ExpenseItem,
  ExpenseTransaction,
  IntegrationAgent,
  JobAttempt,
  LedgerMapping,
  LedgerMaster,
  MasterCreationRequest,
  PasswordResetToken,
  Permission,
  PostedVoucher,
  ProcessingJob,
  Role,
  RolePermission,
  SourceFieldMapping,
  SystemSetting,
  TallyResponse,
  TallyServer,
  User,
  UserCompany,
  UserRole,
  UserSession,
  VoucherConfiguration,
  VoucherMapping,
  WebhookReceipt,
};
