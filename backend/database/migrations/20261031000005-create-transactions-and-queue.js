'use strict';

const { TABLE_OPTIONS, JOB_STATUSES, VOUCHER_KINDS, bigId, uuid, ref, money, timestamps } = require('../lib/schema');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'expense_transactions',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        application_id: ref(Sequelize, 'applications'),
        company_id: ref(Sequelize, 'companies'),
        source_transaction_id: { type: Sequelize.STRING(150), allowNull: false },
        kissflow_request_id: { type: Sequelize.STRING(150), allowNull: true },
        request_number: { type: Sequelize.STRING(100), allowNull: true },
        idempotency_key: { type: Sequelize.STRING(200), allowNull: false, unique: true },
        payload_hash: { type: Sequelize.CHAR(64), allowNull: false },
        expense_date: { type: Sequelize.DATEONLY, allowNull: false },
        employee_code: { type: Sequelize.STRING(64), allowNull: true },
        employee_name: { type: Sequelize.STRING(150), allowNull: true },
        vendor_name: { type: Sequelize.STRING(200), allowNull: true },
        expense_category: { type: Sequelize.STRING(150), allowNull: true },
        description: { type: Sequelize.STRING(1000), allowNull: true },
        amount: money(Sequelize),
        tax_amount: money(Sequelize),
        currency: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'INR' },
        cost_centre: { type: Sequelize.STRING(255), allowNull: true },
        voucher_kind: { type: Sequelize.ENUM(...VOUCHER_KINDS), allowNull: true },
        approval_status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'APPROVED' },
        processing_status: { type: Sequelize.ENUM(...JOB_STATUSES), allowNull: false, defaultValue: 'RECEIVED' },
        supporting_documents: { type: Sequelize.JSON, allowNull: true },
        original_payload: { type: Sequelize.JSON, allowNull: false },
        normalized_payload: { type: Sequelize.JSON, allowNull: true },
        validation_results: { type: Sequelize.JSON, allowNull: true },
        received_at: { type: Sequelize.DATE(3), allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)') },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('expense_transactions', ['application_id', 'source_transaction_id'], { unique: true, name: 'uq_expense_source' });
    await queryInterface.addIndex('expense_transactions', ['company_id', 'expense_date']);
    await queryInterface.addIndex('expense_transactions', ['company_id', 'processing_status']);
    await queryInterface.addIndex('expense_transactions', ['received_at']);

    await queryInterface.createTable(
      'expense_items',
      {
        id: bigId(Sequelize),
        expense_id: ref(Sequelize, 'expense_transactions', { big: true, onDelete: 'CASCADE' }),
        line_no: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false },
        category: { type: Sequelize.STRING(150), allowNull: false },
        description: { type: Sequelize.STRING(1000), allowNull: true },
        amount: money(Sequelize),
        tax_amount: money(Sequelize),
        cost_centre: { type: Sequelize.STRING(255), allowNull: true },
        resolved_ledger_name: { type: Sequelize.STRING(255), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('expense_items', ['expense_id', 'line_no'], { unique: true });

    await queryInterface.createTable(
      'processing_jobs',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        expense_id: ref(Sequelize, 'expense_transactions', { big: true }),
        company_id: ref(Sequelize, 'companies'),
        application_id: ref(Sequelize, 'applications'),
        voucher_configuration_id: ref(Sequelize, 'voucher_configurations', { nullable: true }),
        idempotency_key: { type: Sequelize.STRING(200), allowNull: false, unique: true },
        status: { type: Sequelize.ENUM(...JOB_STATUSES), allowNull: false, defaultValue: 'RECEIVED' },
        priority: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 5 },
        is_paused: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        attempts: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        max_attempts: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 5 },
        next_retry_at: { type: Sequelize.DATE(3), allowNull: true },
        last_attempt_at: { type: Sequelize.DATE(3), allowNull: true },
        locked_by_agent_id: ref(Sequelize, 'integration_agents', { nullable: true, onDelete: 'SET NULL' }),
        locked_at: { type: Sequelize.DATE(3), allowNull: true },
        lock_expires_at: { type: Sequelize.DATE(3), allowNull: true },
        heartbeat_at: { type: Sequelize.DATE(3), allowNull: true },
        submission_started_at: { type: Sequelize.DATE(3), allowNull: true },
        last_error_code: { type: Sequelize.STRING(64), allowNull: true },
        last_error_message: { type: Sequelize.STRING(2000), allowNull: true },
        voucher_payload: { type: Sequelize.JSON, allowNull: true },
        is_dead_letter: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        approved_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        approved_at: { type: Sequelize.DATE(3), allowNull: true },
        rejected_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        rejected_at: { type: Sequelize.DATE(3), allowNull: true },
        rejection_reason: { type: Sequelize.STRING(1000), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('processing_jobs', ['status', 'is_paused', 'next_retry_at', 'priority'], { name: 'ix_jobs_claim' });
    await queryInterface.addIndex('processing_jobs', ['company_id', 'status']);
    await queryInterface.addIndex('processing_jobs', ['expense_id']);
    await queryInterface.addIndex('processing_jobs', ['updated_at']);

    await queryInterface.createTable(
      'job_attempts',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        job_id: ref(Sequelize, 'processing_jobs', { big: true }),
        attempt_no: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false },
        agent_id: ref(Sequelize, 'integration_agents', { nullable: true, onDelete: 'SET NULL' }),
        triggered_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        operation: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'POST_VOUCHER' },
        from_status: { type: Sequelize.ENUM(...JOB_STATUSES), allowNull: true },
        to_status: { type: Sequelize.ENUM(...JOB_STATUSES), allowNull: true },
        outcome: { type: Sequelize.ENUM('IN_PROGRESS', 'SUCCESS', 'FAILED', 'AMBIGUOUS', 'TIMEOUT'), allowNull: false, defaultValue: 'IN_PROGRESS' },
        error_code: { type: Sequelize.STRING(64), allowNull: true },
        error_message: { type: Sequelize.STRING(2000), allowNull: true },
        started_at: { type: Sequelize.DATE(3), allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)') },
        finished_at: { type: Sequelize.DATE(3), allowNull: true },
        duration_ms: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('job_attempts', ['job_id', 'attempt_no'], { unique: true });
    await queryInterface.addIndex('job_attempts', ['outcome', 'finished_at']);

    await queryInterface.createTable(
      'tally_responses',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        job_id: ref(Sequelize, 'processing_jobs', { big: true, nullable: true }),
        attempt_id: ref(Sequelize, 'job_attempts', { big: true, nullable: true }),
        company_id: ref(Sequelize, 'companies', { nullable: true }),
        agent_id: ref(Sequelize, 'integration_agents', { nullable: true, onDelete: 'SET NULL' }),
        operation: {
          type: Sequelize.ENUM('HEALTH_CHECK', 'LIST_COMPANIES', 'LIST_LEDGERS', 'CREATE_LEDGER', 'CREATE_VOUCHER', 'READ_VOUCHER', 'READ_LEDGER'),
          allowNull: false,
        },
        request_hash: { type: Sequelize.CHAR(64), allowNull: true },
        request_storage_ref: { type: Sequelize.STRING(500), allowNull: true },
        http_status: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: true },
        created_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        altered_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        error_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        line_error: { type: Sequelize.STRING(2000), allowNull: true },
        response_body: { type: Sequelize.TEXT('medium'), allowNull: true },
        ...timestamps(Sequelize, { updated: false }),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('tally_responses', ['job_id', 'created_at']);

    await queryInterface.createTable(
      'master_creation_requests',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        company_id: ref(Sequelize, 'companies'),
        job_id: ref(Sequelize, 'processing_jobs', { big: true, nullable: true }),
        master_type: {
          type: Sequelize.ENUM('LEDGER', 'GROUP', 'COST_CENTRE', 'COST_CATEGORY', 'STOCK_ITEM', 'PARTY_LEDGER', 'BANK_LEDGER'),
          allowNull: false,
        },
        source_value: { type: Sequelize.STRING(255), allowNull: true },
        proposed_name: { type: Sequelize.STRING(255), allowNull: false },
        proposed_parent: { type: Sequelize.STRING(255), allowNull: true },
        details: { type: Sequelize.JSON, allowNull: true },
        status: {
          type: Sequelize.ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CREATING', 'CREATED', 'VERIFIED', 'FAILED'),
          allowNull: false,
          defaultValue: 'PENDING_REVIEW',
        },
        requested_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        reviewed_by: ref(Sequelize, 'users', { big: true, nullable: true, onDelete: 'SET NULL' }),
        reviewed_at: { type: Sequelize.DATE(3), allowNull: true },
        review_notes: { type: Sequelize.STRING(1000), allowNull: true },
        tally_response_id: ref(Sequelize, 'tally_responses', { big: true, nullable: true, onDelete: 'SET NULL' }),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('master_creation_requests', ['company_id', 'status']);

    await queryInterface.createTable(
      'posted_vouchers',
      {
        id: bigId(Sequelize),
        uuid: uuid(Sequelize),
        job_id: { ...ref(Sequelize, 'processing_jobs', { big: true }), unique: true },
        expense_id: ref(Sequelize, 'expense_transactions', { big: true }),
        company_id: ref(Sequelize, 'companies'),
        voucher_kind: { type: Sequelize.ENUM(...VOUCHER_KINDS), allowNull: false },
        tally_voucher_type_name: { type: Sequelize.STRING(150), allowNull: false },
        voucher_number: { type: Sequelize.STRING(100), allowNull: true },
        voucher_date: { type: Sequelize.DATEONLY, allowNull: false },
        reference: { type: Sequelize.STRING(200), allowNull: false },
        tally_master_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        tally_alter_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        tally_guid: { type: Sequelize.STRING(100), allowNull: true },
        total_amount: money(Sequelize),
        currency: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'INR' },
        verification_status: { type: Sequelize.ENUM('PENDING', 'VERIFIED', 'MISMATCH'), allowNull: false, defaultValue: 'PENDING' },
        verified_at: { type: Sequelize.DATE(3), allowNull: true },
        readback: { type: Sequelize.JSON, allowNull: true },
        tally_response_id: ref(Sequelize, 'tally_responses', { big: true, nullable: true, onDelete: 'SET NULL' }),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('posted_vouchers', ['company_id', 'reference'], { unique: true });
    await queryInterface.addIndex('posted_vouchers', ['company_id', 'voucher_date']);
    await queryInterface.addIndex('posted_vouchers', ['verified_at']);
  },

  async down(queryInterface) {
    for (const table of ['posted_vouchers', 'master_creation_requests', 'tally_responses', 'job_attempts', 'processing_jobs', 'expense_items', 'expense_transactions']) {
      await queryInterface.dropTable(table);
    }
  },
};
