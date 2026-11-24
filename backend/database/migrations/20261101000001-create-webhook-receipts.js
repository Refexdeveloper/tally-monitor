'use strict';

const { TABLE_OPTIONS, bigId, uuid, ref, timestamps } = require('../lib/schema');

/** Every intake request (webhook, API sync, manual import) and its outcome. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'webhook_receipts',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        application_id: ref(Sequelize, 'applications'),
        source: { type: Sequelize.ENUM('WEBHOOK', 'API', 'MANUAL'), allowNull: false },
        status: { type: Sequelize.ENUM('ACCEPTED', 'DUPLICATE', 'REJECTED', 'FAILED'), allowNull: false },
        http_status: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false },
        auth_result: { type: Sequelize.ENUM('VALID', 'INVALID', 'MISSING', 'NOT_REQUIRED', 'USER'), allowNull: false },
        error_code: { type: Sequelize.STRING(64), allowNull: true },
        error_message: { type: Sequelize.STRING(2000), allowNull: true },
        error_details: { type: Sequelize.JSON, allowNull: true },
        source_transaction_id: { type: Sequelize.STRING(150), allowNull: true },
        idempotency_key: { type: Sequelize.STRING(200), allowNull: true },
        payload_hash: { type: Sequelize.CHAR(64), allowNull: true },
        payload_size: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        // Stored only after authentication succeeds; banking/contact fields are masked.
        payload: { type: Sequelize.TEXT('medium'), allowNull: true },
        normalized: { type: Sequelize.JSON, allowNull: true },
        request_headers: { type: Sequelize.JSON, allowNull: true },
        ip_address: { type: Sequelize.STRING(64), allowNull: true },
        expense_id: ref(Sequelize, 'expense_transactions', { big: true, nullable: true }),
        triggered_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        duration_ms: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        ...timestamps(Sequelize, { updated: false }),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('webhook_receipts', ['application_id', 'created_at']);
    await queryInterface.addIndex('webhook_receipts', ['status', 'created_at']);
    await queryInterface.addIndex('webhook_receipts', ['idempotency_key']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('webhook_receipts');
  },
};
