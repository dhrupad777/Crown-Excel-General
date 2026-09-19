import { describe, it, expect } from 'vitest';
import { matchesProductQuery } from './productSearch';

const iphone = { name: 'iPhone 15 Pro', barcode: 'MTV13HN/A', sku: 'APL-IP15P', category: 'Mobile Phones' };

describe('matchesProductQuery', () => {
  it('ignores letter case in every field', () => {
    expect(matchesProductQuery(iphone, 'IPHONE')).toBe(true);
    expect(matchesProductQuery(iphone, 'iphone')).toBe(true);
    expect(matchesProductQuery(iphone, 'mtv13hn')).toBe(true);
    expect(matchesProductQuery(iphone, 'apl-ip15p')).toBe(true);
    expect(matchesProductQuery(iphone, 'MOBILE')).toBe(true);
  });

  it('matches every word in any order and ignores extra spaces', () => {
    expect(matchesProductQuery(iphone, '  pro   iphone ')).toBe(true);
    expect(matchesProductQuery(iphone, 'iphone mobile')).toBe(true);
    expect(matchesProductQuery(iphone, 'iphone 14')).toBe(false);
  });

  it('matches everything on a blank query and tolerates missing fields', () => {
    expect(matchesProductQuery(iphone, '   ')).toBe(true);
    expect(matchesProductQuery({ name: 'Cable' }, 'cable')).toBe(true);
    expect(matchesProductQuery({}, 'cable')).toBe(false);
  });
});
