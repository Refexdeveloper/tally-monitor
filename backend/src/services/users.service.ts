import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Op, QueryTypes, type Transaction } from 'sequelize';
import { z } from 'zod';
import { Company, Permission, Role, RolePermission, sequelize, User, UserCompany, UserRole, UserSession } from '../models';
import { ApiError } from '../utils/http';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { passwordSchema } from './auth/passwordPolicy';
import { iso, likePattern, num, orderBy, pageMeta, select, withUniqueMessages, type ListQuery } from './common';

const SUPER_ADMIN = 'SUPER_ADMIN';

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
  fullName: z.string().trim().min(2, 'Full name is required').max(150),
  password: passwordSchema,
  roles: z.array(z.string().max(64)).min(1, 'Assign at least one role'),
  companyScope: z.enum(['ALL', 'ASSIGNED']),
  companyIds: z.array(z.string().uuid()).max(500).default([]),
  isActive: z.boolean().default(true),
});

export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  roles: z.array(z.string().max(64)).min(1, 'Assign at least one role').optional(),
  companyScope: z.enum(['ALL', 'ASSIGNED']).optional(),
  companyIds: z.array(z.string().uuid()).max(500).optional(),
  isActive: z.boolean().optional(),
});

export const userListSchema = z.object({
  status: z.enum(['active', 'inactive', 'locked', 'all']).default('all'),
  role: z.string().max(64).optional(),
});

export const adminPasswordSchema = z.object({ password: passwordSchema });

export const roleInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{2,63}$/, 'Use 3-64 letters, digits or "_", starting with a letter'),
  name: z.string().trim().min(2).max(120),
  description: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(500).nullable().optional()),
  permissions: z.array(z.string().max(100)).default([]),
});
export const rolePermissionsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(500).nullable().optional()),
  permissions: z.array(z.string().max(100)),
});

const isSuperAdmin = (ctx: AuthContext) => ctx.roles.some((r) => r.code === SUPER_ADMIN);

async function presentUsers(where: string, repl: Record<string, unknown>, tail = '') {
  const rows = await select(
    `SELECT u.id, u.uuid, u.email, u.full_name, u.avatar_url, u.is_active, u.company_scope, u.locked_until, u.failed_login_attempts,
            u.last_login_at, u.created_at,
            (SELECT GROUP_CONCAT(CONCAT(r.code, '|', r.name) ORDER BY r.name SEPARATOR ';;') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles,
            (SELECT GROUP_CONCAT(CONCAT(c.uuid, '|', c.name) ORDER BY c.name SEPARATOR ';;') FROM user_companies uc JOIN companies c ON c.id = uc.company_id WHERE uc.user_id = u.id) AS companies
     FROM users u WHERE ${where} ${tail}`,
    repl,
  );
  const split = (v: unknown) =>
    v
      ? String(v)
          .split(';;')
          .map((p) => p.split('|'))
      : [];
  return rows.map((r) => ({
    id: r.uuid as string,
    email: r.email,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    isActive: Boolean(r.is_active),
    companyScope: r.company_scope,
    lockedUntil: r.locked_until && new Date(r.locked_until as string) > new Date() ? iso(r.locked_until) : null,
    lastLoginAt: iso(r.last_login_at),
    createdAt: iso(r.created_at),
    roles: split(r.roles).map(([code, name]) => ({ code: code!, name: name! })),
    companies: split(r.companies).map(([id, name]) => ({ id: id!, name: name! })),
  }));
}

