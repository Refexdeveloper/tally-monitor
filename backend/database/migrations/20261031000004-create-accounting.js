'use strict';

const { TABLE_OPTIONS, VOUCHER_KINDS, bigId, intId, uuid, ref, money, timestamps } = require('../lib/schema');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'ledger_masters',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        company_id: ref(Sequelize, 'companies'),
        name: { type: Sequelize.STRING(255), allowNull: false },
        parent_group: { type: Sequelize.STRING(255), allowNull: true },
        tally_guid: { type: Sequelize.STRING(100), allowNull: true },
        tally_master_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        tally_alter_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        opening_balance: money(Sequelize, { nullable: true }),
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        synced_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('ledger_masters', ['company_id', 'name'], { unique: true });

    await queryInterface.createTable(
      'ledger_mappings',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        company_id: ref(Sequelize, 'companies'),
        // NULL application = company-wide default mapping for the category.
        application_id: ref(Sequelize, 'applications', { nullable: true }),
        source_category: { type: Sequelize.STRING(150), allowNull: false },
        ledger_master_id: ref(Sequelize, 'ledger_masters', { big: true, nullable: true, onDelete: 'SET NULL' }),
        tally_ledger_name: { type: Sequelize.STRING(255), allowNull: false },
        cost_centre: { type: Sequelize.STRING(255), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        updated_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        // Generated key makes "company-wide default" (NULL application) unique as well.
        scope_key: {
          type: 'VARCHAR(200) GENERATED ALWAYS AS (CONCAT(company_id, \':\', IFNULL(application_id, 0), \':\', source_category)) STORED',
        },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('ledger_mappings', ['scope_key'], { unique: true, name: 'uq_ledger_mappings_scope' });
    await queryInterface.addIndex('ledger_mappings', ['company_id', 'is_active']);

    await queryInterface.createTable(
      'voucher_configurations',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        company_id: ref(Sequelize, 'companies'),
        voucher_kind: { type: Sequelize.ENUM(...VOUCHER_KINDS), allowNull: false },
        tally_voucher_type_name: { type: Sequelize.STRING(150), allowNull: false },
        numbering_mode: { type: Sequelize.ENUM('TALLY_AUTO', 'SOURCE_REFERENCE', 'TEMPLATE'), allowNull: false, defaultValue: 'TALLY_AUTO' },
        numbering_template: { type: Sequelize.STRING(150), allowNull: true },
        debit_ledger_rule: { type: Sequelize.JSON, allowNull: true },
        credit_ledger_rule: { type: Sequelize.JSON, allowNull: true },
        party_ledger_rule: { type: Sequelize.JSON, allowNull: true },
        tax_ledger_rule: { type: Sequelize.JSON, allowNull: true },
        narration_template: { type: Sequelize.STRING(1000), allowNull: true },
        reference_template: { type: Sequelize.STRING(255), allowNull: true },
        cost_centre_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        bill_allocation_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        approval_policy: { type: Sequelize.ENUM('ALWAYS', 'ABOVE_THRESHOLD', 'NEVER'), allowNull: false, defaultValue: 'ALWAYS' },
        approval_threshold: money(Sequelize, { nullable: true }),
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('voucher_configurations', ['company_id', 'voucher_kind', 'tally_voucher_type_name'], { unique: true, name: 'uq_voucher_cfg_company_kind_type' });

    await queryInterface.createTable(
      'voucher_mappings',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        company_id: ref(Sequelize, 'companies'),
        application_id: ref(Sequelize, 'applications'),
        expense_category: { type: Sequelize.STRING(150), allowNull: true },
        voucher_configuration_id: ref(Sequelize, 'voucher_configurations'),
        priority: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 100 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        scope_key: {
          type: 'VARCHAR(220) GENERATED ALWAYS AS (CONCAT(company_id, \':\', application_id, \':\', IFNULL(expense_category, \'*\'))) STORED',
        },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('voucher_mappings', ['scope_key'], { unique: true, name: 'uq_voucher_mappings_scope' });
  },

  async down(queryInterface) {
    for (const table of ['voucher_mappings', 'voucher_configurations', 'ledger_mappings', 'ledger_masters']) {
      await queryInterface.dropTable(table);
    }
  },
};
