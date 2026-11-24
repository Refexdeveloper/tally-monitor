'use strict';

const { TABLE_OPTIONS, intId, uuid, ref, timestamps } = require('../lib/schema');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'integration_agents',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        name: { type: Sequelize.STRING(120), allowNull: false },
        agent_key: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        secret_hash: { type: Sequelize.CHAR(64), allowNull: false },
        status: { type: Sequelize.ENUM('PENDING', 'ONLINE', 'OFFLINE', 'REVOKED'), allowNull: false, defaultValue: 'PENDING' },
        hostname: { type: Sequelize.STRING(255), allowNull: true },
        os_info: { type: Sequelize.STRING(255), allowNull: true },
        agent_version: { type: Sequelize.STRING(32), allowNull: true },
        last_heartbeat_at: { type: Sequelize.DATE(3), allowNull: true },
        last_ip: { type: Sequelize.STRING(64), allowNull: true },
        max_concurrency: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        revoked_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'tally_servers',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        name: { type: Sequelize.STRING(120), allowNull: false, unique: true },
        host: { type: Sequelize.STRING(255), allowNull: false },
        port: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 9000 },
        protocol: { type: Sequelize.ENUM('HTTP', 'HTTPS'), allowNull: false, defaultValue: 'HTTP' },
        tally_release: { type: Sequelize.STRING(32), allowNull: true },
        integration_agent_id: ref(Sequelize, 'integration_agents', { nullable: true, onDelete: 'SET NULL' }),
        status: { type: Sequelize.ENUM('UNKNOWN', 'ONLINE', 'OFFLINE', 'ERROR'), allowNull: false, defaultValue: 'UNKNOWN' },
        last_health_check_at: { type: Sequelize.DATE(3), allowNull: true },
        last_success_at: { type: Sequelize.DATE(3), allowNull: true },
        last_error: { type: Sequelize.STRING(1000), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('tally_servers', ['host', 'port'], { unique: true });

    await queryInterface.createTable(
      'companies',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        name: { type: Sequelize.STRING(200), allowNull: false },
        code: { type: Sequelize.STRING(32), allowNull: false, unique: true },
        gstin: { type: Sequelize.STRING(15), allowNull: true },
        tally_company_name: { type: Sequelize.STRING(255), allowNull: false },
        tally_server_id: ref(Sequelize, 'tally_servers', { nullable: true }),
        integration_agent_id: ref(Sequelize, 'integration_agents', { nullable: true }),
        default_currency: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'INR' },
        financial_year_start: { type: Sequelize.DATEONLY, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps(Sequelize, { paranoid: true }),
      },
      TABLE_OPTIONS,
    );
    // A Tally company name is only unique within one Tally server.
    await queryInterface.addIndex('companies', ['tally_server_id', 'tally_company_name'], { unique: true, name: 'uq_companies_server_tally_name' });

    await queryInterface.createTable(
      'user_companies',
      {
        user_id: { ...ref(Sequelize, 'users', { big: true, onDelete: 'CASCADE' }), primaryKey: true },
        company_id: { ...ref(Sequelize, 'companies', { onDelete: 'CASCADE' }), primaryKey: true },
        ...timestamps(Sequelize, { updated: false }),
      },
      TABLE_OPTIONS,
    );
  },

  async down(queryInterface) {
    for (const table of ['user_companies', 'companies', 'tally_servers', 'integration_agents']) {
      await queryInterface.dropTable(table);
    }
  },
};
