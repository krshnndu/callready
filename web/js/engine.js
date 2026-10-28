// Deterministic engine: KPIs, implied guidance, pressure ranking, remarks gaps, answer checks.
// No model computes a figure; everything here is plain arithmetic over pack.js.
import { quarters, segments, consensus, bridge, commitments, notes } from './pack.js';

const byQ = Object.fromEntries(quarters.map((r) => [r.q, r]));
export const pct = (a, b) => ((a - b) / b) * 100;
export const margin = (r) => (r.ebitda / r.revenue) * 100;
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- KPIs ----------
export function kpis() {
  const cur = byQ['Q2 FY27'], py = byQ['Q2 FY26'], pq = byQ['Q1 FY27'];
  const fy26 = ['Q1 FY26', 'Q2 FY26', 'Q3 FY26', 'Q4 FY26'].map((q) => byQ[q]);
  const fy26Rev = fy26.reduce((s, r) => s + r.revenue, 0);
  const fy26Ebitda = fy26.reduce((s, r) => s + r.ebitda, 0);
  const ttmEbitda = ['Q3 FY26', 'Q4 FY26', 'Q1 FY27', 'Q2 FY27'].reduce((s, q) => s + byQ[q].ebitda, 0);
  const h1Rev = pq.revenue + cur.revenue, h1Ebitda = pq.ebitda + cur.ebitda;
  const h1RevPy = byQ['Q1 FY26'].revenue + py.revenue;
  const record = Math.max(...quarters.map(margin));
  return {
    cur, py, pq, fy26Rev, fy26Ebitda, ttmEbitda, h1Rev, h1Ebitda, record,
    revYoY: pct(cur.revenue, py.revenue),
    revQoQ: pct(cur.revenue, pq.revenue),
    h1RevYoY: pct(h1Rev, h1RevPy),
    m: margin(cur), mPy: margin(py), mPq: margin(pq),
    mBps: (margin(cur) - margin(py)) * 100,
    ebitdaYoY: pct(cur.ebitda, py.ebitda),
    h1Margin: (h1Ebitda / h1Rev) * 100,
    patYoY: pct(cur.pat, py.pat),
    ocfYoY: pct(cur.ocf, py.ocf),
    conv: (cur.ocf / cur.ebitda) * 100,
    convPy: (py.ocf / py.ebitda) * 100,
    fcf: cur.ocf - cur.capex,
    lev: cur.netDebt / ttmEbitda,
    levFy: byQ['Q4 FY26'].netDebt / fy26Ebitda,
    h1Capex: pq.capex + cur.capex,
    ccc: cur.invDays + cur.recDays - cur.payDays,
    cccPy: py.invDays + py.recDays - py.payDays,
    vsCons: {
      rev: pct(cur.revenue, consensus.revenue),
      ebitda: pct(cur.ebitda, consensus.ebitda),
      pat: pct(cur.pat, consensus.pat),
    },
  };
}

// H2 margin needed to land on the bottom of the FY27 band, across the guided growth range.
export function impliedH2(k = kpis()) {
  const rows = [14, 15, 16].map((g) => {
    const fyRev = k.fy26Rev * (1 + g / 100);
    const h2Rev = fyRev - k.h1Rev;
    const need = (0.135 * fyRev - k.h1Ebitda) / h2Rev * 100;
    return { growth: g, fyRev, h2Rev, need };
  });
  return { rows, need: rows[1].need, record: k.record, h1: k.h1Margin };
}

export function segmentTable() {
  return segments.map((s) => {
    const [rev, m] = s.rows['Q2 FY27'];
    const [revPy, mPy] = s.rows['Q2 FY26'];
    return { ...s, rev, m, revPy, mPy, growth: pct(rev, revPy), bps: (m - mPy) * 100, ebit: (rev * m) / 100 };
  });
}

