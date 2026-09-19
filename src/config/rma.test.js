import { describe, it, expect } from 'vitest';
import {
  RMA_FORM_FIELDS, blankRmaCase, rmaFieldToCell, rmaFieldFromRow, parseRmaDate, rmaDisplayDate,
  rmaDisplayDateTime, rmaStatusStack, isRmaOpen, rmaStatus, rmaCustomerTypeLabel
} from './rma';

describe('RMA form fields round-trip through Excel', () => {
  it('an export cell can be read back into the same field value (text, enum, date, serials)', () => {
    const rmaCase = {
      ...blankRmaCase(),
      rmaNo: 'RMA-2026-09-001',
      status: 'with_technician',
      customerType: 'amazon',
      serials: ['ABC123', 'DEF456'],
      saleDate: parseRmaDate('05-09-2026'),
      repairMethod: 'service_center',
      resolutionType: 'replacement',
      replacementDate: parseRmaDate('10-09-2026'),
      conditionTags: ['open_screws', 'only_laptop_received'],
      warrantyStatus: 'cegtllc',
      warrantyFrom: 'local_market',
      warrantyFromSupplier: 'Al Ain Traders'
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
    expect(rmaFieldFromRow(statusField, 'With Service Centre')).toBe('with_service_centre');
  });

  it('the condition checklist exports as labels and reads back as keys; unknown wording is kept as typed', () => {
    const tagsField = RMA_FORM_FIELDS.find((f) => f.key === 'conditionTags');
    expect(rmaFieldToCell(tagsField, { conditionTags: ['open_screws', 'body_damage'] })).toBe('Open Screws, Body Damage / Dent');
    expect(rmaFieldFromRow(tagsField, 'open screws, Charger cable frayed, Open Screws'))
      .toEqual(['open_screws', 'Charger cable frayed']);
    expect(rmaFieldFromRow(tagsField, '')).toEqual([]);
  });

  it('a blank cell yields an empty value, and an empty serial cell yields an empty list', () => {
    const nameField = RMA_FORM_FIELDS.find((f) => f.key === 'customerName');
    const serialField = RMA_FORM_FIELDS.find((f) => f.key === 'serials');
    expect(rmaFieldFromRow(nameField, '')).toBe('');
    expect(rmaFieldFromRow(serialField, '')).toEqual([]);
  });

  // The sheet's own status wording must survive import untouched — not slugified, not rejected,
  // not silently swapped for a default. Guessing at intent here is exactly what corrupted 24 valid
  // serials in an earlier import (see importUtils' scientific-notation regex incident).
  it('a status the sheet already used, that is not one of ours, is kept EXACTLY as typed', () => {
    const statusField = RMA_FORM_FIELDS.find((f) => f.key === 'status');
    expect(rmaFieldFromRow(statusField, 'Awaiting Customer Pickup')).toBe('Awaiting Customer Pickup');
  });

  // A CASE-INSENSITIVE match to one of our own labels still resolves to the canonical key — that
  // is a genuine match, not a guess, and is what keeps the dropdown and colour-coding working.
  it('still resolves to our own key when the wording matches a known label, case-insensitively', () => {
    const statusField = RMA_FORM_FIELDS.find((f) => f.key === 'status');
    expect(rmaFieldFromRow(statusField, 'CASE CLOSED')).toBe('closed');
  });

  it('re-exporting a case with a free-text status writes that exact text back out', () => {
    const statusField = RMA_FORM_FIELDS.find((f) => f.key === 'status');
    const rmaCase = { status: 'Awaiting Customer Pickup' };
    expect(rmaFieldToCell(statusField, rmaCase)).toBe('Awaiting Customer Pickup');
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

describe('rmaDisplayDateTime', () => {
  it('adds hours and minutes to the plain date', () => {
    expect(rmaDisplayDateTime('2026-09-05T14:32:00.000Z')).toMatch(/^05-09-2026 \d{2}:\d{2}$/);
  });
  it('is blank for no date', () => {
    expect(rmaDisplayDateTime('')).toBe('');
  });
});

// Reproduces the client's own reference sheet — a case's whole history stacked into one cell,
// current status first — the ask being to keep that exact shape on export, with a time added since
// the app (unlike the old sheet) tracks the precise moment of each update.
describe('rmaStatusStack — the RMA STATUS column, as the reference sheet packed it', () => {
  it('stacks the current status above every dated log entry, oldest first, each with a time', () => {
    const rmaCase = {
      status: 'closed',
      timeline: [
        { id: '2', date: '2026-08-03T09:00:00.000Z', text: 'RCVD CN FROM SUPPLIER', internal: false },
        { id: '1', date: '2026-07-15T11:30:00.000Z', text: 'LAPTOP RCVD FROM TECHCHIP SHOP', internal: false }
      ]
    };
    const cell = rmaStatusStack(rmaCase);
    const lines = cell.split('\n');
    expect(lines[0]).toBe('Case Closed');
    expect(lines[1]).toBe('');
    expect(lines[2]).toMatch(/^15-07-2026 \d{2}:\d{2} - LAPTOP RCVD FROM TECHCHIP SHOP$/);
    expect(lines[3]).toMatch(/^03-08-2026 \d{2}:\d{2} - RCVD CN FROM SUPPLIER$/);
  });

  it('still shows just the current status when nothing has been logged yet', () => {
    expect(rmaStatusStack({ status: 'received', timeline: [] })).toBe('RMA Received & Under Review\n');
  });
});

describe('isRmaOpen — the tracker default filter', () => {
  it('only the four end-states close a case: closed, sent to customer, replacement given, credit note issued', () => {
    expect(isRmaOpen({ status: 'closed' })).toBe(false);
    expect(isRmaOpen({ status: 'delivered' })).toBe(false);
    expect(isRmaOpen({ status: 'replacement_given' })).toBe(false);
    expect(isRmaOpen({ status: 'credit_note' })).toBe(false);
    expect(isRmaOpen({ status: 'with_technician' })).toBe(true);
    expect(rmaStatus('unknown_key').label).toBe('unknown_key'); // never throws on a bad status
  });

  // A rejection is a decision, not an ending — the unit is still on the shelf waiting to go back.
  it('a rejected or out-of-warranty case stays open until someone actually closes it', () => {
    for (const status of ['warranty_rejected', 'not_repairable', 'out_of_warranty', 'no_supplier_warranty', 'not_our_stock', 'reopened']) {
      expect(isRmaOpen({ status })).toBe(true);
    }
  });

  // The three cases already live in production hold these keys; renaming any of them would orphan
  // real data behind a raw key instead of a label.
  it('keeps every key live cases already use', () => {
    expect(rmaStatus('received').label).toBe('RMA Received & Under Review');
    expect(rmaStatus('on_hold').label).toBe('On Hold');
    expect(rmaCustomerTypeLabel('export')).toBe('Export Customer');
  });
});
