'use strict';

/** Records where each ledger master came from and when Tally last confirmed it. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ledger_masters', 'source', {
      type: Sequelize.ENUM('TALLY_SYNC', 'MANUAL_IMPORT', 'MASTER_REQUEST'),
      allowNull: false,
      defaultValue: 'MANUAL_IMPORT',
      after: 'tally_alter_id',
    });
    await queryInterface.addColumn('ledger_masters', 'last_verified_at', { type: Sequelize.DATE(3), allowNull: true, after: 'synced_at' });
    await queryInterface.addColumn('ledger_masters', 'created_by', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'RESTRICT',
      onDelete: 'SET NULL',
      after: 'last_verified_at',
    });
    await queryInterface.addColumn('master_creation_requests', 'ledger_master_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'ledger_masters', key: 'id' },
      onUpdate: 'RESTRICT',
      onDelete: 'SET NULL',
      after: 'tally_response_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('master_creation_requests', 'ledger_master_id');
    await queryInterface.removeColumn('ledger_masters', 'created_by');
    await queryInterface.removeColumn('ledger_masters', 'last_verified_at');
    await queryInterface.removeColumn('ledger_masters', 'source');
  },
};
