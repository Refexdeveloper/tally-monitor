'use strict';

/** Bridge Agent discovery: companies loaded on each Tally server and per-company ledger sync time. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tally_servers', 'discovered_companies', { type: Sequelize.JSON, allowNull: true, after: 'last_error' });
    await queryInterface.addColumn('tally_servers', 'discovered_at', { type: Sequelize.DATE(3), allowNull: true, after: 'discovered_companies' });
    await queryInterface.addColumn('companies', 'ledgers_synced_at', { type: Sequelize.DATE(3), allowNull: true, after: 'financial_year_start' });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('companies', 'ledgers_synced_at');
    await queryInterface.removeColumn('tally_servers', 'discovered_at');
    await queryInterface.removeColumn('tally_servers', 'discovered_companies');
  },
};