// ---------- Pressure map ----------
// pressure = magnitude x salience x credibility x recurrence (docs/04-SCORING.md section 1)
export function pressureMap() {
  const k = kpis(), imp = impliedH2(k), seg = Object.fromEntries(segmentTable().map((s) => [s.key, s]));
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const P = [
    { id: 'guidance', theme: 'Guidance', title: 'FY27 margin guidance is out of reach',
      evidence: `H1 margin ${r1(imp.h1)}%. The bottom of the 13.5 to 14.5% band needs about ${r1(imp.need)}% in H2; the best quarter on record is ${r1(imp.record)}%.`,
      magnitude: clamp((imp.need - imp.record) / 1.0), salience: 1.0, ties: ['G2', 'S1'], recurrent: ['Q1FY27-L048'], owner: 'CFO' },
    { id: 'cash', theme: 'Cash', title: 'Cash conversion halved; working capital worsened',
      evidence: `OCF ${k.cur.ocf} vs ${k.py.ocf} crore (${r1(k.ocfYoY)}%). OCF/EBITDA ${Math.round(k.conv)}% vs ${Math.round(k.convPy)}%. Cash cycle ${k.cccPy} to ${k.ccc} days.`,
      magnitude: clamp(-k.ocfYoY / 50), salience: 0.9, ties: ['S2'], recurrent: ['Q4FY26-L052'], owner: 'CFO' },
    { id: 'margin', theme: 'Margin', title: 'EBITDA margin down 258 bps despite 14% growth',
      evidence: `EBITDA margin ${r1(k.m)}% vs ${r1(k.mPy)}%. EBITDA ${r1(k.ebitdaYoY)}% in absolute terms; PAT ${r1(k.patYoY)}%.`,
      magnitude: clamp(-k.mBps / 300), salience: 0.95, ties: ['S1'], recurrent: ['Q1FY27-L048'], owner: 'CFO' },
    { id: 'discom', theme: 'Receivables', title: 'Discom receivables: the question deflected in August',
      evidence: '210 crore overdue beyond 180 days from state distribution companies (note N1); 18 crore provision (N2).',
      magnitude: 0.8, salience: 0.85, ties: ['D1'], recurrent: ['Q1FY27-L033', 'Q4FY26-L052'], owner: 'CFO' },
    { id: 'leverage', theme: 'Balance sheet', title: 'Leverage climbing towards the 1x ceiling',
      evidence: `Net debt ${k.cur.netDebt} vs 640 crore at year end; ${k.lev.toFixed(2)}x TTM EBITDA vs ${k.levFy.toFixed(2)}x. FCF ${k.fcf} crore; 75 crore dividend paid.`,
      magnitude: clamp(k.lev), salience: 0.85, ties: ['G5'], recurrent: [], owner: 'CFO' },
    { id: 'energy', theme: 'Segments', title: 'Energy losses widening against a breakeven promise',
      evidence: `Energy EBIT margin ${seg.ENE.m}% vs ${seg.ENE.mPy}%, revenue +${r1(seg.ENE.growth)}%. Breakeven promised for Q4 FY27.`,
      magnitude: clamp(-seg.ENE.bps / 600), salience: 0.7, ties: ['G3'], recurrent: [], owner: 'ENERGY' },
    { id: 'consensus', theme: 'Consensus', title: 'EBITDA missed consensus while revenue beat',
      evidence: `Revenue ${r1(k.vsCons.rev)}% vs consensus; EBITDA ${r1(k.vsCons.ebitda)}%; PAT ${r1(k.vsCons.pat)}%.`,
      magnitude: clamp(-k.vsCons.ebitda / 10), salience: 0.85, ties: [], recurrent: [], owner: 'CFO' },
    { id: 'appliances', theme: 'Segments', title: 'Home Appliances margin compressed 330 bps',
      evidence: `Appliances EBIT margin ${seg.APP.m}% vs ${seg.APP.mPy}% on revenue +${r1(seg.APP.growth)}%.`,
      magnitude: clamp(-seg.APP.bps / 300), salience: 0.7, ties: [], recurrent: [], owner: 'CEO' },
    { id: 'capex', theme: 'Capital allocation', title: 'Capex running ahead of plan',
      evidence: `H1 capex ${k.h1Capex} crore against "around 600" for the year (${Math.round(k.h1Capex / 6)}%).`,
      magnitude: clamp((k.h1Capex / 600 - 0.5) / 0.3), salience: 0.6, ties: ['G4'], recurrent: [], owner: 'CFO' },
  ];
  const cmap = Object.fromEntries(commitments.map((c) => [c.id, c]));
  for (const p of P) {
    const st = p.ties.map((t) => cmap[t].status);
    p.credibility = st.includes('broken') ? 1.5 : st.includes('at-risk') ? 1.25 : 1.0;
    p.recurrence = st.includes('deflected') ? 1.3 : p.recurrent.length ? 1.2 : 1.0;
    p.score = p.magnitude * p.salience * p.credibility * p.recurrence;
  }
  P.sort((a, b) => b.score - a.score);
  const top = P[0].score;
  P.forEach((p, i) => { p.rank = i + 1; p.level = p.score >= 0.75 * top ? 'red' : p.score >= 0.45 * top ? 'amber' : 'green'; });
  return P;
}

