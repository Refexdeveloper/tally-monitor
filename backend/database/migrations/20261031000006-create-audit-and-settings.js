'use strict';

const { TABLE_OPTIONS, bigId, intId, uuid, ref, timestamps } = require('../lib/schema');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'audit_logs',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        actor_type: { type: Sequelize.ENUM('USER', 'SYSTEM', 'AGENT', 'WEBHOOK'), allowNull: false },
        user_id: ref(Sequelize, 'users', { big: true, nullable: true }),
        agent_id: ref(Sequelize, 'integration_agents', { nullable: true }),
        action: { type: Sequelize.STRING(100), allowNull: false },
        entity_type: { type: Sequelize.STRING(64), allowNull: true },
        entity_uuid: { type: Sequelize.CHAR(36), allowNull: true },
        company_id: ref(Sequelize, 'companies', { nullable: true }),
        application_id: ref(Sequelize, 'applications', { nullable: true }),
        expense_id: ref(Sequelize, 'expense_transactions', { big: true, nullable: true }),
        job_id: ref(Sequelize, 'processing_jobs', { big: true, nullable: true }),
        previous_status: { type: Sequelize.STRING(64), allowNull: true },
        new_status: { type: Sequelize.STRING(64), allowNull: true },
        request_ref: { type: Sequelize.STRING(255), allowNull: true },
        response_ref: { type: Sequelize.STRING(255), allowNull: true },
        ip_address: { type: Sequelize.STRING(64), allowNull: true },
        user_agent: { type: Sequelize.STRING(500), allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize, { updated: false }),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('audit_logs', ['created_at']);
    await queryInterface.addIndex('audit_logs', ['company_id', 'created_at']);
    await queryInterface.addIndex('audit_logs', ['action', 'created_at']);
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_uuid']);

    // Audit trail is append-only. On Cloud SQL with binary logging, enable the
    // log_bin_trust_function_creators flag before running this migration.
    await queryInterface.sequelize.query(
      "CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'",
    );
    await queryInterface.sequelize.query(
      "CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'",
    );

    await queryInterface.createTable(
      'system_settings',
      {
        id: intId(Sequelize),
        setting_key: { type: Sequelize.STRING(120), allowNull: false, unique: true },
        value: { type: Sequelize.JSON, allowNull: false },
        category: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'general' },
        description: { type: Sequelize.STRING(500), allowNull: true },
        updated_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('system_settings');
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_audit_logs_no_delete');
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_audit_logs_no_update');
    await queryInterface.dropTable('audit_logs');
  },
};
