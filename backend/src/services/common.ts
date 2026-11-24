import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { z } from 'zod';
import { Company, sequelize } from '../models';
import { ApiError } from '../utils/http';
import type { AuthContext } from './auth/authContext';

export type Row = Record<string, unknown>;

export function select<T extends object = Row>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
}

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export function pageMeta(q: ListQuery, total: number) {
  return { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

/** Maps a user-supplied sort key onto a whitelisted SQL expression. */
export function orderBy(q: ListQuery, allowed: Record<string, string>, fallback: string) {
  const column = (q.sort && allowed[q.sort]) || allowed[fallback]!;
  return `${column} ${q.order === 'asc' ? 'ASC' : 'DESC'}`;
}

/** Escapes LIKE wildcards in user input. */
export const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export function hasCompanyAccess(ctx: AuthContext, companyId: number) {
  return ctx.companyIds === 'ALL' || ctx.companyIds.includes(companyId);
}

export function assertCompanyAccess(ctx: AuthContext, companyId: number) {
  // 404 rather than 403 so other companies' existence is not disclosed.
  if (!hasCompanyAccess(ctx, companyId)) throw ApiError.notFound('Company not found');
}

export async function resolveCompany(ctx: AuthContext, uuid: string) {
  const company = await Company.findOne({ where: { uuid } });
  if (!company) throw ApiError.notFound('Company not found');
  assertCompanyAccess(ctx, company.id);
  return company;
}

/** Turns unique-constraint violations into a readable 409. */
export async function withUniqueMessages<T>(fn: () => Promise<T>, messages: Record<string, string>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      const raw = `${err.message} ${(err.parent as { sqlMessage?: string } | undefined)?.sqlMessage ?? ''} ${err.errors.map((e) => e.path).join(' ')}`;
      const hit = Object.entries(messages).find(([key]) => raw.includes(key));
      throw ApiError.conflict(hit ? hit[1] : 'A record with the same unique value already exists', 'DUPLICATE');
    }
    throw err;
  }
}

/** Accepts "" from forms as null. */
export const nullableText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());

export const uuidParam = z.object({ id: z.string().uuid('Invalid id') });

export const OPEN_JOB_SQL = "j.status NOT IN ('POSTED', 'CANCELLED')";
