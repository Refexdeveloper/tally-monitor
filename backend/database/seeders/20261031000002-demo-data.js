'use strict';

/**
 * Development-only demo dataset. Generates realistic, clearly fictional group
 * companies, Kissflow applications, expenses and queue history so the
 * dashboard can be exercised end-to-end against MySQL.
 */
const crypto = require('crypto');

const DEMO_PREFIX = 'DEMO-';

const COMPANIES = [
  { code: 'DEMO-AUR', name: 'Aurora Renewables Pvt Ltd', gstin: '33AAACA1234F1Z5' },
  { code: 'DEMO-BLU', name: 'Bluepeak Logistics Ltd', gstin: '29AABCB5678K1Z2' },
  { code: 'DEMO-CED', name: 'Cedar Infra Projects Ltd', gstin: '27AACCC9012M1Z8' },
  { code: 'DEMO-DUN', name: 'Dune Energy Trading LLP', gstin: '24AADFD3456P1Z1' },
];

const APPLICATIONS = [
  { code: 'DEMO-EMS', name: 'Expense Management', type: 'EXPENSE_CLAIM', icon: 'receipt', color: '#5B5BF7', kind: 'JOURNAL' },
  { code: 'DEMO-TRV', name: 'Travel Requests', type: 'TRAVEL', icon: 'plane', color: '#8B5CF6', kind: 'PAYMENT' },
  { code: 'DEMO-PAY', name: 'Vendor Payment Requests', type: 'PAYMENT_REQUEST', icon: 'wallet', color: '#FF8A3D', kind: 'PAYMENT' },
  { code: 'DEMO-PRC', name: 'Procurement Claims', type: 'PURCHASE', icon: 'shopping-cart', color: '#10B981', kind: 'PURCHASE' },
];

const CATEGORIES = [
  { category: 'Travel Expense', ledger: 'Travelling Expenses', group: 'Indirect Expenses', min: 800, max: 45000 },
  { category: 'Food Expense', ledger: 'Staff Welfare', group: 'Indirect Expenses', min: 150, max: 6000 },
  { category: 'Accommodation', ledger: 'Hotel Expenses', group: 'Indirect Expenses', min: 2500, max: 38000 },
  { category: 'Fuel Expense', ledger: 'Fuel Expenses', group: 'Indirect Expenses', min: 500, max: 9000 },
  { category: 'Office Supplies', ledger: 'Office Expenses', group: 'Indirect Expenses', min: 200, max: 15000 },
];

