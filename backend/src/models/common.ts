import { DataTypes } from 'sequelize';

export const uuidColumn = () => ({
  type: DataTypes.CHAR(36),
  allowNull: false,
  unique: true,
  defaultValue: DataTypes.UUIDV4,
});

export const bigId = () => ({ type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true });
export const intId = () => ({ type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true });
export const money = () => ({ type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: '0.00' });

export const VOUCHER_KINDS = ['PAYMENT', 'JOURNAL', 'RECEIPT', 'CONTRA', 'PURCHASE', 'SALES', 'CREDIT_NOTE', 'DEBIT_NOTE'] as const;
export type VoucherKind = (typeof VOUCHER_KINDS)[number];
