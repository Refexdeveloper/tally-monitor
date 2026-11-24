import type { Request } from 'express';
import { z } from 'zod';
import { SUPPORTED_KINDS } from '../domain/voucherEngine';
import { Application, ApplicationCompany, Company, VoucherConfiguration, VoucherMapping } from '../models';
import { VOUCHER_KINDS } from '../models/common';
import { ApiError } from '../utils/http';
import { companyScope } from './access';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { hasCompanyAccess, iso, likePattern, num, orderBy, pageMeta, resolveCompany, select, withUniqueMessages, type ListQuery } from './common';

const ledgerName = z.string().trim().min(1, 'Ledger name is required').max(255);
const template = z.string().trim().max(200).optional();
const nullableText = (max: number) => z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

const debitRule = z.discriminatedUnion('source', [z.object({ source: z.literal('LEDGER_MAPPING') }), z.object({ source: z.literal('FIXED'), ledger: ledgerName })]);
const creditRule = z.discriminatedUnion('source', [
  z.object({ source: z.literal('FIXED'), ledger: ledgerName }),
  z.object({ source: z.literal('EMPLOYEE_LEDGER'), template }),
  z.object({ source: z.literal('VENDOR_LEDGER'), template }),
]);
const partyRule = z.discriminatedUnion('source', [z.object({ source: z.literal('CREDIT_LEDGER') }), z.object({ source: z.literal('NONE') }), z.object({ source: z.literal('FIXED'), ledger: ledgerName })]);
const taxRule = z.discriminatedUnion('source', [z.object({ source: z.literal('NONE') }), z.object({ source: z.literal('FIXED'), ledger: ledgerName })]);