export async function listUsers(q: ListQuery & z.infer<typeof userListSchema>) {
  const where = ['u.deleted_at IS NULL'];
  const repl: Record<string, unknown> = {};
  if (q.search) {
    where.push('(u.email LIKE :s OR u.full_name LIKE :s)');
    repl.s = likePattern(q.search);
  }
  if (q.status === 'active') where.push('u.is_active = 1');
  if (q.status === 'inactive') where.push('u.is_active = 0');
  if (q.status === 'locked') where.push('u.locked_until > UTC_TIMESTAMP(3)');
  if (q.role) {
    where.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = :role)');
    repl.role = q.role;
  }
  const whereSql = where.join(' AND ');
  const sort = orderBy(q, { name: 'u.full_name', email: 'u.email', lastLoginAt: 'u.last_login_at', createdAt: 'u.created_at' }, 'name');
  const [items, count] = await Promise.all([
    presentUsers(whereSql, { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }, `ORDER BY ${sort} LIMIT :limit OFFSET :offset`),
    select(`SELECT COUNT(*) AS n FROM users u WHERE ${whereSql}`, repl),
  ]);
  return { items, meta: pageMeta(q, num(count[0]?.n)) };
}

async function userByUuid(uuid: string) {
  const user = await User.findOne({ where: { uuid } });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function getUser(uuid: string) {
  const user = await userByUuid(uuid);
  return (await presentUsers('u.id = :id', { id: user.id }))[0]!;
}

async function resolveRoles(ctx: AuthContext, codes: string[]) {
  const roles = await Role.findAll({ where: { code: { [Op.in]: codes } } });
  if (roles.length !== new Set(codes).size) throw ApiError.badRequest('One or more roles do not exist');
  if (roles.some((r) => r.code === SUPER_ADMIN) && !isSuperAdmin(ctx)) throw ApiError.forbidden('Only a Super Admin can grant the Super Admin role');
  return roles;
}

async function resolveCompanies(uuids: string[]) {
  if (!uuids.length) return [];
  const companies = await Company.findAll({ where: { uuid: { [Op.in]: uuids } } });
  if (companies.length !== new Set(uuids).size) throw ApiError.badRequest('One or more companies do not exist');
  return companies;
}

async function activeSuperAdminCount(transaction?: Transaction) {
  const [row] = await sequelize.query<{ n: number }>(
    `SELECT COUNT(DISTINCT u.id) AS n FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE r.code = 'SUPER_ADMIN' AND u.is_active = 1 AND u.deleted_at IS NULL`,
    { type: QueryTypes.SELECT, transaction },
  );
  return num(row?.n);
}

async function revokeSessions(userId: number, reason: string, transaction?: Transaction) {
  await UserSession.update({ revokedAt: new Date(), revokedReason: reason }, { where: { userId, revokedAt: { [Op.is]: null } }, transaction });
}

export async function createUser(ctx: AuthContext, input: z.infer<typeof userCreateSchema>, req: Request) {
  const roles = await resolveRoles(ctx, input.roles);
  const companies = input.companyScope === 'ASSIGNED' ? await resolveCompanies(input.companyIds) : [];
  if (input.companyScope === 'ALL' && ctx.companyIds !== 'ALL') throw ApiError.forbidden('You cannot grant access to all companies');
  const hash = await bcrypt.hash(input.password, 12);

  const user = await withUniqueMessages(
    () =>
      sequelize.transaction(async (transaction) => {
        const created = await User.create(
          {
            email: input.email,
            passwordHash: hash,
            fullName: input.fullName,
            avatarUrl: null,
            isActive: input.isActive,
            companyScope: input.companyScope,
            lockedUntil: null,
            lastLoginAt: null,
            lastLoginIp: null,
            passwordChangedAt: new Date(),
            deletedAt: null,
          },
          { transaction },
        );
        await UserRole.bulkCreate(roles.map((r) => ({ userId: created.id, roleId: r.id })), { transaction });
        if (companies.length) await UserCompany.bulkCreate(companies.map((c) => ({ userId: created.id, companyId: c.id })), { transaction });
        await audit(
          { action: 'USER_CREATED', userId: ctx.user.id, entityType: 'user', entityUuid: created.uuid, metadata: { email: created.email, roles: input.roles, scope: input.companyScope } },
          req,
          transaction,
        );
        return created;
      }),
    { email: 'A user with this email already exists' },
  );
  return getUser(user.uuid);
}

export async function updateUser(ctx: AuthContext, uuid: string, input: z.infer<typeof userUpdateSchema>, req: Request) {
  const user = await userByUuid(uuid);
  const self = user.id === ctx.user.id;
  if (self && input.isActive === false) throw ApiError.badRequest('You cannot deactivate your own account');

  const currentRoles = (await select('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id', { id: user.id })).map((r) => String(r.code));
  if (currentRoles.includes(SUPER_ADMIN) && !isSuperAdmin(ctx)) throw ApiError.forbidden('Only a Super Admin can modify a Super Admin account');
  const roles = input.roles ? await resolveRoles(ctx, input.roles) : null;
  if (self && roles && currentRoles.includes(SUPER_ADMIN) && !roles.some((r) => r.code === SUPER_ADMIN)) {
    throw ApiError.badRequest('You cannot remove your own Super Admin role');
  }
  const scope = input.companyScope ?? user.companyScope;
  if (scope === 'ALL' && input.companyScope === 'ALL' && ctx.companyIds !== 'ALL') throw ApiError.forbidden('You cannot grant access to all companies');
  const companies = input.companyIds && scope === 'ASSIGNED' ? await resolveCompanies(input.companyIds) : null;
  const wasActive = user.isActive;

  await sequelize.transaction(async (transaction) => {
    const fields: Record<string, unknown> = {};
    if (input.fullName !== undefined) fields.fullName = input.fullName;
    if (input.isActive !== undefined) fields.isActive = input.isActive;
    if (input.companyScope !== undefined) fields.companyScope = input.companyScope;
    if (Object.keys(fields).length) await user.update(fields, { transaction });
    if (roles) {
      await UserRole.destroy({ where: { userId: user.id }, transaction });
      await UserRole.bulkCreate(roles.map((r) => ({ userId: user.id, roleId: r.id })), { transaction });
    }
    if (scope === 'ALL') await UserCompany.destroy({ where: { userId: user.id }, transaction });
    else if (companies) {
      await UserCompany.destroy({ where: { userId: user.id }, transaction });
      if (companies.length) await UserCompany.bulkCreate(companies.map((c) => ({ userId: user.id, companyId: c.id })), { transaction });
    }
    if (await activeSuperAdminCount(transaction) === 0) throw ApiError.badRequest('At least one active Super Admin must remain');
    if (input.isActive === false) await revokeSessions(user.id, 'USER_DEACTIVATED', transaction);
    await audit(
      {
        action: input.isActive === false && wasActive ? 'USER_DEACTIVATED' : input.isActive === true && !wasActive ? 'USER_ACTIVATED' : 'USER_UPDATED',
        userId: ctx.user.id,
        entityType: 'user',
        entityUuid: user.uuid,
        metadata: { changed: Object.keys(input), roles: input.roles },
      },
      req,
      transaction,
    );
  });
  return getUser(uuid);
}

export async function unlockUser(ctx: AuthContext, uuid: string, req: Request) {
  const user = await userByUuid(uuid);
  await user.update({ lockedUntil: null, failedLoginAttempts: 0 });
  await audit({ action: 'USER_UNLOCKED', userId: ctx.user.id, entityType: 'user', entityUuid: user.uuid }, req);
  return getUser(uuid);
}

export async function setUserPassword(ctx: AuthContext, uuid: string, password: string, req: Request) {
  const user = await userByUuid(uuid);
  const roles = (await select('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id', { id: user.id })).map((r) => String(r.code));
  if (roles.includes(SUPER_ADMIN) && !isSuperAdmin(ctx)) throw ApiError.forbidden('Only a Super Admin can reset a Super Admin password');
  const hash = await bcrypt.hash(password, 12);
  await sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash: hash, passwordChangedAt: new Date(), lockedUntil: null, failedLoginAttempts: 0 }, { transaction });
    await revokeSessions(user.id, 'ADMIN_PASSWORD_RESET', transaction);
    await audit({ action: 'USER_PASSWORD_RESET_BY_ADMIN', userId: ctx.user.id, entityType: 'user', entityUuid: user.uuid }, req, transaction);
  });
  return { updated: true };
}