const EMPLOYEES = [
  ['E1001', 'Anitha Raman'], ['E1002', 'Karthik Subramanian'], ['E1003', 'Priya Natarajan'], ['E1004', 'Rahul Menon'],
  ['E1005', 'Divya Krishnan'], ['E1006', 'Arjun Iyer'], ['E1007', 'Meera Pillai'], ['E1008', 'Vikram Shetty'],
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickStatus(ageDays, r) {
  if (ageDays > 10) {
    if (r < 0.9) return 'POSTED';
    if (r < 0.95) return 'FAILED';
    return 'CANCELLED';
  }
  const table = [
    ['POSTED', 0.42], ['AWAITING_APPROVAL', 0.14], ['READY_TO_POST', 0.08], ['RECEIVED', 0.06], ['PROCESSING', 0.03],
    ['FAILED', 0.07], ['RETRY_PENDING', 0.04], ['MAPPING_REQUIRED', 0.05], ['MASTER_CREATION_REQUIRED', 0.04],
    ['VALIDATION_FAILED', 0.03], ['RECONCILIATION_REQUIRED', 0.02], ['CANCELLED', 0.02],
  ];
  let acc = 0;
  for (const [status, weight] of table) {
    acc += weight;
    if (r < acc) return status;
  }
  return 'POSTED';
}

async function maxId(qi, table, t) {
  const [rows] = await qi.sequelize.query(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`, { transaction: t });
  return Number(rows[0].m);
}

async function chunkedInsert(qi, table, rows, t) {
  for (let i = 0; i < rows.length; i += 250) {
    await qi.bulkInsert(table, rows.slice(i, i + 250), { transaction: t });
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Demo data must never be seeded into production.');
    }
    const qi = queryInterface;
    const [existing] = await qi.sequelize.query('SELECT COUNT(*) AS c FROM companies WHERE code LIKE ?', { replacements: [`${DEMO_PREFIX}%`] });
    if (Number(existing[0].c) > 0) {
      console.log('Demo data already present; skipping.');
      return;
    }

    const rand = rng(20261031);
    const now = new Date();
    const day = 86400000;

    await qi.sequelize.transaction(async (t) => {
      const [[admin]] = await qi.sequelize.query('SELECT u.id FROM users u ORDER BY u.id LIMIT 1', { transaction: t });
      const adminId = admin ? admin.id : null;
      const [[server]] = await qi.sequelize.query('SELECT id FROM tally_servers ORDER BY id LIMIT 1', { transaction: t });

      let companyId = await maxId(qi, 'companies', t);
      const companies = COMPANIES.map((c) => ({
        id: ++companyId,
        uuid: crypto.randomUUID(),
        name: c.name,
        code: c.code,
        gstin: c.gstin,
        tally_company_name: c.name,
        tally_server_id: server ? server.id : null,
        default_currency: 'INR',
        financial_year_start: '2026-04-01',
        is_active: true,
        created_at: new Date(now - 160 * day),
        updated_at: now,
      }));
      await qi.bulkInsert('companies', companies, { transaction: t });

      let appId = await maxId(qi, 'applications', t);
      const applications = APPLICATIONS.map((a, i) => ({
        id: ++appId,
        uuid: crypto.randomUUID(),
        name: a.name,
        code: a.code,
        description: `Kissflow ${a.name} process (demo)`,
        application_type: a.type,
        icon: a.icon,
        color: a.color,
        kissflow_account: 'demo-workspace',
        kissflow_app_id: `${a.code.replace(DEMO_PREFIX, '')}_A00`,
        integration_mode: 'WEBHOOK',
        auth_method: 'HMAC_SHA256',
        default_voucher_kind: a.kind,
        status: 'ACTIVE',
        created_at: new Date(now - (150 - i * 25) * day),
        updated_at: now,
      }));
      await qi.bulkInsert('applications', applications, { transaction: t });

      const links = [];
      applications.forEach((a, ai) => {
        companies.forEach((c, ci) => {
          if (ai === 0 || (ai + ci) % 2 === 0) {
            links.push({ application_id: a.id, company_id: c.id, source_company_key: c.name.toUpperCase(), is_active: true, created_at: now, updated_at: now });
          }
        });
      });
      await qi.bulkInsert('application_companies', links, { transaction: t });

      let ledgerId = await maxId(qi, 'ledger_masters', t);
      const ledgers = [];
      const ledgerByCompany = new Map();
      for (const c of companies) {
        const map = new Map();
        for (const cat of [...CATEGORIES, { ledger: 'HDFC Bank Current A/c', group: 'Bank Accounts' }, { ledger: 'Employee Reimbursements Payable', group: 'Current Liabilities' }]) {
          // Leave Fuel Expenses unsynced in one company to exercise the missing-master workflow.
          if (c.code === 'DEMO-DUN' && cat.ledger === 'Fuel Expenses') continue;
          const row = { id: ++ledgerId, uuid: crypto.randomUUID(), company_id: c.id, name: cat.ledger, parent_group: cat.group, is_active: true, synced_at: now, created_at: now, updated_at: now };
          ledgers.push(row);
          map.set(cat.ledger, row.id);
        }
        ledgerByCompany.set(c.id, map);
      }
      await qi.bulkInsert('ledger_masters', ledgers, { transaction: t });

      const mappings = [];
      for (const c of companies) {
        for (const cat of CATEGORIES) {
          mappings.push({
            uuid: crypto.randomUUID(),
            company_id: c.id,
            application_id: null,
            source_category: cat.category,
            ledger_master_id: ledgerByCompany.get(c.id).get(cat.ledger) || null,
            tally_ledger_name: cat.ledger,
            is_active: true,
            created_by: adminId,
            created_at: now,
            updated_at: now,
          });
        }
      }
      await qi.bulkInsert('ledger_mappings', mappings, { transaction: t });

      let cfgId = await maxId(qi, 'voucher_configurations', t);
      const configs = [];
      const cfgByCompanyKind = new Map();
      for (const c of companies) {
        for (const [kind, typeName, credit] of [
          ['JOURNAL', 'Journal', 'Employee Reimbursements Payable'],
          ['PAYMENT', 'Payment', 'HDFC Bank Current A/c'],
          ['PURCHASE', 'Purchase', 'Employee Reimbursements Payable'],
        ]) {
          const row = {
            id: ++cfgId,
            uuid: crypto.randomUUID(),
            company_id: c.id,
            voucher_kind: kind,
            tally_voucher_type_name: typeName,
            numbering_mode: 'TALLY_AUTO',
            debit_ledger_rule: JSON.stringify({ source: 'LEDGER_MAPPING' }),
            credit_ledger_rule: JSON.stringify({ source: 'FIXED', ledger: credit }),
            narration_template: '{{application}} {{requestNumber}} - {{employeeName}}: {{description}}',
            reference_template: '{{applicationCode}}/{{sourceTransactionId}}',
            cost_centre_enabled: false,
            bill_allocation_enabled: false,
            approval_policy: 'ALWAYS',
            is_active: true,
            created_at: now,
            updated_at: now,
          };
          configs.push(row);
          cfgByCompanyKind.set(`${c.id}:${kind}`, row);
        }
      }
      await qi.bulkInsert('voucher_configurations', configs, { transaction: t });

      let expenseId = await maxId(qi, 'expense_transactions', t);
      let jobId = await maxId(qi, 'processing_jobs', t);
      let attemptId = await maxId(qi, 'job_attempts', t);
      const expenses = [];
      const items = [];
      const jobs = [];
      const attempts = [];
      const posted = [];
      const audits = [];
      const masterRequests = [];
      const voucherSeq = new Map();

      const TOTAL = 460;
      for (let n = 0; n < TOTAL; n++) {
        const ageDays = Math.floor(Math.pow(rand(), 1.6) * 180);
        const receivedAt = new Date(now - ageDays * day - Math.floor(rand() * day * 0.9));
        const link = links[Math.floor(rand() * links.length)];
        const app = applications.find((a) => a.id === link.application_id);
        const company = companies.find((c) => c.id === link.company_id);
        const cat = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
        const [empCode, empName] = EMPLOYEES[Math.floor(rand() * EMPLOYEES.length)];
        const amount = (cat.min + rand() * (cat.max - cat.min)).toFixed(2);
        let status = pickStatus(ageDays, rand());
        const missingLedger = !ledgerByCompany.get(company.id).has(cat.ledger);
        if (missingLedger && status === 'POSTED') status = 'MASTER_CREATION_REQUIRED';
        const kind = app.default_voucher_kind;
        const cfg = cfgByCompanyKind.get(`${company.id}:${kind}`) || cfgByCompanyKind.get(`${company.id}:JOURNAL`);
        const sourceId = `${app.kissflow_app_id}-${String(100000 + n)}`;
        const requestNumber = `${app.code.replace(DEMO_PREFIX, '')}/FY26/${String(n + 1).padStart(5, '0')}`;
        const expenseDate = new Date(receivedAt - Math.floor(rand() * 5) * day).toISOString().slice(0, 10);
        const payload = {
          _id: sourceId,
          Request_Number: requestNumber,
          Req_Entity: link.source_company_key,
          Employee_ID: empCode,
          Employee_Name: empName,
          Expense_Date: expenseDate,
          Category: cat.category,
          Amount: amount,
          Currency: 'INR',
          _status: 'Approved',
        };
        const id = ++expenseId;
        expenses.push({
          id,
          uuid: crypto.randomUUID(),
          application_id: app.id,
          company_id: company.id,
          source_transaction_id: sourceId,
          kissflow_request_id: sourceId,
          request_number: requestNumber,
          idempotency_key: `${app.code}:${sourceId}`,
          payload_hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
          expense_date: expenseDate,
          employee_code: empCode,
          employee_name: empName,
          expense_category: cat.category,
          description: `${cat.category} claim`,
          amount,
          tax_amount: '0.00',
          currency: 'INR',
          voucher_kind: kind,
          approval_status: 'APPROVED',
          processing_status: status,
          original_payload: JSON.stringify(payload),
          normalized_payload: JSON.stringify({ category: cat.category, amount, employeeName: empName }),
          received_at: receivedAt,
          created_at: receivedAt,
          updated_at: receivedAt,
        });
        items.push({ expense_id: id, line_no: 1, category: cat.category, amount, tax_amount: '0.00', resolved_ledger_name: missingLedger ? null : cat.ledger, created_at: receivedAt, updated_at: receivedAt });

        const jid = ++jobId;
        const settledAt = new Date(Math.min(now.getTime(), receivedAt.getTime() + (1 + rand() * 30) * 3600000));
        const failures = status === 'FAILED' ? 5 : status === 'RETRY_PENDING' ? 1 + Math.floor(rand() * 2) : status === 'POSTED' && rand() < 0.12 ? 1 : 0;
        const totalAttempts = failures + (status === 'POSTED' ? 1 : 0);
        jobs.push({
          id: jid,
          uuid: crypto.randomUUID(),
          expense_id: id,
          company_id: company.id,
          application_id: app.id,
          voucher_configuration_id: cfg.id,
          idempotency_key: `${company.code}:${app.code}:${sourceId}`,
          status,
          priority: Number(amount) > 25000 ? 3 : 5,
          attempts: totalAttempts,
          max_attempts: 5,
          next_retry_at: status === 'RETRY_PENDING' ? new Date(now.getTime() + 15 * 60000) : null,
          last_attempt_at: totalAttempts ? settledAt : null,
          last_error_code: ['FAILED', 'RETRY_PENDING'].includes(status) ? 'TALLY_UNREACHABLE' : status === 'MASTER_CREATION_REQUIRED' ? 'LEDGER_MISSING' : status === 'MAPPING_REQUIRED' ? 'MAPPING_MISSING' : null,
          last_error_message: ['FAILED', 'RETRY_PENDING'].includes(status)
            ? 'Bridge agent could not reach the Tally HTTP endpoint'
            : status === 'MASTER_CREATION_REQUIRED'
              ? `Ledger "${cat.ledger}" does not exist in ${company.name}`
              : null,
          is_dead_letter: status === 'FAILED',
          approved_by: ['POSTED', 'READY_TO_POST', 'PROCESSING', 'FAILED', 'RETRY_PENDING'].includes(status) ? adminId : null,
          approved_at: ['POSTED', 'READY_TO_POST', 'PROCESSING', 'FAILED', 'RETRY_PENDING'].includes(status) ? settledAt : null,
          created_at: receivedAt,
          updated_at: settledAt,
        });

        for (let a = 1; a <= totalAttempts; a++) {
          const success = status === 'POSTED' && a === totalAttempts;
          const at = new Date(settledAt.getTime() - (totalAttempts - a) * 600000);
          attempts.push({
            id: ++attemptId,
            uuid: crypto.randomUUID(),
            job_id: jid,
            attempt_no: a,
            operation: 'POST_VOUCHER',
            from_status: 'READY_TO_POST',
            to_status: success ? 'POSTED' : a === 5 ? 'FAILED' : 'RETRY_PENDING',
            outcome: success ? 'SUCCESS' : 'FAILED',
            error_code: success ? null : 'TALLY_UNREACHABLE',
            error_message: success ? null : 'connect ETIMEDOUT',
            started_at: at,
            finished_at: new Date(at.getTime() + 1500),
            duration_ms: 800 + Math.floor(rand() * 2400),
            created_at: at,
            updated_at: at,
          });
        }

        if (status === 'POSTED') {
          const seq = (voucherSeq.get(`${company.id}:${cfg.voucher_kind}`) || 1000) + 1;
          voucherSeq.set(`${company.id}:${cfg.voucher_kind}`, seq);
          posted.push({
            uuid: crypto.randomUUID(),
            job_id: jid,
            expense_id: id,
            company_id: company.id,
            voucher_kind: cfg.voucher_kind,
            tally_voucher_type_name: cfg.tally_voucher_type_name,
            voucher_number: String(seq),
            voucher_date: expenseDate,
            reference: `${app.code}/${sourceId}`,
            tally_master_id: 50000 + jid,
            tally_alter_id: 90000 + jid,
            total_amount: amount,
            currency: 'INR',
            verification_status: 'VERIFIED',
            verified_at: settledAt,
            created_at: settledAt,
            updated_at: settledAt,
          });
        }

        if (status === 'MASTER_CREATION_REQUIRED' && !masterRequests.some((m) => m.company_id === company.id && m.proposed_name === cat.ledger)) {
          masterRequests.push({
            uuid: crypto.randomUUID(),
            company_id: company.id,
            job_id: jid,
            master_type: 'LEDGER',
            source_value: cat.category,
            proposed_name: cat.ledger,
            proposed_parent: cat.group,
            status: 'PENDING_REVIEW',
            created_at: settledAt,
            updated_at: settledAt,
          });
        }

        audits.push({
          uuid: crypto.randomUUID(),
          actor_type: 'WEBHOOK',
          action: 'EXPENSE_RECEIVED',
          entity_type: 'expense',
          company_id: company.id,
          application_id: app.id,
          expense_id: id,
          job_id: jid,
          new_status: 'RECEIVED',
          request_ref: requestNumber,
          created_at: receivedAt,
        });
        if (status !== 'RECEIVED') {
          audits.push({
            uuid: crypto.randomUUID(),
            actor_type: status === 'POSTED' || status === 'FAILED' ? 'AGENT' : 'SYSTEM',
            action: status === 'POSTED' ? 'POSTING_SUCCESSFUL' : status === 'FAILED' ? 'POSTING_FAILED' : 'JOB_STATUS_CHANGED',
            entity_type: 'job',
            company_id: company.id,
            application_id: app.id,
            expense_id: id,
            job_id: jid,
            previous_status: 'RECEIVED',
            new_status: status,
            request_ref: requestNumber,
            created_at: settledAt,
          });
        }
      }

      await chunkedInsert(qi, 'expense_transactions', expenses, t);
      await chunkedInsert(qi, 'expense_items', items, t);
      await chunkedInsert(qi, 'processing_jobs', jobs, t);
      if (attempts.length) await chunkedInsert(qi, 'job_attempts', attempts, t);
      if (posted.length) await chunkedInsert(qi, 'posted_vouchers', posted, t);
      if (masterRequests.length) await chunkedInsert(qi, 'master_creation_requests', masterRequests, t);
      await chunkedInsert(qi, 'audit_logs', audits, t);

      for (const a of applications) {
        await qi.sequelize.query(
          'UPDATE applications SET last_request_at = (SELECT MAX(received_at) FROM expense_transactions WHERE application_id = ?), last_success_at = (SELECT MAX(pv.verified_at) FROM posted_vouchers pv JOIN processing_jobs j ON j.id = pv.job_id WHERE j.application_id = ?) WHERE id = ?',
          { replacements: [a.id, a.id, a.id], transaction: t },
        );
      }
    });
  },

  async down() {
    throw new Error('Demo data cannot be removed automatically because audit_logs is append-only. Recreate the development database instead.');
  },
};
