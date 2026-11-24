import { Company, Permission, Role, User, UserCompany } from '../../models';

export interface AuthUser {
  id: number;
  uuid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: number;
  roles: { code: string; name: string }[];
  permissions: Set<string>;
  /** 'ALL' or the explicit list of company ids the user may access. */
  companyIds: 'ALL' | number[];
}

export async function loadAuthContext(userId: number, sessionId: number): Promise<AuthContext | null> {
  const user = await User.findByPk(userId, {
    include: [
      {
        model: Role,
        as: 'roles',
        through: { attributes: [] },
        include: [{ model: Permission, as: 'permissions', through: { attributes: [] }, attributes: ['code'] }],
      },
    ],
  });
  if (!user || !user.isActive) return null;

  const roles = user.roles ?? [];
  const permissions = new Set<string>();
  for (const role of roles) for (const p of role.permissions ?? []) permissions.add(p.code);

  const isSuperAdmin = roles.some((r) => r.code === 'SUPER_ADMIN');
  let companyIds: AuthContext['companyIds'] = 'ALL';
  if (!isSuperAdmin && user.companyScope === 'ASSIGNED') {
    const links = await UserCompany.findAll({ where: { userId: user.id }, attributes: ['companyId'] });
    companyIds = links.map((l) => l.companyId);
  }

  return {
    user: { id: user.id, uuid: user.uuid, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl },
    sessionId,
    roles: roles.map((r) => ({ code: r.code, name: r.name })),
    permissions,
    companyIds,
  };
}

/** Public profile returned to the web client. */
export async function toProfile(ctx: AuthContext) {
  const companies =
    ctx.companyIds === 'ALL'
      ? null
      : await Company.findAll({ where: { id: ctx.companyIds }, attributes: ['uuid', 'name', 'code'], order: [['name', 'ASC']] });
  return {
    uuid: ctx.user.uuid,
    email: ctx.user.email,
    fullName: ctx.user.fullName,
    avatarUrl: ctx.user.avatarUrl,
    roles: ctx.roles,
    permissions: [...ctx.permissions].sort(),
    companyScope: ctx.companyIds === 'ALL' ? 'ALL' : 'ASSIGNED',
    companies: companies?.map((c) => ({ uuid: c.uuid, name: c.name, code: c.code })) ?? null,
  };
}