// --- Roles & permissions ---------------------------------------------------

export async function listPermissions() {
  const perms = await Permission.findAll({ order: [['module', 'ASC'], ['code', 'ASC']] });
  return perms.map((p) => ({ code: p.code, module: p.module, description: p.description }));
}

export async function listRoles() {
  const rows = await select(
    `SELECT r.id, r.uuid, r.code, r.name, r.description, r.is_system,
            (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL WHERE ur.role_id = r.id) AS users,
            (SELECT GROUP_CONCAT(p.code ORDER BY p.code) FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = r.id) AS permissions
     FROM roles r ORDER BY r.is_system DESC, r.id`,
  );
  return rows.map((r) => ({
    id: r.uuid as string,
    code: r.code as string,
    name: r.name,
    description: r.description,
    isSystem: Boolean(r.is_system),
    editable: r.code !== SUPER_ADMIN,
    users: num(r.users),
    permissions: r.permissions ? String(r.permissions).split(',') : [],
  }));
}

async function setRolePermissions(roleId: number, codes: string[], transaction: Transaction) {
  const perms = await Permission.findAll({ where: { code: { [Op.in]: codes } }, transaction });
  if (perms.length !== new Set(codes).size) throw ApiError.badRequest('One or more permissions do not exist');
  await RolePermission.destroy({ where: { roleId }, transaction });
  if (perms.length) await RolePermission.bulkCreate(perms.map((p) => ({ roleId, permissionId: p.id })), { transaction });
}

