// Product search matching, shared by every product picker (Billing Desk, Serial Capture, the
// Products catalog) so they can't drift apart again — they previously each had their own filter,
// and two of them matched barcodes case-sensitively.
//
// Case-insensitive, ignores extra/leading/trailing spaces, and matches every typed word anywhere
// across name / barcode / SKU / category in any order — so "IPHONE 15", "15 pro iphone" and a
// lowercased model code all find what the operator means.

const normalize = (s) => String(s ?? '').toLowerCase();

export function matchesProductQuery(product, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  // Fields are space-joined; terms never contain spaces, so a term can't match across two fields.
  const haystack = normalize([product?.name, product?.barcode, product?.sku, product?.category].join(' '));
  return terms.every((t) => haystack.includes(t));
}
