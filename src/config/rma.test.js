import { describe, it, expect } from 'vitest';
import {
  RMA_FORM_FIELDS, blankRmaCase, rmaFieldToCell, rmaFieldFromRow, parseRmaDate, rmaDisplayDate,
  isRmaOpen, rmaStatus
} from './rma';

describe('RMA form fields round-trip through Excel', () => {
  it('an export cell can be read back into the same field value (text, enum, date, serials)', () => {
    const rmaCase = {
      ...blankRmaCase(),
      rmaNo: 'RMA-2026-09-001',
      status: 'with_technician',
      customerType: 'marketplace',
      serials: ['ABC123', 'DEF456'],
      saleDate: parseRmaDate('05-09-2026')
    };
    for (const field of RMA_FORM_FIELDS) {
      if (field.kind === 'photo') continue; // a URL isn't meant to round-trip back into a value
      const cell = rmaFieldToCell(field, rmaCase);
      const parsedBack = rmaFieldFromRow(field, cell);
      expect(parsedBack).toEqual(rmaCase[field.key]);
    }
  });

  it('an enum cell accepts the label text our own export writes, not just the raw key', () => {
    const statusField = RMA_FORM_FIELDS.find((f) => f.key === 'status');
    expect(rmaFieldFromRow(statusField, 'With supplier')).toBe('with_supplier');
  });

  it('a blank cell yields an empty value, and an empty serial cell yields an empty list', () => {
    const nameField = RMA_FORM_FIELDS.find((f) => f.key === 'customerName');
    const serialField = RMA_FORM_FIELDS.find((f) => f.key === 'serials');
    expect(rmaFieldFromRow(nameField, '')).toBe('');
    expect(rmaFieldFromRow(serialField, '')).toEqual([]);
  });
});

describe('parseRmaDate — day-first, matching how this business writes dates', () => {
  it('reads DD-MM-YYYY and DD/MM/YYYY the same way', () => {
    const a = parseRmaDate('05-09-2026');
    const b = parseRmaDate('05/09/2026');
    expect(rmaDisplayDate(a)).toBe('05-09-2026');
    expect(rmaDisplayDate(b)).toBe('05-09-2026');
  });

  it('does not slide to the previous day for a timezone behind Greenwich', () => {
    // A bare "YYYY-MM-DDT00:00:00Z" Date is exactly the failure mode this guards against.
    const iso = parseRmaDate(new Date('2026-09-05T00:00:00.000Z'));
    expect(rmaDisplayDate(iso)).toBe('05-09-2026');
  });
});

describe('isRmaOpen — the tracker default filter', () => {
  it('closed/delivered/credit-noted/rejected cases are not open; everything else is', () => {
    expect(isRmaOpen({ status: 'closed' })).toBe(false);
    expect(isRmaOpen({ status: 'delivered' })).toBe(false);
    expect(isRmaOpen({ status: 'with_technician' })).toBe(true);
    expect(rmaStatus('unknown_key').label).toBe('unknown_key'); // never throws on a bad status
  });
});
