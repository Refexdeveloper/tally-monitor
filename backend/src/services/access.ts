import type { AuthContext } from './auth/authContext';

/**
 * Builds a parameterized SQL predicate restricting rows to the companies the
 * user may access. Every company-owned query must apply this.
 */
export function companyScope(ctx: AuthContext, column: string): { sql: string; replacements: Record<string, unknown> } {
  if (!/^[a-z_]+\.[a-z_]+$/.test(column)) throw new Error(`Unsafe scope column ${column}`);
  if (ctx.companyIds === 'ALL') return { sql: '1=1', replacements: {} };
  if (ctx.companyIds.length === 0) return { sql: '1=0', replacements: {} };
  return { sql: `${column} IN (:scopeCompanyIds)`, replacements: { scopeCompanyIds: ctx.companyIds } };
}
