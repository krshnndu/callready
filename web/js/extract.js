// Rule-based extraction: results-document text -> callready.pack.v1, with no AI.
// Every value is read from a labelled table row or copied as a whole sentence, so every value is in
// the document by construction. Used three ways: a rules-only conversion (no AI call at all), a
// cross-check of AI figures on the Review screen, and a fallback when the AI service is unavailable.
import { SCHEMA } from './core.js';

const PERIOD = /\b(Q[1-4]|H[12]|[69]M)\s?FY\s?'?(\d{2,4})\b/gi;
// Row labels, normalised (lower case, punctuation dropped). Exact match after normalising, longest first.
const ROWS = {
  revenue: ['revenue from operations', 'net revenue nr', 'net revenue', 'total revenue from operations', 'revenue from operations net', 'income from operations', 'total income from operations', 'net sales', 'revenue', 'sales'],
  ebitda: ['ebitda', 'reported ebitda', 'operating ebitda'],
  ebit: ['ebit', 'operating profit', 'operating income'],
  pat: ['profit after tax', 'pat', 'net profit', 'profit for the period', 'net profit after tax', 'net income', 'profit after tax pat'],
  ocf: ['cash flow from operations', 'net cash from operating activities', 'operating net cash flow a', 'operating net cash flow', 'cash from operations', 'net cash generated from operating activities'],
  capex: ['capital expenditure', 'capex'],
  netDebt: ['net debt period end', 'net debt'],
  da: ['depreciation and amortisation', 'depreciation and amortization', 'depreciation amortization', 'depreciation amortisation', 'depreciation'],
  invDays: ['inventory days'],
  recDays: ['receivable days', 'debtor days', 'receivables days'],
  payDays: ['payable days', 'creditor days', 'payables days'],
};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ROW_INDEX = Object.entries(ROWS).flatMap(([f, ls]) => ls.map((l) => [norm(l), f])).sort((a, b) => b[0].length - a[0].length);

const fy = (y) => { const n = Number(y); return n < 100 ? 2000 + n : n; };
const parsePeriod = (m) => ({ kind: m[1].toUpperCase(), fy: fy(m[2]), label: `${m[1].toUpperCase()} FY${String(fy(m[2])).slice(2)}` });

// A numeric token: 2,480 / 11.6 / (160) / -8.5 / 1,195. Percent, bps and NA are change columns, not periods.
function rowValues(rest) {
  const toks = rest.trim().split(/\s+/);
  const vals = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/%$/.test(t) || /^bps$/i.test(toks[i + 1] || '') && /^\(?-?[\d,.]+\)?$/.test(t)) { if (/^bps$/i.test(toks[i + 1] || '')) i++; continue; }
    if (/^bps$/i.test(t) || /^(na|nm|n\.a\.)$/i.test(t)) continue;
    if (t === '-' || t === '–' || t === '—') { vals.push(null); continue; }
    const m = /^(\()?(-)?([\d,]+(?:\.\d+)?)(\))?$/.exec(t);
    if (!m) return null; // text after numbers: not a clean table row
    const v = Number(m[3].replace(/,/g, ''));
    vals.push(m[1] && m[4] ? -v : m[2] ? -v : v);
  }
  return vals;
}

function units(text) {
  const t = text.slice(0, 20000);
  if (/\b(rs\.?|inr|₹)\s*(in\s*)?(crores?|crs?\.?)\b|\bin\s+(rs\.?\s*)?crores?\b|\(in rs crores?\)|rs\.?\s*cr\b/i.test(t)) return 'INR crore';
  if (/\b(rs\.?|inr|₹)\s*(in\s*)?millions?\b|rs\.?\s*in\s*million|\(in million\)/i.test(t)) return 'INR million';
  if (/\b(rs\.?|inr|₹)\s*(in\s*)?lakhs?\b|\(in lakhs?\)/i.test(t)) return 'INR lakh';
  if (/all figures in inr crore|figures in inr crore/i.test(t)) return 'INR crore';
  return '';
}