const configShape = {
  voucherKind: z.enum(VOUCHER_KINDS).refine((k) => (SUPPORTED_KINDS as readonly string[]).includes(k), 'Sales, credit note and debit note vouchers are not supported yet'),
  tallyVoucherTypeName: z.string().trim().min(1, 'Tally voucher type name is required').max(150),
  numberingMode: z.enum(['TALLY_AUTO', 'SOURCE_REFERENCE', 'TEMPLATE']),
  numberingTemplate: nullableText(150),
  debitLedgerRule: debitRule,
  creditLedgerRule: creditRule,
  partyLedgerRule: partyRule,
  taxLedgerRule: taxRule,
  narrationTemplate: nullableText(1000),
  referenceTemplate: nullableText(255),
  costCentreEnabled: z.boolean(),
  billAllocationEnabled: z.boolean(),
  // "NEVER" exists in the schema for completeness but is refused: Finance approval cannot be bypassed.
  approvalPolicy: z.enum(['ALWAYS', 'ABOVE_THRESHOLD']),
  approvalThreshold: z.preprocess((v) => (v === '' || v === null ? null : String(v)), z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount').nullable().optional()),
  isActive: z.boolean(),
};

function checkConfig(v: { numberingMode?: string; numberingTemplate?: string | null; approvalPolicy?: string; approvalThreshold?: string | null }, ctx: z.RefinementCtx) {
  if (v.numberingMode === 'TEMPLATE' && !v.numberingTemplate) ctx.addIssue({ code: 'custom', path: ['numberingTemplate'], message: 'Provide a numbering template' });
  if (v.approvalPolicy === 'ABOVE_THRESHOLD' && !v.approvalThreshold) ctx.addIssue({ code: 'custom', path: ['approvalThreshold'], message: 'Provide the approval threshold' });
}

export const configInputSchema = z.object({ companyId: z.string().uuid(), ...configShape }).superRefine(checkConfig);
export const configUpdateSchema = z.object(configShape).partial().superRefine(checkConfig);
export const companyQuery = z.object({ companyId: z.string().uuid('Select a company') });

export const voucherMappingInputSchema = z.object({
  companyId: z.string().uuid(),
  applicationId: z.string().uuid(),
  expenseCategory: nullableText(150),
  voucherConfigurationId: z.string().uuid(),
  priority: z.coerce.number().int().min(1).max(1000).default(100),
  isActive: z.boolean().default(true),
});
export const voucherMappingUpdateSchema = z.object({
  expenseCategory: nullableText(150),
  voucherConfigurationId: z.string().uuid().optional(),
  priority: z.coerce.number().int().min(1).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const postedListSchema = z.object({
  companyId: z.string().uuid().optional(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'MISMATCH']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const CONFIG_UNIQUE = { uq_voucher_cfg_company_kind_type: 'This company already has a configuration for this voucher kind and Tally voucher type' };
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

function presentConfig(r: Record<string, unknown>) {
  return {
    id: r.uuid as string,
    voucherKind: r.voucher_kind,
    tallyVoucherTypeName: r.tally_voucher_type_name,
    numberingMode: r.numbering_mode,
    numberingTemplate: r.numbering_template,
    debitLedgerRule: parse(r.debit_ledger_rule),
    creditLedgerRule: parse(r.credit_ledger_rule),
    partyLedgerRule: parse(r.party_ledger_rule),
    taxLedgerRule: parse(r.tax_ledger_rule),
    narrationTemplate: r.narration_template,
    referenceTemplate: r.reference_template,
    costCentreEnabled: Boolean(r.cost_centre_enabled),
    billAllocationEnabled: Boolean(r.bill_allocation_enabled),
    approvalPolicy: r.approval_policy,
    approvalThreshold: r.approval_threshold === null ? null : String(r.approval_threshold),
    isActive: Boolean(r.is_active),
    usage: { mappings: num(r.mappings), jobs: num(r.jobs), defaultFor: r.default_for ? String(r.default_for).split(',') : [] },
    updatedAt: iso(r.updated_at),
  };
}

export async function listConfigs(ctx: AuthContext, companyUuid: string) {
  const company = await resolveCompany(ctx, companyUuid);
  const rows = await select(
    `SELECT v.*, (SELECT COUNT(*) FROM voucher_mappings vm WHERE vm.voucher_configuration_id = v.id AND vm.is_active = 1) AS mappings,
            (SELECT COUNT(*) FROM processing_jobs j WHERE j.voucher_configuration_id = v.id) AS jobs,
            (SELECT GROUP_CONCAT(a.name ORDER BY a.name) FROM applications a JOIN application_companies ac ON ac.application_id = a.id AND ac.company_id = v.company_id
              WHERE a.deleted_at IS NULL AND a.default_voucher_kind = v.voucher_kind) AS default_for
     FROM voucher_configurations v WHERE v.company_id = :c ORDER BY v.is_active DESC, v.voucher_kind, v.tally_voucher_type_name`,
    { c: company.id },
  );
  return rows.map(presentConfig);
}

async function configForCompany(ctx: AuthContext, uuid: string) {
  const cfg = await VoucherConfiguration.findOne({ where: { uuid } });
  if (!cfg || !hasCompanyAccess(ctx, cfg.companyId)) throw ApiError.notFound('Voucher configuration not found');
  return cfg;
}

export async function createConfig(ctx: AuthContext, input: z.infer<typeof configInputSchema>, req: Request) {
  const company = await resolveCompany(ctx, input.companyId);
  const { companyId: _c, ...fields } = input;
  const cfg = await withUniqueMessages(
    () =>
      VoucherConfiguration.create({
        ...fields,
        companyId: company.id,
        numberingTemplate: fields.numberingTemplate ?? null,
        narrationTemplate: fields.narrationTemplate ?? null,
        referenceTemplate: fields.referenceTemplate ?? null,
        approvalThreshold: fields.approvalPolicy === 'ABOVE_THRESHOLD' ? (fields.approvalThreshold ?? null) : null,
      }),
    CONFIG_UNIQUE,
  );
  await audit({ action: 'VOUCHER_CONFIG_CREATED', userId: ctx.user.id, entityType: 'voucher_configuration', entityUuid: cfg.uuid, companyId: company.id, metadata: { kind: cfg.voucherKind, type: cfg.tallyVoucherTypeName } }, req);
  return (await listConfigs(ctx, company.uuid)).find((c) => c.id === cfg.uuid)!;
}

export async function updateConfig(ctx: AuthContext, uuid: string, input: z.infer<typeof configUpdateSchema>, req: Request) {
  const cfg = await configForCompany(ctx, uuid);
  const company = (await Company.findByPk(cfg.companyId))!;
  const changes: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const policy = (changes.approvalPolicy as string | undefined) ?? cfg.approvalPolicy;
  if (policy === 'ABOVE_THRESHOLD' && !(changes.approvalThreshold ?? cfg.approvalThreshold)) throw new ApiError(422, 'VALIDATION_ERROR', 'Provide the approval threshold');
  if (policy !== 'ABOVE_THRESHOLD') changes.approvalThreshold = null;
  await withUniqueMessages(() => cfg.update(changes), CONFIG_UNIQUE);
  await audit({ action: 'VOUCHER_CONFIG_CHANGED', userId: ctx.user.id, entityType: 'voucher_configuration', entityUuid: cfg.uuid, companyId: cfg.companyId, metadata: { changed: Object.keys(changes) } }, req);
  return (await listConfigs(ctx, company.uuid)).find((c) => c.id === cfg.uuid)!;
}

// --- Voucher routing -------------------------------------------------------------

export async function listVoucherMappings(ctx: AuthContext, companyUuid: string) {
  const company = await resolveCompany(ctx, companyUuid);
  const rows = await select(
    `SELECT vm.uuid, vm.expense_category, vm.priority, vm.is_active, vm.updated_at, a.uuid AS app_uuid, a.name AS app_name, v.uuid AS cfg_uuid,
            v.tally_voucher_type_name, v.voucher_kind, v.is_active AS cfg_active
     FROM voucher_mappings vm JOIN applications a ON a.id = vm.application_id JOIN voucher_configurations v ON v.id = vm.voucher_configuration_id
     WHERE vm.company_id = :c AND a.deleted_at IS NULL ORDER BY a.name, vm.expense_category IS NULL, vm.priority, vm.expense_category`,
    { c: company.id },
  );
  return rows.map((r) => ({
    id: r.uuid,
    application: { id: r.app_uuid, name: r.app_name },
    expenseCategory: r.expense_category,
    priority: num(r.priority),
    isActive: Boolean(r.is_active),
    configuration: { id: r.cfg_uuid, name: r.tally_voucher_type_name, voucherKind: r.voucher_kind, isActive: Boolean(r.cfg_active) },
    updatedAt: iso(r.updated_at),
  }));
}

async function linkedApplication(companyId: number, appUuid: string) {
  const app = await Application.findOne({ where: { uuid: appUuid } });
  if (!app) throw ApiError.badRequest('Application not found');
  if (!(await ApplicationCompany.findOne({ where: { applicationId: app.id, companyId } }))) throw ApiError.badRequest(`${app.name} is not connected to this company`);
  return app;
}

async function configInCompany(companyId: number, cfgUuid: string) {
  const cfg = await VoucherConfiguration.findOne({ where: { uuid: cfgUuid, companyId } });
  if (!cfg) throw ApiError.badRequest('Voucher configuration does not belong to this company');
  return cfg;
}

const VM_UNIQUE = { uq_voucher_mappings_scope: 'A voucher rule for this application and category already exists' };

export async function createVoucherMapping(ctx: AuthContext, input: z.infer<typeof voucherMappingInputSchema>, req: Request) {
  const company = await resolveCompany(ctx, input.companyId);
  const app = await linkedApplication(company.id, input.applicationId);
  const cfg = await configInCompany(company.id, input.voucherConfigurationId);
  const vm = await withUniqueMessages(
    () => VoucherMapping.create({ companyId: company.id, applicationId: app.id, expenseCategory: input.expenseCategory ?? null, voucherConfigurationId: cfg.id, priority: input.priority, isActive: input.isActive }),
    VM_UNIQUE,
  );
  await audit({ action: 'VOUCHER_MAPPING_CREATED', userId: ctx.user.id, entityType: 'voucher_mapping', entityUuid: vm.uuid, companyId: company.id, applicationId: app.id, metadata: { category: input.expenseCategory ?? '*', configuration: cfg.tallyVoucherTypeName } }, req);
  return (await listVoucherMappings(ctx, company.uuid)).find((m) => m.id === vm.uuid)!;
}

export async function updateVoucherMapping(ctx: AuthContext, uuid: string, input: z.infer<typeof voucherMappingUpdateSchema>, req: Request) {
  const vm = await VoucherMapping.findOne({ where: { uuid } });
  if (!vm || !hasCompanyAccess(ctx, vm.companyId)) throw ApiError.notFound('Voucher rule not found');
  const company = (await Company.findByPk(vm.companyId))!;
  const changes: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== undefined && k !== 'voucherConfigurationId'));
  if (input.voucherConfigurationId) changes.voucherConfigurationId = (await configInCompany(vm.companyId, input.voucherConfigurationId)).id;
  await withUniqueMessages(() => vm.update(changes), VM_UNIQUE);
  await audit({ action: 'VOUCHER_MAPPING_CHANGED', userId: ctx.user.id, entityType: 'voucher_mapping', entityUuid: vm.uuid, companyId: vm.companyId, metadata: { changed: Object.keys(changes) } }, req);
  return (await listVoucherMappings(ctx, company.uuid)).find((m) => m.id === vm.uuid)!;
}

export async function deleteVoucherMapping(ctx: AuthContext, uuid: string, req: Request) {
  const vm = await VoucherMapping.findOne({ where: { uuid } });
  if (!vm || !hasCompanyAccess(ctx, vm.companyId)) throw ApiError.notFound('Voucher rule not found');
  await vm.destroy();
  await audit({ action: 'VOUCHER_MAPPING_DELETED', userId: ctx.user.id, entityType: 'voucher_mapping', entityUuid: vm.uuid, companyId: vm.companyId }, req);
}

// --- Posted voucher register ------------------------------------------------------

export async function listPostedVouchers(ctx: AuthContext, q: ListQuery & z.infer<typeof postedListSchema>) {
  const scope = companyScope(ctx, 'pv.company_id');
  const where = [scope.sql];
  const repl: Record<string, unknown> = { ...scope.replacements };
  if (q.companyId) {
    where.push('c.uuid = :companyUuid');
    repl.companyUuid = q.companyId;
  }
  if (q.verificationStatus) {
    where.push('pv.verification_status = :vs');
    repl.vs = q.verificationStatus;
  }
  if (q.dateFrom) {
    where.push('pv.voucher_date >= :df');
    repl.df = q.dateFrom;
  }
  if (q.dateTo) {
    where.push('pv.voucher_date <= :dt');
    repl.dt = q.dateTo;
  }
  if (q.search) {
    where.push('(pv.voucher_number LIKE :s OR pv.reference LIKE :s OR e.request_number LIKE :s)');
    repl.s = likePattern(q.search);
  }
  const whereSql = where.join(' AND ');
  const sort = orderBy(q, { voucherDate: 'pv.voucher_date', verifiedAt: 'pv.verified_at', amount: 'pv.total_amount' }, 'verifiedAt');
  const base = `FROM posted_vouchers pv JOIN companies c ON c.id = pv.company_id JOIN expense_transactions e ON e.id = pv.expense_id JOIN applications a ON a.id = e.application_id`;
  const [rows, count] = await Promise.all([
    select(
      `SELECT pv.uuid, pv.voucher_kind, pv.tally_voucher_type_name, pv.voucher_number, pv.voucher_date, pv.reference, pv.tally_master_id, pv.tally_alter_id,
              pv.total_amount, pv.currency, pv.verification_status, pv.verified_at, c.uuid AS company_uuid, c.name AS company_name,
              e.uuid AS expense_uuid, e.request_number, a.name AS app_name
       ${base} WHERE ${whereSql} ORDER BY ${sort} LIMIT :limit OFFSET :offset`,
      { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize },
    ),
    select(`SELECT COUNT(*) AS n ${base} WHERE ${whereSql}`, repl),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.uuid,
      voucherKind: r.voucher_kind,
      voucherType: r.tally_voucher_type_name,
      voucherNumber: r.voucher_number,
      voucherDate: r.voucher_date,
      reference: r.reference,
      tallyMasterId: r.tally_master_id === null ? null : String(r.tally_master_id),
      tallyAlterId: r.tally_alter_id === null ? null : String(r.tally_alter_id),
      amount: String(r.total_amount),
      currency: r.currency,
      verificationStatus: r.verification_status,
      verifiedAt: iso(r.verified_at),
      company: { id: r.company_uuid, name: r.company_name },
      expense: { id: r.expense_uuid, requestNumber: r.request_number },
      application: r.app_name,
    })),
    meta: pageMeta(q, num(count[0]?.n)),
  };
}
