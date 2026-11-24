'use strict';

const { TABLE_OPTIONS, bigId, intId, uuid, ref, timestamps } = require('../lib/schema');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'roles',
      {
        id: intId(Sequelize),
        uuid: uuid(Sequelize),
        code: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        name: { type: Sequelize.STRING(120), allowNull: false },
        description: { type: Sequelize.STRING(500), allowNull: true },
        is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'permissions',
      {
        id: intId(Sequelize),
        code: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        module: { type: Sequelize.STRING(64), allowNull: false },
        description: { type: Sequelize.STRING(255), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'role_permissions',
      {
        role_id: { ...ref(Sequelize, 'roles', { onDelete: 'CASCADE' }), primaryKey: true },
        permission_id: { ...ref(Sequelize, 'permissions', { onDelete: 'CASCADE' }), primaryKey: true },
        ...timestamps(Sequelize, { updated: false }),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'users',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        password_hash: { type: Sequelize.STRING(255), allowNull: false },
        full_name: { type: Sequelize.STRING(150), allowNull: false },
        avatar_url: { type: Sequelize.STRING(500), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        company_scope: { type: Sequelize.ENUM('ALL', 'ASSIGNED'), allowNull: false, defaultValue: 'ASSIGNED' },
        failed_login_attempts: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        locked_until: { type: Sequelize.DATE(3), allowNull: true },
        last_login_at: { type: Sequelize.DATE(3), allowNull: true },
        last_login_ip: { type: Sequelize.STRING(64), allowNull: true },
        password_changed_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize, { paranoid: true }),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'user_roles',
      {
        user_id: { ...ref(Sequelize, 'users', { big: true, onDelete: 'CASCADE' }), primaryKey: true },
        role_id: { ...ref(Sequelize, 'roles', { onDelete: 'CASCADE' }), primaryKey: true },
        ...timestamps(Sequelize, { updated: false }),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'user_sessions',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        user_id: ref(Sequelize, 'users', { big: true, onDelete: 'CASCADE' }),
        family_id: { type: Sequelize.CHAR(36), allowNull: false },
        token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
        remember_me: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        expires_at: { type: Sequelize.DATE(3), allowNull: false },
        revoked_at: { type: Sequelize.DATE(3), allowNull: true },
        revoked_reason: { type: Sequelize.STRING(64), allowNull: true },
        replaced_by_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        last_used_at: { type: Sequelize.DATE(3), allowNull: true },
        ip_address: { type: Sequelize.STRING(64), allowNull: true },
        user_agent: { type: Sequelize.STRING(500), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('user_sessions', ['user_id', 'revoked_at']);
    await queryInterface.addIndex('user_sessions', ['family_id']);

    await queryInterface.createTable(
      'password_reset_tokens',
      {
        id: bigId(Sequelize),
        user_id: ref(Sequelize, 'users', { big: true, onDelete: 'CASCADE' }),
        token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
        expires_at: { type: Sequelize.DATE(3), allowNull: false },
        used_at: { type: Sequelize.DATE(3), allowNull: true },
        requested_ip: { type: Sequelize.STRING(64), allowNull: true },
        ...timestamps(Sequelize, { updated: false }),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('password_reset_tokens', ['user_id', 'used_at']);
  },

  async down(queryInterface) {
    for (const table of ['password_reset_tokens', 'user_sessions', 'user_roles', 'users', 'role_permissions', 'permissions', 'roles']) {
      await queryInterface.dropTable(table);
    }
  },
};
