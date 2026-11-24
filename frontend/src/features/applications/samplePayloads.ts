/** Example of the canonical payload produced by the Kissflow Run Script (docs/KISSFLOW-SETUP.md). */
export const SAMPLE_CANONICAL_PAYLOAD = {
  schema: 'tally-monitor.expense.v1',
  source_transaction_id: 'SampleInstance001',
  request_number: 'Prefix-001',
  company_key: 'VENWIND REFEX POWER LIMITED',
  expense_date: '2026-10-31',
  employee: { code: 'UsCy9_Q7B_w9', name: 'Murugesh Kumar', email: 'murugesh@example.com' },
  category: 'Local Conveyance',
  description: 'Site visit',
  amount: 776,
  tax_amount: 0,
  currency: 'INR',
  cost_centre: 'Operations',
  approval_status: 'Completed',
  approved_at: '2026-10-31T07:55:24-08:00 America/Los_Angeles',
  documents: [{ name: 'Sample_Image.jpg', key: 'Sample_Process/Instance001/Step001/Attachment001/Sample_Image.jpg', fileExtension: 'jpg' }],
  lines: [
    { category: 'Food Claim', description: 'Lunch', amount: 500, tax_amount: 0, date: '2026-10-31' },
    { category: 'Local Conveyance', description: 'Auto', amount: 276, tax_amount: 0, date: '2026-10-31' },
  ],
};
