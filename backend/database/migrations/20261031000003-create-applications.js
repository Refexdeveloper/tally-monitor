'use strict';

const { TABLE_OPTIONS, VOUCHER_KINDS, intId, uuid, ref, timestamps } = require('../lib/schema');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'applications',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        name: { type: Sequelize.STRING(150), allowNull: false },
        code: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        description: { type: Sequelize.STRING(1000), allowNull: true },
        application_type: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'EXPENSE_CLAIM' },
        icon: { type: Sequelize.STRING(64), allowNull: true },
        color: { type: Sequelize.STRING(16), allowNull: true },
        kissflow_account: { type: Sequelize.STRING(150), allowNull: true },
        kissflow_app_id: { type: Sequelize.STRING(150), allowNull: true },
        kissflow_process_id: { type: Sequelize.STRING(150), allowNull: true },
        integration_mode: { type: Sequelize.ENUM('WEBHOOK', 'API', 'MANUAL'), allowNull: false, defaultValue: 'WEBHOOK' },
        api_endpoint: { type: Sequelize.STRING(500), allowNull: true },
        auth_method: { type: Sequelize.ENUM('HMAC_SHA256', 'BEARER_TOKEN', 'API_KEY', 'NONE'), allowNull: false, defaultValue: 'HMAC_SHA256' },
        default_voucher_kind: { type: Sequelize.ENUM(...VOUCHER_KINDS), allowNull: true },
        status: { type: Sequelize.ENUM('DRAFT', 'ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'DRAFT' },
        last_request_at: { type: Sequelize.DATE(3), allowNull: true },
        last_success_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize, { paranoid: true }),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'application_companies',
      {
        id: intId(Sequelize),
        application_id: ref(Sequelize, 'applications', { onDelete: 'CASCADE' }),
        company_id: ref(Sequelize, 'companies', { onDelete: 'CASCADE' }),
        // Value in the source payload (e.g. Kissflow "Req_Entity") identifying this company.
        source_company_key: { type: Sequelize.STRING(150), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('application_companies', ['application_id', 'company_id'], { unique: true });
    await queryInterface.addIndex('application_companies', ['application_id', 'source_company_key'], { unique: true });

    await queryInterface.createTable(
      'application_credentials',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        application_id: ref(Sequelize, 'applications', { onDelete: 'CASCADE' }),
        credential_type: { type: Sequelize.ENUM('WEBHOOK_SECRET', 'API_KEY', 'BEARER_TOKEN', 'OAUTH_CLIENT'), allowNull: false },
        label: { type: Sequelize.STRING(120), allowNull: true },
        // AES-256-GCM ciphertext: base64(iv).base64(tag).base64(ciphertext)
        encrypted_value: { type: Sequelize.TEXT, allowNull: false },
        key_version: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
        hint: { type: Sequelize.STRING(16), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        expires_at: { type: Sequelize.DATE(3), allowNull: true },
        rotated_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('application_credentials', ['application_id', 'credential_type', 'is_active']);

    await queryInterface.createTable(
      'source_field_mappings',
      {
        id: intId(Sequelize),
        application_id: ref(Sequelize, 'applications', { onDelete: 'CASCADE' }),
        target_field: { type: Sequelize.STRING(64), allowNull: false },
        source_path: { type: Sequelize.STRING(255), allowNull: false },
        transform: { type: Sequelize.STRING(64), allowNull: true },
        default_value: { type: Sequelize.STRING(255), allowNull: true },
        is_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        sort_order: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('source_field_mappings', ['application_id', 'target_field'], { unique: true });
  },

  async down(queryInterface) {
    for (const table of ['source_field_mappings', 'application_credentials', 'application_companies', 'applications']) {
      await queryInterface.dropTable(table);
    }
  },
};
