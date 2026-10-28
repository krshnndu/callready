// One set of units for every screen, so the same quantity never appears two ways:
//   - a margin LEVEL is a percent with one decimal:          11.6%
//   - a margin CHANGE is basis points, signed, whole:        −258 bps   (never "−2.6%" or "2.6 points")
//   - a growth or variance is a signed percent, one decimal: +14.0%
//   - money is INR crore with Indian grouping:               2,480 crore
// Negatives always use the true minus sign (U+2212), never a hyphen, and a value that rounds to zero
// never shows as "−0". scripts/check_content.mjs fails any screen that breaks these rules.
export const MINUS = '−';
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const round = (x, d) => { const n = Math.round(x * 10 ** d) / 10 ** d; return n === 0 ? 0 : n; };
export const minus = (s) => String(s).replace(/^-/, MINUS);

// A plain number with Indian grouping and up to `d` decimals: 2,480 or −1,234.5
export const amount = (x, d = 2) => (num(x) ? minus(round(x, d).toLocaleString('en-IN', { maximumFractionDigits: d })) : '-');
// A number with exactly one decimal: 11.6 or −8.5
export const one = (x) => (num(x) ? minus(round(x, 1).toFixed(1)) : '-');
// A signed number with `d` decimals: +14.0 or −3.2 (0 has no sign)
export const signed = (x, d = 1) => { if (!num(x)) return '-'; const n = round(x, d); return (n > 0 ? '+' : n < 0 ? MINUS : '') + Math.abs(n).toFixed(d); };
// Margin level: 11.6%
export const marginLevel = (x) => (num(x) ? `${one(x)}%` : '-');
// Margin change in basis points: −258 bps, +40 bps
export const marginChange = (bpsValue) => { if (!num(bpsValue)) return '-'; const n = round(bpsValue, 0); return `${n > 0 ? '+' : n < 0 ? MINUS : ''}${Math.abs(n).toLocaleString('en-IN')} bps`; };
// Growth or variance: +14.0%, −3.2%
export const growth = (x, d = 1) => (num(x) ? `${signed(x, d)}%` : '-');

// Typesetting for text from any source (rules, packs, company quotes, AI): a hyphen directly before a
// digit, at the start or after a space or opening punctuation, is a minus sign. Ranges such as
// "13.5-14.5" and ids such as "Q4FY26-L024" are untouched, because a digit or letter precedes them.
const HYPHEN_MINUS = /(^|[\s(\[{"'\u201c\u2018:;,=/])-(?=\d)/g;
export const typesetText = (s) => String(s).replace(HYPHEN_MINUS, `$1${MINUS}`);
