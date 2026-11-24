'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rbac = require('../../src/domain/rbac.json');

const DEFAULT_SETTINGS = [
  { key: 'queue.max_attempts', value: 5, category: 'queue', description: 'Maximum automatic attempts for transient failures' },
  { key: 'queue.retry_base_seconds', value: 60, category: 'queue', description: 'Base delay for exponential retry backoff' },
  { key: 'queue.retry_max_seconds', value: 3600, category: 'queue', description: 'Upper bound for retry backoff' },
  { key: 'queue.serialize_per_company', value: true, category: 'queue', description: 'Process at most one posting per company at a time' },
  { key: 'queue.lock_ttl_seconds', value: 300, category: 'queue', description: 'Job lock lease before a stalled worker is detected' },
  { key: 'posting.require_finance_approval', value: true, category: 'posting', description: 'Require Finance approval before posting to Tally' },
  { key: 'masters.allow_auto_creation', value: false, category: 'masters', description: 'Masters are only created after explicit approval' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || '';
    if (!email || password.length < 12) {
      throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 12 characters) in backend/.env before seeding.');
    }

    const now = new Date();
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opts = { transaction };

      // Idempotent upserts so the seeder can be re-run after the catalog grows.
      for (const p of rbac.permissions) {
        await queryInterface.sequelize.query(
          `INSERT INTO permissions (code, module, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE module = VALUES(module), description = VALUES(description), updated_at = VALUES(updated_at)`,
          { replacements: [p.code, p.module, p.description, now, now], ...opts },
        );
      }
      for (const r of rbac.roles) {
        await queryInterface.sequelize.query(
          `INSERT INTO roles (uuid, code, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), updated_at = VALUES(updated_at)`,
          { replacements: [crypto.randomUUID(), r.code, r.name, r.description, now, now], ...opts },
        );
      }

      const [permRows] = await queryInterface.sequelize.query('SELECT id, code FROM permissions', opts);
      const [roleRows] = await queryInterface.sequelize.query('SELECT id, code FROM roles', opts);
      const permId = new Map(permRows.map((p) => [p.code, p.id]));
      const roleId = new Map(roleRows.map((r) => [r.code, r.id]));

      for (const r of rbac.roles) {
        const codes = r.permissions.includes('*') ? [...permId.keys()] : r.permissions;
        for (const code of codes) {
          if (!permId.has(code)) throw new Error(`Role ${r.code} references unknown permission ${code}`);
          await queryInterface.sequelize.query(
            'INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at) VALUES (?, ?, ?)',
            { replacements: [roleId.get(r.code), permId.get(code), now], ...opts },
          );
        }
      }

      const [existing] = await queryInterface.sequelize.query('SELECT id FROM users WHERE email = ?', { replacements: [email], ...opts });
      let userId = existing[0] && existing[0].id;
      if (!userId) {
        const hash = await bcrypt.hash(password, 12);
        await queryInterface.sequelize.query(
          `INSERT INTO users (uuid, email, password_hash, full_name, is_active, company_scope, password_changed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, 'ALL', ?, ?, ?)`,
          { replacements: [crypto.randomUUID(), email, hash, process.env.SEED_ADMIN_NAME || 'Platform Administrator', now, now, now], ...opts },
        );
        const [created] = await queryInterface.sequelize.query('SELECT id FROM users WHERE email = ?', { replacements: [email], ...opts });
        userId = created[0].id;
      }
      await queryInterface.sequelize.query('INSERT IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)', {
        replacements: [userId, roleId.get('SUPER_ADMIN'), now],
        ...opts,
      });

      for (const s of DEFAULT_SETTINGS) {
        await queryInterface.sequelize.query(
          `INSERT INTO system_settings (setting_key, value, category, description, created_at, updated_at)
           VALUES (?, CAST(? AS JSON), ?, ?, ?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description)`,
          { replacements: [s.key, JSON.stringify(s.value), s.category, s.description, now, now], ...opts },
        );
      }

      const tallyHost = (process.env.SEED_TALLY_HOST || '').trim();
      if (tallyHost) {
        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO tally_servers (uuid, name, host, port, protocol, tally_release, status, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'HTTP', ?, 'UNKNOWN', 1, ?, ?)`,
          {
            replacements: [
              crypto.randomUUID(),
              'Primary Tally Server',
              tallyHost,
              Number(process.env.SEED_TALLY_PORT || 9000),
              process.env.SEED_TALLY_RELEASE || '7.1',
              now,
              now,
            ],
            ...opts,
          },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('role_permissions', {});
    await queryInterface.bulkDelete('system_settings', {});
  },
};