// ---------- Prepared remarks gap check ----------
const THEMES = [
  { id: 'margin', label: 'Margin decline and its bridge', any: ['margin', 'ebitda', 'basis points', 'bps'], need: ['declin', 'fell', 'lower', 'down', 'pressure', 'compress', 'bridge'] },
  { id: 'cash', label: 'Cash flow and working capital', any: ['cash flow', 'working capital', 'inventory', 'receivable', 'cash conversion'] },
  { id: 'guidance', label: 'Status of FY27 margin guidance', any: ['band', 'guidance', 'margin guidance', '13.5'] },
  { id: 'discom', label: 'Discom receivables', any: ['discom', 'distribution compan', 'overdue'] },
  { id: 'leverage', label: 'Net debt and leverage', any: ['net debt', 'leverage', 'borrowing'] },
  { id: 'energy', label: 'Energy losses vs breakeven', any: ['breakeven', 'break-even', 'loss'] },
];
const RISKY = [
  { re: /remain confident in (our )?(strategy and (in )?)?(our )?fy27 outlook|reaffirm|on track for (the )?(year|guidance)/i, why: 'Reaffirms an outlook the numbers no longer support (G2, S1). Invites "so are you reaffirming the band?"' },
  { re: /record (quarterly )?revenue/i, why: 'Leads with the good news only; analysts will read it as spin when margin and cash fell.' },
  { re: /strong momentum across all/i, why: 'Not true of profit: Appliances and Energy margins fell. Overclaiming costs credibility.' },
  { re: /won new charger tenders|gain(ed)? share/i, why: 'Share and tender wins are not in the disclosures pack; check they are public before saying them.' },
];
export function remarksCheck(text) {
  const t = text.toLowerCase();
  const themes = THEMES.map((th) => {
    const hit = th.any.some((w) => t.includes(w)) && (!th.need || th.need.some((w) => t.includes(w)));
    return { ...th, covered: hit };
  });
  const risky = RISKY.flatMap((r) => { const m = text.match(r.re); return m ? [{ phrase: m[0], why: r.why }] : []; });
  return { themes, risky, gaps: themes.filter((x) => !x.covered) };
}

