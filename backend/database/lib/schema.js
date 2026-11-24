'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

const JOB_STATUSES = [
  'RECEIVED',
  'VALIDATING',
  'VALIDATION_FAILED',
  'MAPPING_REQUIRED',
  'MASTER_CREATION_REQUIRED',
  'AWAITING_APPROVAL',
  'READY_TO_POST',
  'PROCESSING',
  'POSTED',
  'FAILED',
  'RETRY_PENDING',
  'RECONCILIATION_REQUIRED',
  'CANCELLED',
];

const VOUCHER_KINDS = ['PAYMENT', 'JOURNAL', 'RECEIPT', 'CONTRA', 'PURCHASE', 'SALES', 'CREDIT_NOTE', 'DEBIT_NOTE'];

function bigId(Sequelize) {
  return { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false };
}

function intId(Sequelize) {
  return { type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false };
}

function uuid(Sequelize) {
  return { type: Sequelize.CHAR(36), allowNull: false, unique: true };
}

function ref(Sequelize, table, { big = false, nullable = false, onDelete = 'RESTRICT' } = {}) {
  return {
    type: big ? Sequelize.BIGINT.UNSIGNED : Sequelize.INTEGER.UNSIGNED,
    allowNull: nullable,
    references: { model: table, key: 'id' },
    // Surrogate keys never change; RESTRICT also keeps FKs valid on generated-column base columns.
    onUpdate: 'RESTRICT',
    onDelete,
  };
}

function money(Sequelize, { nullable = false } = {}) {
  return { type: Sequelize.DECIMAL(18, 2), allowNull: nullable, defaultValue: nullable ? null : '0.00' };
}

function timestamps(Sequelize, { paranoid = false, updated = true } = {}) {
  const cols = {
    created_at: { type: Sequelize.DATE(3), allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)') },
  };
  if (updated) {
    cols.updated_at = {
      type: Sequelize.DATE(3),
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'),
    };
  }
  if (paranoid) cols.deleted_at = { type: Sequelize.DATE(3), allowNull: true };
  return cols;
}

module.exports = { TABLE_OPTIONS, JOB_STATUSES, VOUCHER_KINDS, bigId, intId, uuid, ref, money, timestamps };