export async function createRole(ctx: AuthContext, input: z.infer<typeof roleInputSchema>, req: Request) {
  const role = await withUniqueMessages(
    () =>
      sequelize.transaction(async (transaction) => {
        const created = await Role.create({ code: input.code, name: input.name, description: input.description ?? null, isSystem: false }, { transaction });
        await setRolePermissions(created.id, input.permissions, transaction);
        await audit({ action: 'ROLE_CREATED', userId: ctx.user.id, entityType: 'role', entityUuid: created.uuid, metadata: { code: created.code, permissions: input.permissions } }, req, transaction);
        return created;
      }),
    { code: 'A role with this code already exists' },
  );
  return (await listRoles()).find((r) => r.id === role.uuid)!;
}

export async function updateRole(ctx: AuthContext, uuid: string, input: z.infer<typeof rolePermissionsSchema>, req: Request) {
  const role = await Role.findOne({ where: { uuid } });
  if (!role) throw ApiError.notFound('Role not found');
  if (role.code === SUPER_ADMIN) throw ApiError.badRequest('The Super Admin role always has every permission and cannot be edited');
  const before = (await listRoles()).find((r) => r.id === uuid)!.permissions;
  await sequelize.transaction(async (transaction) => {
    const fields: Record<string, unknown> = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.description !== undefined) fields.description = input.description;
    if (Object.keys(fields).length) await role.update(fields, { transaction });
    await setRolePermissions(role.id, input.permissions, transaction);
    await audit(
      {
        action: 'ROLE_PERMISSIONS_CHANGED',
        userId: ctx.user.id,
        entityType: 'role',
        entityUuid: role.uuid,
        metadata: { added: input.permissions.filter((p) => !before.includes(p)), removed: before.filter((p) => !input.permissions.includes(p)) },
      },
      req,
      transaction,
    );
  });
  return (await listRoles()).find((r) => r.id === uuid)!;
}

export async function deleteRole(ctx: AuthContext, uuid: string, req: Request) {
  const role = await Role.findOne({ where: { uuid } });
  if (!role) throw ApiError.notFound('Role not found');
  if (role.isSystem) throw ApiError.badRequest('Built-in roles cannot be deleted');
  const users = await UserRole.count({ where: { roleId: role.id } });
  if (users) throw ApiError.conflict(`This role is assigned to ${users} user(s). Reassign them first.`, 'ROLE_IN_USE');
  await sequelize.transaction(async (transaction) => {
    await RolePermission.destroy({ where: { roleId: role.id }, transaction });
    await role.destroy({ transaction });
    await audit({ action: 'ROLE_DELETED', userId: ctx.user.id, entityType: 'role', entityUuid: role.uuid, metadata: { code: role.code } }, req, transaction);
  });
}
