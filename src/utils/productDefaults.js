// Guesses a product's category from its name, so a warehouse operator registering a new
// barcode doesn't have to remember to fix a category dropdown that silently defaults to the
// wrong device type (e.g. an iPad left as "Mobile Phones"). Order matters: more specific
// keywords (e.g. "galaxy tab") must be checked before broader ones that could also match
// (e.g. "galaxy s").
const CATEGORY_RULES = [
  { category: 'Tablets', keywords: ['ipad', 'galaxy tab', 'surface pro', 'surface go', 'tablet'] },
  { category: 'Laptops', keywords: ['macbook', 'laptop', 'notebook', 'chromebook', 'xps', 'thinkpad', 'zenbook', 'surface laptop'] },
  { category: 'Mobile Phones', keywords: ['iphone', 'galaxy s', 'galaxy z', 'galaxy note', 'galaxy a', 'pixel', 'oneplus', 'smartphone', 'mobile phone'] },
  { category: 'Gaming', keywords: ['playstation', 'xbox', 'nintendo', 'switch', 'console', 'ps5', 'ps4'] },
  { category: 'Audio & Wearables', keywords: ['airpods', 'earbud', 'earphone', 'headphone', 'headset', 'watch', 'smartband', 'buds'] },
  { category: 'Peripherals', keywords: ['keyboard', 'mouse', 'monitor', 'webcam', 'dock', 'hub'] },
  { category: 'Accessories', keywords: ['charger', 'cable', 'case', 'cover', 'adapter', 'protector', 'stand', 'power bank'] },
];

export function guessProductDefaults(name) {
  if (!name || !name.trim()) return null;
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { category: rule.category };
    }
  }
  return null;
}
