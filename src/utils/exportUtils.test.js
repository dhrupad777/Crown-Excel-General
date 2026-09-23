import { describe, it, expect } from 'vitest';
import { buildRmaExportSheets } from './exportUtils';

// Sheet 2 unrolls the case log, one row per entry. It used to carry a Visibility column from the
// days when an entry could be marked customer-facing; every entry is internal now, and the column
// that earns its place instead is what the status actually did.
describe('RMA Case Log sheet', () => {
  const cases = [{
    rmaNo: 'RMA-2026-09-001',
    timeline: [
      { id: 'e2', date: '2026-09-04T09:00:00.000Z', text: 'Repair approved', statusFrom: 'received', statusTo: 'repair_in_progress', byName: 'Nitesh' },
      { id: 'e1', date: '2026-09-02T08:00:00.000Z', text: 'Unit received from customer', statusFrom: '', statusTo: '', by: 'staff@b.com' }
    ]
  }];

  it('has no Visibility column, and one width per header', () => {
    const { log } = buildRmaExportSheets(cases);
    expect(log.headers).toEqual(['RMA-NO', 'Date & Time', 'Entry', 'Status Change', 'Logged By']);
    // excelWriter maps widths positionally — a mismatch silently misaligns the whole sheet.
    expect(log.colWidths).toHaveLength(log.headers.length);
  });

  it('spells out a status move, and leaves the column blank for a plain note', () => {
    const { log } = buildRmaExportSheets(cases);
    // Oldest first, as the sheet reads.
    expect(log.rows[0][2]).toBe('Unit received from customer');
    expect(log.rows[0][3]).toBe('');
    expect(log.rows[0][4]).toBe('staff@b.com'); // falls back to the email when there is no name
    expect(log.rows[1][3]).toBe('RMA Received & Under Review → Repair Approved / In Progress');
    expect(log.rows[1][4]).toBe('Nitesh');
  });

  it('keeps the register sheet on the client’s own column list', () => {
    const { register } = buildRmaExportSheets(cases);
    expect(register.headers[0]).toBe('RMA NO');
    expect(register.headers).toContain('WARRANTY FROM');
    expect(register.rows).toHaveLength(1);
  });
});