// ---------- Fact set for the number checker ----------
export function factSet() {
  const k = kpis(), imp = impliedH2(k);
  const F = [];
  const add = (v, label) => F.push({ v: Math.abs(v), label });
  for (const r of quarters) {
    for (const [f, lab] of [['revenue', 'revenue'], ['ebitda', 'EBITDA'], ['ocf', 'operating cash flow'], ['capex', 'capex'], ['netDebt', 'net debt'], ['da', 'D&A'], ['pat', 'PAT'], ['otherIncome', 'other income'], ['financeCost', 'finance cost'], ['invDays', 'inventory days'], ['recDays', 'receivable days'], ['payDays', 'payable days'], ['dividend', 'dividend']]) {
      if (r[f] != null) add(r[f], `${r.q} ${lab}`);
    }
    add(margin(r), `${r.q} EBITDA margin`);
  }
  for (const s of segments) for (const [q, [rev, m]] of Object.entries(s.rows)) { add(rev, `${q} ${s.name} revenue`); add(m, `${q} ${s.name} EBIT margin`); }
  for (const s of segmentTable()) { add(s.growth, `${s.name} growth`); add(s.bps, `${s.name} margin change bps`); add(s.ebit, `${s.name} EBIT`); }
  for (const b of bridge) add(b.bps, `bridge: ${b.driver}`);
  add(258, 'margin change bps'); add(2.58, 'margin change pts');
  Object.entries({ revYoY: 'revenue growth', revQoQ: 'revenue QoQ', h1RevYoY: 'H1 revenue growth', ebitdaYoY: 'EBITDA change', h1Margin: 'H1 margin', patYoY: 'PAT change', ocfYoY: 'OCF change', conv: 'cash conversion', convPy: 'cash conversion PY', fcf: 'free cash flow', lev: 'net debt / EBITDA', levFy: 'net debt / EBITDA FY26', h1Capex: 'H1 capex', ccc: 'cash cycle', cccPy: 'cash cycle PY', fy26Rev: 'FY26 revenue', fy26Ebitda: 'FY26 EBITDA', ttmEbitda: 'TTM EBITDA', h1Rev: 'H1 revenue', h1Ebitda: 'H1 EBITDA', record: 'record margin' }).forEach(([key, lab]) => add(k[key], lab));
  Object.entries(k.vsCons).forEach(([key, v]) => add(v, `vs consensus ${key}`));
  add(consensus.revenue, 'consensus revenue'); add(consensus.ebitda, 'consensus EBITDA'); add(consensus.margin, 'consensus margin'); add(consensus.pat, 'consensus PAT');
  for (const v of [13.5, 14.5, 600, 1, 14, 15, 16]) add(v, 'guidance');
  for (const row of imp.rows) { add(row.need, 'implied H2 margin'); add(row.h2Rev, 'H2 revenue'); }
  add(210, 'discom overdue (N1)'); add(180, 'days overdue (N1)'); add(18, 'ECL provision (N2)');
  add(17, 'inventory days increase'); add(12, 'receivable days increase'); add(32, 'cash cycle increase'); add(300, 'net debt increase');
  add(103, 'FCF deficit'); add(13.9, 'Q1 revenue growth (Q1FY27-L008)'); add(8860, 'FY26 revenue');
  return F;
}

const FACTS = factSet();
// Figures with a unit, or numbers above 12 (bare small integers are usually counts or labels).
const NUM_RE = /(?<![A-Za-z\d.])(-|minus\s+)?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(%|percent|per cent|bps|basis points|crore|cr\b|x\b|times|days)?/gi;
export function extractFigures(text) {
  const out = [];
  for (const m of text.matchAll(NUM_RE)) {
    const raw = m[0].trim();
    const v = parseFloat(m[2].replace(/,/g, ''));
    const unit = (m[3] || '').toLowerCase();
    const before = text.slice(Math.max(0, m.index - 3), m.index);
    if (/(Q|H|FY)\s?$/i.test(before)) continue; // Q2, H1, FY27
    if (!unit && v <= 12) continue;
    if (!unit && v >= 1900 && v <= 2100 && Number.isInteger(v)) continue; // years
    out.push({ raw, v, unit, index: m.index });
  }
  return out;
}
// A figure said right after a metric name must match a fact about that metric.
const METRICS = [
  { re: /(operating )?cash flow|ocf|cash conversion/i, labels: /cash flow|cash conversion|fcf|free cash/i },
  { re: /net debt/i, labels: /net debt|guidance/i },
  { re: /capex/i, labels: /capex|guidance/i },
  { re: /dividend/i, labels: /dividend/i },
  { re: /\bpat\b|profit after tax/i, labels: /pat/i },
  { re: /margin/i, labels: /margin|bridge|record|implied|guidance|bps|pts/i },
  { re: /revenue|sales/i, labels: /revenue|growth|guidance|consensus/i },
  { re: /ebitda/i, labels: /ebitda|margin|consensus|bps|pts|bridge|guidance|record|implied/i },
];
const tol = (x) => (x < 3 ? 0.05 : x < 100 ? Math.max(0.15, x * 0.01) : x * 0.006);
export function matchFigure(f, text = '') {
  const hits = FACTS.filter((F) => Math.abs(F.v - f.v) <= tol(F.v));
  if (!hits.length) return null;
  if (/^(x|times)$/.test(f.unit)) return hits.find((F) => /net debt|guidance/i.test(F.label)) || null;
  if (f.unit === 'days') return hits.find((F) => /days|cycle|overdue/i.test(F.label)) || null;
  const before = text.slice(Math.max(0, f.index - 40), f.index);
  const words = before.split(/[;:]|[,.]\s/).pop();
  const metric = METRICS.find((m) => m.re.test(words));
  if (!metric) return hits[0];
  return hits.find((F) => metric.labels.test(F.label)) || null;
}
const FORWARD_OK = /guidance|implied|record|consensus|bridge|margin|growth/;