export function extractByRules(text, { name = '' } = {}) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const tables = [], rejected = [];
  let cur = null;
  lines.forEach((line, i) => {
    const ps = [...line.matchAll(PERIOD)];
    if (ps.length >= 2) {
      const ctx = lines.slice(Math.max(0, i - 12), i + 1).join(' ').toLowerCase();
      cur = { at: i, header: line, periods: ps.map(parsePeriod), basis: /consolidated/.test(ctx) ? 'consolidated' : /standalone/.test(ctx) ? 'standalone' : '', rows: {} };
      tables.push(cur);
      return;
    }
    if (!cur || i - cur.at > 60) return;
    const n = norm(line);
    for (const [label, field] of ROW_INDEX) {
      if (!n.startsWith(label + ' ')) continue;
      // The label must be followed directly by the numbers.
      const words = label.split(' ').length;
      const rawWords = line.split(' ');
      let k = 0, consumed = 0;
      while (k < rawWords.length && consumed < words) { if (norm(rawWords[k])) consumed += norm(rawWords[k]).split(' ').length; k++; }
      const vals = rowValues(rawWords.slice(k).join(' '));
      // A row must have exactly one value per period in its header. More or fewer means a number was
      // split or merged in the text, so the row is refused: no figure is better than a wrong one.
      if (vals && vals.length === cur.periods.length && !(field in cur.rows)) cur.rows[field] = vals;
      else if (vals && vals.length >= 2 && vals.length !== cur.periods.length) rejected.push(`${line.slice(0, 80)} (${vals.length} values for ${cur.periods.length} periods)`);
      break;
    }
  });
  // The current quarter is the latest quarterly period named in any header.
  const qs = tables.flatMap((t) => t.periods).filter((p) => p.kind.startsWith('Q'));
  const latest = qs.sort((a, b) => b.fy - a.fy || b.kind.localeCompare(a.kind))[0];
  const role = (p) => {
    if (!latest) return null;
    const q = Number(latest.kind[1]);
    if (p.kind === latest.kind && p.fy === latest.fy) return 'current';
    if (p.kind === latest.kind && p.fy === latest.fy - 1) return 'priorYear';
    if (p.kind === `Q${q === 1 ? 4 : q - 1}` && p.fy === (q === 1 ? latest.fy - 1 : latest.fy)) return 'priorQuarter';
    if (!p.kind.startsWith('Q') && p.fy === latest.fy) return 'ytd';
    if (!p.kind.startsWith('Q') && p.fy === latest.fy - 1) return 'ytdPy';
    return null;
  };
  // Consolidated tables first, then unlabelled, then standalone; within those, document order.
  const rank = { consolidated: 0, '': 1, standalone: 2 };
  const ordered = [...tables].sort((a, b) => rank[a.basis] - rank[b.basis] || a.at - b.at);
  const periods = { current: { label: latest?.label || '' }, priorYear: { label: latest ? `${latest.kind} FY${String(latest.fy - 1).slice(2)}` : '' }, priorQuarter: null };
  const ytd = {}, used = new Set();
  for (const t of ordered) {
    const roles = t.periods.map(role);
    for (const [field, vals] of Object.entries(t.rows)) {
      roles.forEach((r, idx) => {
        const v = vals[idx];
        if (r == null || v == null || idx >= vals.length) return;
        if (r === 'ytd' || r === 'ytdPy') { const key = r === 'ytdPy' ? (field === 'revenue' ? 'revenuePy' : null) : field; if (key && ['revenue', 'ebitda', 'capex', 'revenuePy'].includes(key) && ytd[key] == null) { ytd[key] = v; ytd.label = t.periods[idx].label; used.add(t); } return; }
        if (r === 'priorQuarter') periods.priorQuarter ||= { label: t.periods[idx].label };
        if (periods[r][field] == null) { periods[r][field] = v; used.add(t); }
      });
    }
  }
  // Guidance: whole sentences with a forward-looking phrase and a figure, copied word for word.
  const commitments = [];
  const sentences = String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/);
  const FWD = /\b(we expect|we are guiding|our guidance|guidance (is|of|for)|we will|we target|target(ing)? (of|a)|going forward|for the full year|for fy\s?'?\d{2}|by (the )?(end of )?(fy|q[1-4])|outlook)\b/i;
  for (const s of sentences) {
    if (commitments.length >= 8 || s.length > 400 || s.length < 30) continue;
    if (!FWD.test(s) || !/\d/.test(s) || /\?$/.test(s)) continue;
    const low = s.toLowerCase();
    const metric = /margin/.test(low) ? 'ebitdaMargin' : /capex|capital expenditure/.test(low) ? 'capex' : /net debt|leverage|debt to ebitda/.test(low) ? 'netDebtToEbitda' : /revenue|growth|top ?line|volume/.test(low) ? 'revenueGrowth' : 'other';
    const range = /(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/i.exec(s);
    const single = /(\d+(?:\.\d+)?)\s*(?:%|percent|crore|cr\b|x\b)/i.exec(s);
    const target = range ? { low: Number(range[1]), high: Number(range[2]) } : single ? (metric === 'netDebtToEbitda' ? { high: Number(single[1]) } : metric === 'capex' ? { value: Number(single[1]) } : { low: Number(single[1]) }) : undefined;
    commitments.push({ id: `R${commitments.length + 1}`, kind: 'guidance', by: 'management', said: s.trim(), metric, target, topic: metric === 'other' ? '' : metric.replace(/([A-Z])/g, ' $1').toLowerCase() });
  }
  const nameM = /([A-Z][A-Za-z&.'\- ]{2,60}?\s(?:Limited|Ltd\.?))(?![a-z])/.exec(text || '');
  const pack = {
    schema: SCHEMA,
    id: `rules-${Date.now().toString(36)}`,
    company: { name: nameM ? nameM[1].trim() : (name || 'Uploaded company').replace(/\.(pdf|txt|md)$/i, ''), quarter: latest?.label || '', units: units(text), unitWord: (units(text).split(' ').pop() || '') },
    periods,
    ytd: ytd.revenue != null ? { label: ytd.label, revenue: ytd.revenue, ebitda: ytd.ebitda ?? null, capex: ytd.capex ?? null, revenuePy: ytd.revenuePy ?? null, quartersElapsed: latest ? Number(latest.kind[1]) : null } : null,
    commitments,
    provenance: { source: 'upload', extractedBy: 'rules', policy: 'strict' },
  };
  const report = { tables: [...used].map((t) => ({ header: t.header, basis: t.basis || 'unlabelled', rows: Object.keys(t.rows) })), latest: latest?.label || null, guidance: commitments.length, rejected };
  return { pack, report };
}

// Compare AI-extracted headline figures with the rules' reading of the same text.
export function crossCheck(aiPack, rulesPack) {
  const out = [];
  for (const per of ['current', 'priorYear', 'priorQuarter']) for (const f of ['revenue', 'ebitda', 'pat', 'ocf', 'capex', 'netDebt']) {
    const a = aiPack?.periods?.[per]?.[f], r = rulesPack?.periods?.[per]?.[f];
    if (a == null || r == null) continue;
    out.push({ path: `periods.${per}.${f}`, ai: a, rules: r, agree: Math.abs(a - r) <= Math.max(0.5, Math.abs(r) * 0.001) });
  }
  return { checked: out.length, agree: out.filter((x) => x.agree).length, disagreements: out.filter((x) => !x.agree) };
}

// Merge: rules' figures win (they are in the document by construction); the AI pack fills what the
// rules could not read (segments, commitments, transcript, notes, consensus, history). The strict
// evidence policy then checks everything the AI contributed.
export function mergeRulesFirst(rulesPack, aiPack) {
  if (!aiPack) return rulesPack;
  const m = JSON.parse(JSON.stringify(aiPack));
  m.periods ||= {};
  for (const per of ['current', 'priorYear', 'priorQuarter']) {
    const r = rulesPack?.periods?.[per];
    if (!r) continue;
    m.periods[per] ||= { label: r.label };
    for (const [k, v] of Object.entries(r)) if (v != null && k !== 'label') m.periods[per][k] = v;
  }
  if (rulesPack?.ytd) m.ytd = { ...(m.ytd || {}), ...Object.fromEntries(Object.entries(rulesPack.ytd).filter(([, v]) => v != null)) };
  for (const k of ['name', 'quarter', 'units', 'unitWord']) if (!m.company?.[k] && rulesPack?.company?.[k]) (m.company ||= {})[k] = rulesPack.company[k];
  const seen = new Set((m.commitments || []).map((c) => c.said));
  m.commitments = [...(m.commitments || []), ...(rulesPack?.commitments || []).filter((c) => !seen.has(c.said)).map((c, i) => ({ ...c, id: `R${i + 1}` }))];
  return m;
}
