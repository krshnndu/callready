// Answer scorecard and remarks check. Rules only; every function takes the pack context from core.analyze().
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
const METRIC_CTX = [
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
export function matchFigure(facts, f, text = '') {
  const hits = facts.filter((F) => Math.abs(F.v - f.v) <= tol(F.v));
  if (!hits.length) return null;
  const fromText = (F) => /^(note|transcript|commitment)/.test(F.label);
  if (/^(x|times)$/.test(f.unit)) return hits.find((F) => /net debt|guidance/i.test(F.label) || fromText(F)) || null;
  if (f.unit === 'days') return hits.find((F) => /days|cycle|overdue/i.test(F.label) || fromText(F)) || null;
  const before = text.slice(Math.max(0, f.index - 40), f.index);
  const words = before.split(/[;:]|[,.]\s/).pop();
  const metric = METRIC_CTX.find((m) => m.re.test(words));
  if (!metric) return hits[0];
  return hits.find((F) => metric.labels.test(F.label) || fromText(F)) || null;
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

export function scoreAnswer(ctx, q, text, { durationS } = {}) {
  const FACTS = ctx.facts, commitments = ctx.commitments;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const t = text.toLowerCase();
  const flags = [];
  const dims = {};

  // Accuracy
  const figs = extractFigures(text).map((f) => ({ ...f, match: matchFigure(FACTS, f, text) }));
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
  // What counts as owning a commitment: its own words if the pack lists them, the register-neutral
  // phrases for owning an earlier statement, and for guidance the language of targets.
  const ackWords = (c) => [...(c.ack || []), ...(c.kind !== 'guidance' || /^[SD]/.test(c.id) ? OWN_PAST : []),
    ...(c.kind === 'guidance' ? ['guidance', 'guided', 'target', 'commitment', 'committed', ...[c.target?.low, c.target?.high, c.target?.value].filter((v) => v != null).map(String)] : []),
    ...(c.kind !== 'guidance' ? ['we said', 'i said', 'last quarter', 'we told', 'did not', 'was not', 'were not', 'right time'] : [])];
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
    const unguided = after.filter((f) => { const m = matchFigure(FACTS, f, fn[0]); return !m || !(FORWARD_OK.test(m.label) || /^(current|prior|YTD|TTM|Q\d)/.test(m.label)); });
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

// ---------- prepared remarks gap check: themes come from the pack's own pressure map ----------
const RISKY = [
  { re: /remain confident in (our )?(strategy and (in )?)?(our )?(fy\d+ |full[- ]year )?outlook|reaffirm|on track for (the )?(year|guidance)/i, why: 'Reaffirms an outlook the numbers may no longer support. Invites "so are you reaffirming guidance?"' },
  { re: /record (quarterly )?(revenue|sales|quarter)/i, why: 'Leads with the good news only; analysts read it as spin when margin or cash fell.' },
  { re: /strong (momentum|performance) across (all|the board)/i, why: 'An overclaim if any segment or metric went the wrong way. It costs credibility.' },
  { re: /(won|winning|secured) (new|several|major) (orders|tenders|contracts|customers)|gain(ed|ing)? (market )?share/i, why: 'Share and order wins must be in the published disclosures before they are said on a call.' },
];
const DECLINE = ['declin', 'fell', 'lower', 'down', 'pressure', 'compress', 'bridge', 'decrease', 'drop', 'weaker', 'miss'];
export function remarksCheck(ctx, text) {
  const t = text.toLowerCase();
  const themes = ctx.pressure.slice(0, 8).map((x) => {
    const hit = (x.kw || []).some((w) => t.includes(w)) && (x.theme === 'Guidance' || x.id.startsWith('c-') || DECLINE.some((w) => t.includes(w)));
    return { id: x.id, label: x.title, covered: hit };
  });
  const risky = RISKY.flatMap((r) => { const m = text.match(r.re); return m ? [{ phrase: m[0], why: r.why }] : []; });
  return { themes, risky, gaps: themes.filter((x) => !x.covered) };
}
