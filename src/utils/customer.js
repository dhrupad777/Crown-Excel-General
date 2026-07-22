// Customer display helpers.
//
// The shop bills businesses, so Company is the primary identifier and the only required field
// on the customer forms (the contact person's name is optional). Many customers therefore have
// a company but no person name — so everywhere the app used to show `customer.name` it must now
// lead with the company and fall back to the person name only when there's no company.

// The label to show as the primary customer identity (invoice "Billed To", lists, cards).
export const customerPrimaryName = (c) =>
  (c?.company || c?.name || 'Unnamed').trim();

// The secondary contact line, shown beneath the primary label. Only the person's name, and only
// when a company is present (otherwise the name is already the primary label and would repeat).
export const customerSecondaryName = (c) =>
  (c?.company && c?.name ? c.name.trim() : '');
