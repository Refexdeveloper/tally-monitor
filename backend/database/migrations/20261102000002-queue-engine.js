'use strict';

const { TABLE_OPTIONS, ref } = require('../lib/schema');

/** Queue engine: approval binding, cancellation/pause metadata and worker leases. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // SHA-256 of the exact voucher draft Finance approved; posting is refused if the draft changes.
    await queryInterface.addColumn('processing_jobs', 'approved_voucher_hash', { type: Sequelize.CHAR(64), allowNull: true, after: 'approved_at' });
    await queryInterface.addColumn('processing_jobs', 'approval_notes', { type: Sequelize.STRING(1000), allowNull: true, after: 'approved_voucher_hash' });
    await queryInterface.addColumn('processing_jobs', 'cancelled_by', { ...ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }), after: 'rejection_reason' });
    await queryInterface.addColumn('processing_jobs', 'cancelled_at', { type: Sequelize.DATE(3), allowNull: true, after: 'cancelled_by' });
    await queryInterface.addColumn('processing_jobs', 'cancellation_reason', { type: Sequelize.STRING(1000), allowNull: true, after: 'cancelled_at' });
    await queryInterface.addColumn('processing_jobs', 'paused_by', { ...ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }), after: 'is_paused' });
    await queryInterface.addColumn('processing_jobs', 'paused_at', { type: Sequelize.DATE(3), allowNull: true, after: 'paused_by' });
    await queryInterface.addIndex('processing_jobs', ['locked_by_agent_id', 'status'], { name: 'ix_jobs_agent_status' });
    await queryInterface.addIndex('processing_jobs', ['status', 'lock_expires_at'], { name: 'ix_jobs_lock_expiry' });

    await queryInterface.createTable(
      'queue_worker_leases',
      {
        name: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
        owner: { type: Sequelize.STRING(128), allowNull: true },
        expires_at: { type: Sequelize.DATE(3), allowNull: true },
        heartbeat_at: { type: Sequelize.DATE(3), allowNull: true },
        stats: { type: Sequelize.JSON, allowNull: true },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.bulkInsert('queue_worker_leases', [{ name: 'maintenance', owner: null, expires_at: null, heartbeat_at: null, stats: null }]);

    const now = new Date();
    await queryInterface.sequelize.query(
      `INSERT IGNORE INTO system_settings (setting_key, value, category, description, created_at, updated_at) VALUES
       ('queue.auto_validate', CAST('true' AS JSON), 'queue', 'Automatically run accounting validation for newly received jobs', ?, ?)`,
      { replacements: [now, now] },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM system_settings WHERE setting_key = 'queue.auto_validate'");
    await queryInterface.dropTable('queue_worker_leases');
    await queryInterface.removeIndex('processing_jobs', 'ix_jobs_lock_expiry');
    await queryInterface.removeIndex('processing_jobs', 'ix_jobs_agent_status');
    for (const col of ['paused_at', 'paused_by', 'cancellation_reason', 'cancelled_at', 'cancelled_by', 'approval_notes', 'approved_voucher_hash']) {
      await queryInterface.removeColumn('processing_jobs', col);
    }
  },
};