// ---------- Answer scorecard (deterministic part) ----------
const HEDGES = ['basically', 'sort of', 'kind of', 'to be honest', 'you know', 'i think', 'i guess', 'actually', 'obviously', 'frankly', 'more or less'];
// A forward-looking clause: the trigger and the rest of the sentence (decimals kept, so 13.1% is read whole).
const FORWARD_NUM = /(next quarter|q3|q4|h2|fy28|going forward|by (march|december)|will be|we expect|expect it|we will|target)(?:[^.]|\.(?=\d)){0,90}/gi;
const MNPI = [
  { re: /\b(october|november)\b[^.]{0,50}(sales|demand|orders|revenue|trading)/i, why: 'Current-quarter trading detail not in the disclosures (selective disclosure risk).' },
  { re: /\b(acquisition|acquire|merger|stake sale|divest|fund ?rais|qip)\b/i, why: 'Corporate action not disclosed in the pack: never hint at it on a call.' },
  { re: /\b(order book|order backlog|new order|contract win|signed a contract)\b/i, why: 'Order or contract detail not in the disclosures.' },
  { re: /\b(price (increase|hike) of|raised prices by)\b/i, why: 'Specific pricing action not in the disclosures.' },
  { re: /\b(guarantee|definitely|certainly will|no doubt|for sure)\b/i, why: 'Over-promise: a guarantee about future results.' },
];
const DRIVER = /(because|due to|driven by|from|caused by|reflects|came from|of which|bridge)/i;
const ACTION = /(we will|we are|our priority|we plan|we have started|we'll|from now on|every quarter|each quarter|we intend)/i;

// Ways of owning a statement from an earlier call, across registers (plain, US/UK and Indian-English
// business usage). Added after scripts/check_bias.mjs found Indian-English phrasing scored 13 to 23 points lower.
export const OWN_PAST = ['last call', 'previous call', 'earlier call', 'as informed', 'as communicated', 'as indicated', 'as mentioned', 'had mentioned', 'had said', 'had expected', 'had committed', 'had stated', 'we committed', 'we had guided', 'take your point', 'not a satisfactory', 'has not happened', 'have not happened', 'did not materialise', 'did not materialize'];

export function scoreAnswer(q, text, { durationS } = {}) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const t = text.toLowerCase();
  const flags = [];
  const dims = {};

  // Accuracy
  const figs = extractFigures(text).map((f) => ({ ...f, match: matchFigure(f, text) }));
  const bad = figs.filter((f) => !f.match);
  let acc = figs.length ? 100 : 55;
  if (bad.length) acc = Math.min(acc, 40);
  const keyMiss = bad.some((f) => (q.keyFigures || []).some((kf) => Math.abs(kf - f.v) < 2));
  if (keyMiss) acc = Math.min(acc, 20);
  for (const f of bad) flags.push({ kind: 'red', dim: 'Accuracy', text: f.raw, why: 'This figure is not in the disclosures. Check it or drop it.' });
  dims.accuracy = { score: acc, why: figs.length ? `${figs.length - bad.length} of ${figs.length} figures match the pack` : 'No figures: the answer is not anchored in the numbers' };

  // Consistency
  const cmap = Object.fromEntries(commitments.map((c) => [c.id, c]));
  const needAck = (q.mustAck || []).map((id) => cmap[id]);
  const ackWords = (c) => (/^[SD]/.test(c.id) ? [...c.ack, ...OWN_PAST] : c.ack);
  const missed = needAck.filter((c) => !ackWords(c).some((w) => t.includes(w)));
  let con = needAck.length ? Math.round(100 * (1 - missed.length / needAck.length)) : 85;
  if (missed.length) con = Math.min(con, 50);
  for (const c of missed) flags.push({ kind: 'amber', dim: 'Consistency', text: `${c.id}: ${c.said}`, why: `Silent on a commitment that is ${c.status}. Own it before the analyst quotes it back (${c.ref}).` });
  dims.consistency = { score: con, why: needAck.length ? `${needAck.length - missed.length} of ${needAck.length} commitments acknowledged` : 'No commitment on record for this question' };

  // Directness: first two sentences share the question's key terms
  const firstTwo = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').toLowerCase();
  const terms = q.terms || [];
  const shared = terms.filter((w) => firstTwo.includes(w)).length;
  const deflect = /(not going to comment|can't comment|cannot comment|let me first|before i answer|broadly speaking|at the right time\.?$)/i.test(firstTwo) && !/(we said|i said)/i.test(firstTwo);
  let dir = terms.length ? Math.min(100, 40 + Math.round((shared / Math.min(terms.length, 3)) * 60)) : 70;
  if (deflect) { dir = Math.min(dir, 30); flags.push({ kind: 'amber', dim: 'Directness', text: firstTwo.slice(0, 80), why: 'Opens with a deflection. Answer first, then explain.' }); }
  dims.directness = { score: dir, why: deflect ? 'Opens with a deflection' : `${shared} key terms of the question in the first two sentences` };

  // Explanation: quantified drivers
  const hasDriver = DRIVER.test(text) && figs.length > 0;
  const nDrivers = (text.match(/(bps|basis points|days|crore)/gi) || []).length;
  const exp = hasDriver ? Math.min(100, 55 + nDrivers * 10) : figs.length ? 45 : 25;
  dims.explanation = { score: exp, why: hasDriver ? 'Causes are named and quantified' : 'No quantified cause: say what drove it, in numbers' };

  // Forward clarity
  const act = ACTION.test(text);
  const fwd = act ? (/(every quarter|each quarter|report|disclose|track)/i.test(text) ? 90 : 70) : 35;
  dims.forward = { score: fwd, why: act ? 'Gives a concrete next step' : 'No action or metric to watch' };

  // Disclosure safety
  let saf = 100;
  for (const r of MNPI) { const m = text.match(r.re); if (m) { saf = 0; flags.push({ kind: 'red', dim: 'Disclosure', text: m[0], why: r.why }); } }
  for (const fn of text.matchAll(FORWARD_NUM)) {
    const after = extractFigures(fn[0]);
    const unguided = after.filter((f) => { const m = matchFigure(f, fn[0]); return !m || !(FORWARD_OK.test(m.label) || /^Q\d FY\d\d|FY26|H1|TTM/.test(m.label)); });
    if (unguided.length) { saf = 0; flags.push({ kind: 'red', dim: 'Disclosure', text: fn[0], why: 'A forward-looking number that is not in the guidance on record. This is new guidance given on the fly.' }); break; }
  }
  dims.safety = { score: saf, why: saf === 100 ? 'No disclosure risk found' : 'Disclosure risk: review with the company secretary' };

  // Delivery
  const hedges = HEDGES.filter((h) => t.includes(h));
  let del = wc >= 60 && wc <= 130 ? 100 : wc < 60 ? Math.max(30, 100 - (60 - wc) * 2) : Math.max(30, 100 - (wc - 130));
  del -= hedges.length * 12;
  let wpm = null;
  if (durationS && durationS > 5) { wpm = Math.round(wc / (durationS / 60)); if (wpm < 110 || wpm > 180) del -= 10; }
  del = Math.max(0, del);
  if (hedges.length) flags.push({ kind: 'amber', dim: 'Delivery', text: hedges.join(', '), why: 'Filler and hedges weaken authority on a call.' });
  dims.delivery = { score: del, why: `${wc} words (target 60 to 130)${hedges.length ? `, ${hedges.length} hedges` : ''}${wpm ? `, ${wpm} wpm` : ''}` };

  const W = { accuracy: 25, consistency: 20, directness: 15, explanation: 15, forward: 10, safety: 10, delivery: 5 };
  const total = Math.round(Object.entries(W).reduce((s, [k, w]) => s + dims[k].score * w, 0) / 100);
  const red = flags.some((f) => f.kind === 'red' && f.dim === 'Disclosure');
  const band = red || total < 55 ? 'red' : total < 75 ? 'amber' : 'green';
  return { total, band, dims, flags, figures: figs, words: wc, wpm, weights: W };
}

export const DIM_LABELS = { accuracy: 'Accuracy', consistency: 'Consistency', directness: 'Directness', explanation: 'Explanation', forward: 'Forward clarity', safety: 'Disclosure safety', delivery: 'Delivery' };
export { notes };
