// Pack-agnostic engine. Every screen runs on a pack in the callready.pack.v1 format, whether it is the
// shipped sample, a JSON upload or an AI extraction from a results document. Rules only: no model here.

export const SCHEMA = 'callready.pack.v1';
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const pct = (a, b) => (num(a) != null && num(b) ? ((a - b) / Math.abs(b)) * 100 : null);
const clamp = (x) => Math.max(0, Math.min(1, x || 0));
const r1 = (x) => Math.round(x * 10) / 10;
export const margin = (p) => (p && num(p.revenue) && num(p.ebitda) != null ? (p.ebitda / p.revenue) * 100 : null);

// ---------- validation ----------
export const PERIOD_FIELDS = ['revenue', 'ebitda', 'ebit', 'pat', 'ocf', 'capex', 'netDebt', 'da', 'invDays', 'recDays', 'payDays'];

// Some companies report operating profit (EBIT) and no EBITDA. The margin checks then run on EBIT,
// and the pack says so, rather than the pack being rejected.
export function normalizePack(p) {
  const per = p?.periods || {};
  const usesEbit = ['current', 'priorYear'].every((k) => per[k] && per[k].ebitda == null && typeof per[k].ebit === 'number');
  if (usesEbit) {
    for (const x of [per.current, per.priorYear, per.priorQuarter, ...(p.history || [])]) if (x && x.ebitda == null && typeof x.ebit === 'number') x.ebitda = x.ebit;
    p.company = { ...(p.company || {}), marginBasis: 'EBIT' };
  }
  if (typeof p?.company?.units === 'string') p.company.units = p.company.units.split(/[;(]/)[0].trim();
  // Period labels are the short form ("Q2 FY27"); a date range in brackets moves to `period`.
  for (const x of [per.current, per.priorYear, per.priorQuarter, ...(p?.history || [])]) {
    const m = x && typeof x.label === 'string' && x.label.match(/^(.*?)\s*\((.+)\)\s*$/);
    if (m) { x.label = m[1].trim(); x.period ||= m[2].trim(); }
  }
  return p;
}
export const METRICS = ['revenueGrowth', 'ebitdaMargin', 'netDebtToEbitda', 'capex', 'segmentEbit', 'workingCapital', 'cashFlow', 'other'];
export function validatePack(p) {
  const errors = [], warnings = [];
  if (!p || typeof p !== 'object') return { errors: ['Not a JSON object.'], warnings };
  normalizePack(p);
  if (p.company?.marginBasis === 'EBIT') warnings.push('The company reports operating profit (EBIT), not EBITDA: margin checks use operating margin.');
  if (p.schema !== SCHEMA) errors.push(`"schema" must be "${SCHEMA}".`);
  if (!p.company?.name) errors.push('company.name is missing.');
  if (!p.company?.quarter) errors.push('company.quarter is missing (for example "Q2 FY27").');
  for (const k of ['current', 'priorYear']) {
    const per = p.periods?.[k];
    if (!per) { errors.push(`periods.${k} is missing.`); continue; }
    for (const f of ['revenue', 'ebitda']) if (num(per[f]) == null) errors.push(`periods.${k}.${f} must be a number.`);
  }
  if (!p.periods?.priorQuarter) warnings.push('No prior quarter: quarter-on-quarter figures are skipped.');
  const cur = p.periods?.current;
  if (Array.isArray(p.segments) && p.segments.length && num(cur?.revenue)) {
    const sum = p.segments.reduce((s, x) => s + (num(x.current?.revenue) || 0), 0);
    if (Math.abs(sum - cur.revenue) / cur.revenue > 0.02) warnings.push(`Segment revenues add up to ${r1(sum)}, not the reported ${cur.revenue} (more than 2% apart). Check the segment table.`);
  }
  const ids = new Set();
  for (const c of p.commitments || []) {
    if (!c.id || ids.has(c.id)) errors.push(`Commitment id "${c.id}" is missing or repeated.`);
    ids.add(c.id);
    if (!['guidance', 'statement', 'deflection'].includes(c.kind)) errors.push(`Commitment ${c.id}: kind must be guidance, statement or deflection.`);
    if (!c.said) errors.push(`Commitment ${c.id}: "said" (the words on record) is missing.`);
  }
  if (!(p.commitments || []).length) warnings.push('No commitments on record: the consistency checks have nothing to hold answers to.');
  if (!(p.transcript || []).length) warnings.push('No earlier call transcript: questions cannot draw on what analysts asked before.');
  return { errors, warnings };
}

// ---------- KPIs ----------
export function kpis(p) {
  const cur = p.periods.current, py = p.periods.priorYear, pq = p.periods.priorQuarter || null;
  const hist = (p.history || []).filter((h) => num(h.revenue) && num(h.ebitda) != null);
  const ttm = num(p.ttmEbitda) ?? (hist.length >= 4 ? hist.slice(-4).reduce((s, h) => s + h.ebitda, 0) : num(cur.ebitda) * 4);
  const marginsSeen = [...hist.map(margin), margin(cur), margin(py), pq && margin(pq)].filter((x) => x != null);
  const ccc = (x) => (x && [x.invDays, x.recDays, x.payDays].every((v) => num(v) != null) ? x.invDays + x.recDays - x.payDays : null);
  const k = {
    cur, py, pq, ttm, ttmAnnualised: num(p.ttmEbitda) == null && hist.length < 4,
    revYoY: pct(cur.revenue, py.revenue), revQoQ: pq ? pct(cur.revenue, pq.revenue) : null,
    m: margin(cur), mPy: margin(py), mPq: pq ? margin(pq) : null,
    ebitdaYoY: pct(cur.ebitda, py.ebitda), patYoY: pct(cur.pat, py.pat), ocfYoY: pct(cur.ocf, py.ocf),
    conv: num(cur.ocf) != null && cur.ebitda ? (cur.ocf / cur.ebitda) * 100 : null,
    convPy: num(py.ocf) != null && py.ebitda ? (py.ocf / py.ebitda) * 100 : null,
    fcf: num(cur.ocf) != null && num(cur.capex) != null ? cur.ocf - cur.capex : null,
    lev: num(cur.netDebt) != null && ttm ? cur.netDebt / ttm : null,
    levBase: num(p.priorFY?.netDebt) != null && num(p.priorFY?.ebitda) ? p.priorFY.netDebt / p.priorFY.ebitda : null,
    ccc: ccc(cur), cccPy: ccc(py),
    record: marginsSeen.length ? Math.max(...marginsSeen) : null,
    ytdMargin: margin(p.ytd),
    ytdRevYoY: p.ytd ? pct(p.ytd.revenue, p.ytd.revenuePy) : null,
  };
  k.mBps = k.m != null && k.mPy != null ? (k.m - k.mPy) * 100 : null;
  if (p.consensus) k.vsCons = { rev: pct(cur.revenue, p.consensus.revenue), ebitda: pct(cur.ebitda, p.consensus.ebitda), pat: pct(cur.pat, p.consensus.pat), margin: num(p.consensus.ebitda) && num(p.consensus.revenue) ? (p.consensus.ebitda / p.consensus.revenue) * 100 : null };
  return k;
}

// Margin needed in the rest of the year to reach the bottom of FY margin guidance.
export function implied(p, k = kpis(p)) {
  const g = (p.commitments || []).find((c) => c.kind === 'guidance' && c.metric === 'ebitdaMargin' && num(c.target?.low) != null);
  if (!g || !p.ytd || !num(p.priorFY?.revenue) || !num(p.ytd.revenue)) return null;
  const rg = (p.commitments || []).find((c) => c.kind === 'guidance' && c.metric === 'revenueGrowth' && num(c.target?.low) != null);
  const growths = rg ? [rg.target.low, (rg.target.low + (rg.target.high ?? rg.target.low)) / 2, rg.target.high ?? rg.target.low] : [k.ytdRevYoY ?? k.revYoY];
  const rows = growths.map((gr) => {
    const fyRev = p.priorFY.revenue * (1 + gr / 100);
    const restRev = fyRev - p.ytd.revenue;
    return { growth: r1(gr), fyRev, restRev, need: restRev > 0 ? ((g.target.low / 100) * fyRev - p.ytd.ebitda) / restRev * 100 : null };
  });
  const mid = rows[Math.floor(rows.length / 2)];
  return { rows, need: mid.need, record: k.record, ytd: k.ytdMargin, ytdLabel: p.ytd.label || 'Year to date', low: g.target.low, high: g.target.high ?? g.target.low, guidanceId: g.id, period: g.period || 'the year' };
}

export function segmentTable(p) {
  return (p.segments || []).filter((s) => s.current).map((s, i) => {
    const c = s.current, y = s.priorYear || {};
    return { name: s.name, key: s.key || `S${i + 1}`, rev: c.revenue, m: c.margin, revPy: y.revenue, mPy: y.margin, mPq: s.priorQuarter?.margin,
      growth: pct(c.revenue, y.revenue), bps: num(c.margin) != null && num(y.margin) != null ? (c.margin - y.margin) * 100 : null };
  });
}

// ---------- commitment status: rules where the numbers allow, otherwise what the pack states ----------
export function commitmentStatus(p, k = kpis(p), imp = implied(p, k)) {
  const segs = Object.fromEntries(segmentTable(p).map((s) => [s.name.toLowerCase(), s]));
  return (p.commitments || []).map((c) => {
    let status = c.status || (c.kind === 'deflection' ? 'deflected' : 'unclear'), why = c.why || '', source = c.status ? 'stated' : 'none';
    const rule = (st, w) => { status = st; why = w; source = 'rule'; };
    const t = c.target || {};
    if (c.kind === 'deflection') rule('deflected', c.why || 'A question was deflected on the last call.');
    else if (c.metric === 'ebitdaMargin' && num(t.low) != null && k.m != null) {
      if (c.kind === 'statement') k.m < t.low ? rule('broken', `${c.metricLabel || 'EBITDA margin'} is ${r1(k.m)}%, below the ${t.low}% promised`) : rule('kept', `Margin ${r1(k.m)}% is at or above ${t.low}%`);
      else if (imp && imp.need != null) imp.need > (imp.record ?? 0) + 0.5 ? rule('at-risk', `${imp.ytdLabel} margin ${r1(imp.ytd)}%; the bottom of the range needs about ${r1(imp.need)}% for the rest of the year, above the ${r1(imp.record)}% best quarter`) : rule('on-track', `The rest of the year needs about ${r1(imp.need)}%, within reach of the ${r1(imp.record)}% best quarter`);
      else k.m < t.low ? rule('at-risk', `Quarter margin ${r1(k.m)}% is below the ${t.low}% floor`) : rule('on-track', `Quarter margin ${r1(k.m)}% is inside the range`);
    } else if (c.metric === 'revenueGrowth' && num(t.low) != null) {
      const g = k.ytdRevYoY ?? k.revYoY;
      if (g != null) g < t.low - 0.5 ? rule('at-risk', `Growth ${r1(g)}% is below the ${t.low}% floor`) : rule('on-track', `Growth ${r1(g)}% (${k.ytdRevYoY != null ? 'year to date' : 'this quarter'})`);
    } else if (c.metric === 'netDebtToEbitda' && num(t.high) != null && k.lev != null) {
      k.lev > t.high ? rule('broken', `${k.lev.toFixed(2)}x is above the ${t.high}x ceiling`) : k.lev > 0.75 * t.high ? rule('at-risk', `${k.lev.toFixed(2)}x and rising${k.levBase != null ? `, from ${k.levBase.toFixed(2)}x` : ''}`) : rule('on-track', `${k.lev.toFixed(2)}x against a ${t.high}x ceiling`);
    } else if (c.metric === 'capex' && num(t.value) && p.ytd && num(p.ytd.capex) != null) {
      const share = p.ytd.capex / t.value, elapsed = (p.ytd.quartersElapsed || 2) / 4;
      share > elapsed + 0.15 ? rule('at-risk', `${p.ytd.capex} spent so far against about ${t.value} for the year`) : rule('on-track', `${p.ytd.capex} spent so far against about ${t.value}`);
    } else if (c.metric === 'segmentEbit' && c.segment && segs[c.segment.toLowerCase()]) {
      const s = segs[c.segment.toLowerCase()];
      if (num(s.m) != null) s.m < (t.low ?? 0) && (s.mPy == null || s.m <= s.mPy) ? rule('at-risk', `${s.name} EBIT margin ${s.m}%${s.mPy != null ? ` vs ${s.mPy}% a year ago` : ''}`) : rule('on-track', `${s.name} EBIT margin ${s.m}%`);
    } else if (c.metric === 'workingCapital' && k.ccc != null && k.cccPy != null && c.kind === 'statement') {
      k.ccc > k.cccPy ? rule('broken', `Cash conversion cycle ${k.cccPy} to ${k.ccc} days`) : rule('kept', `Cash conversion cycle ${k.cccPy} to ${k.ccc} days`);
    }
    return { ...c, status, why, statusSource: source };
  });
}

// ---------- pressure map: magnitude x salience x credibility x recurrence ----------
const KW = {
  guidance: ['guidance', 'band', 'range', 'full-year', 'full year', 'outlook'], margin: ['margin', 'ebitda'], cash: ['cash', 'working capital', 'inventory', 'receivable'],
  leverage: ['net debt', 'leverage', 'debt'], consensus: ['consensus', 'estimate', 'street'], capex: ['capex', 'capital expenditure'], revenue: ['revenue', 'growth', 'sales'],
};
function analystLines(p, words) {
  return (p.transcript || []).filter((l) => /analyst/i.test(l.speaker || '') && words.some((w) => l.text.toLowerCase().includes(w))).map((l) => l.ref);
}
export function pressureMap(p, k = kpis(p), imp = implied(p, k), cs = commitmentStatus(p, k, imp)) {
  const P = [];
  const byMetric = (...ms) => cs.filter((c) => ms.includes(c.metric)).map((c) => c.id);
  const units = p.company.units || '';
  if (imp && imp.need != null) P.push({ id: 'guidance', theme: 'Guidance', title: `${p.company.fyLabel || 'Full-year'} margin guidance ${imp.need > (imp.record ?? 0) ? 'is out of reach' : 'is under pressure'}`,
    evidence: `${imp.ytdLabel} margin ${r1(imp.ytd)}%. The bottom of the ${imp.low} to ${imp.high}% range needs about ${r1(imp.need)}% for the rest of the year; the best quarter on record is ${r1(imp.record)}%.`,
    magnitude: clamp(imp.need > imp.record ? imp.need - imp.record : (imp.need - k.m) / 3), salience: 1.0, ties: byMetric('ebitdaMargin'), kw: [...KW.guidance, 'margin'], owner: 'CFO', template: 'guidance' });
  if (k.mBps != null && k.mBps < -25) P.push({ id: 'margin', theme: 'Margin', title: `EBITDA margin down ${Math.round(-k.mBps)} bps${k.revYoY > 0 ? ` despite ${Math.round(k.revYoY)}% growth` : ''}`,
    evidence: `EBITDA margin ${r1(k.m)}% vs ${r1(k.mPy)}%. EBITDA ${r1(k.ebitdaYoY)}%${k.patYoY != null ? `; PAT ${r1(k.patYoY)}%` : ''}.`,
    magnitude: clamp(-k.mBps / 300), salience: 0.95, ties: cs.filter((c) => c.metric === 'ebitdaMargin' && c.kind === 'statement').map((c) => c.id), kw: KW.margin, owner: 'CFO', template: 'margin' });
  if (k.ocfYoY != null && (k.ocfYoY < -10 || (k.conv != null && k.convPy != null && k.conv < k.convPy - 10))) P.push({ id: 'cash', theme: 'Cash', title: 'Operating cash flow and conversion fell',
    evidence: `OCF ${k.cur.ocf} vs ${k.py.ocf} ${units} (${r1(k.ocfYoY)}%).${k.conv != null ? ` OCF/EBITDA ${Math.round(k.conv)}% vs ${Math.round(k.convPy)}%.` : ''}${k.ccc != null && k.cccPy != null ? ` Cash cycle ${k.cccPy} to ${k.ccc} days.` : ''}`,
    magnitude: clamp(-k.ocfYoY / 50), salience: 0.9, ties: byMetric('workingCapital', 'cashFlow'), kw: KW.cash, owner: 'CFO', template: 'cash' });
  if (k.lev != null && k.cur.netDebt > 0) P.push({ id: 'leverage', theme: 'Balance sheet', title: 'Leverage against the balance-sheet ceiling',
    evidence: `Net debt ${k.cur.netDebt} ${units}; ${k.lev.toFixed(2)}x ${k.ttmAnnualised ? 'annualised' : 'trailing'} EBITDA${k.levBase != null ? ` vs ${k.levBase.toFixed(2)}x at year end` : ''}.${k.fcf != null ? ` FCF ${k.fcf} ${units}.` : ''}`,
    magnitude: clamp(k.lev / (cs.find((c) => c.metric === 'netDebtToEbitda')?.target?.high || 1.5)), salience: 0.85, ties: byMetric('netDebtToEbitda'), kw: KW.leverage, owner: 'CFO', template: 'leverage' });
  if (k.vsCons?.ebitda != null && k.vsCons.ebitda < -2) P.push({ id: 'consensus', theme: 'Consensus', title: `EBITDA ${r1(-k.vsCons.ebitda)}% below consensus`,
    evidence: `Revenue ${r1(k.vsCons.rev)}% vs consensus; EBITDA ${r1(k.vsCons.ebitda)}%${k.vsCons.pat != null ? `; PAT ${r1(k.vsCons.pat)}%` : ''}.`,
    magnitude: clamp(-k.vsCons.ebitda / 10), salience: 0.85, ties: [], kw: KW.consensus, owner: 'CFO', template: 'consensus' });
  for (const s of segmentTable(p)) {
    if (s.bps == null) continue;
    const be = cs.find((c) => c.metric === 'segmentEbit' && (c.segment || '').toLowerCase() === s.name.toLowerCase());
    if (s.bps < -100 || (s.m < 0 && be)) P.push({ id: `seg-${s.key}`, theme: 'Segments', title: s.m < 0 ? `${s.name} losses ${be ? 'against a breakeven promise' : 'widening'}` : `${s.name} margin down ${Math.round(-s.bps)} bps`,
      evidence: `${s.name} EBIT margin ${s.m}% vs ${s.mPy}%${s.growth != null ? `, revenue ${s.growth > 0 ? '+' : ''}${r1(s.growth)}%` : ''}.`,
      magnitude: clamp(-s.bps / (s.m < 0 ? 600 : 300)), salience: 0.7, ties: be ? [be.id] : [], kw: [s.name.toLowerCase().split(' ')[0]], owner: s.owner || 'CEO', template: 'segment', segment: s });
  }
  const capex = cs.find((c) => c.metric === 'capex' && c.target?.value);
  if (capex && p.ytd?.capex != null) P.push({ id: 'capex', theme: 'Capital allocation', title: 'Capex against plan',
    evidence: `${p.ytd.label || 'Year to date'} capex ${p.ytd.capex} ${units} against about ${capex.target.value} for the year (${Math.round((p.ytd.capex / capex.target.value) * 100)}%).`,
    magnitude: clamp((p.ytd.capex / capex.target.value - (p.ytd.quartersElapsed || 2) / 4) / 0.3), salience: 0.6, ties: [capex.id], kw: KW.capex, owner: 'CFO', template: 'capex' });
  if (k.patYoY != null && k.patYoY <= -15) P.push({ id: 'profit', theme: 'Profit', title: `PAT down ${r1(-k.patYoY)}%`,
    evidence: `PAT ${k.cur.pat} vs ${k.py.pat} ${units}${k.revYoY != null ? `, while revenue moved ${k.revYoY > 0 ? '+' : ''}${r1(k.revYoY)}%` : ''}.`,
    magnitude: clamp(-k.patYoY / 50), salience: 0.85, ties: [], kw: ['profit', 'pat', 'tax', 'interest', 'depreciation'], owner: 'CFO', template: 'profit' });
  if (k.mPq != null && k.m != null && (k.m - k.mPq) * 100 < -50) P.push({ id: 'margin-qoq', theme: 'Margin', title: `Margin down ${Math.round((k.mPq - k.m) * 100)} bps on last quarter`,
    evidence: `EBITDA margin ${r1(k.m)}% vs ${r1(k.mPq)}% last quarter.`, magnitude: clamp((k.mPq - k.m) * 100 / 300) * 0.8, salience: 0.8, ties: [], kw: KW.margin, owner: 'CFO', template: 'marginQoq' });
  if (k.revYoY != null && k.revYoY < 0) P.push({ id: 'revenue', theme: 'Growth', title: `Revenue down ${r1(-k.revYoY)}%`, evidence: `Revenue ${k.cur.revenue} vs ${k.py.revenue} ${units}.`,
    magnitude: clamp(-k.revYoY / 20), salience: 0.8, ties: byMetric('revenueGrowth'), kw: KW.revenue, owner: 'CEO', template: 'revenue' });
  // Broken statements and deflections that no metric item already carries get their own item.
  const tied = new Set(P.flatMap((x) => x.ties));
  for (const c of cs.filter((c) => c.kind === 'guidance' && c.statusSource !== 'rule' && !tied.has(c.id))) {
    P.push({ id: `g-${c.id}`, theme: 'Guidance', title: `Guidance on record: ${c.topic || c.metricLabel || c.said.slice(0, 60)}`, evidence: c.said, magnitude: 0.5, salience: 0.8, ties: [c.id],
      kw: (c.topic || c.said).toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 4), owner: c.by === 'CEO' ? 'CEO' : 'CFO', template: 'guidanceAsk', commitment: c });
    tied.add(c.id);
  }
  for (const c of cs.filter((c) => (c.status === 'broken' || c.status === 'deflected') && !tied.has(c.id))) {
    P.push({ id: `c-${c.id}`, theme: c.kind === 'deflection' ? 'Candour' : 'Credibility', title: c.kind === 'deflection' ? `A question deflected last time: ${c.topic || c.metricLabel || 'it will come back'}` : `A statement that did not hold: ${c.topic || c.metricLabel || c.id}`,
      evidence: `${c.said}${c.why ? `. Now: ${c.why}` : ''}`, magnitude: 0.8, salience: 0.85, ties: [c.id], kw: (c.topic || c.said).toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 4), owner: c.by === 'CEO' ? 'CEO' : 'CFO', template: c.kind === 'deflection' ? 'deflection' : 'statement', commitment: c });
  }
  const cmap = Object.fromEntries(cs.map((c) => [c.id, c]));
  for (const x of P) {
    const st = x.ties.map((t) => cmap[t]?.status);
    x.credibility = st.includes('broken') ? 1.5 : st.includes('at-risk') ? 1.25 : 1.0;
    x.recurrent = [...new Set([...x.ties.map((t) => cmap[t]?.askedRef).filter(Boolean), ...analystLines(p, x.kw)])].slice(0, 3);
    x.recurrence = st.includes('deflected') ? 1.3 : x.recurrent.length ? 1.2 : 1.0;
    x.score = x.magnitude * x.salience * x.credibility * x.recurrence;
  }
  P.sort((a, b) => b.score - a.score);
  const top = P[0]?.score || 1;
  P.forEach((x, i) => { x.rank = i + 1; x.level = x.score >= 0.75 * top ? 'red' : x.score >= 0.45 * top ? 'amber' : 'green'; });
  return P;
}

// ---------- questions from rules, for packs that bring none ----------
const PERSONA_BY = { guidance: 'auditor', margin: 'hawk', cash: 'cash', leverage: 'credit', consensus: 'hawk', segment: 'segment', capex: 'governance', deflection: 'credit', statement: 'auditor', revenue: 'hawk' };
export function generateQuestions(p, P, k, imp, cs) {
  const cmap = Object.fromEntries(cs.map((c) => [c.id, c]));
  const said = (ids) => ids.map((i) => cmap[i]).filter(Boolean);
  const u = p.company.unitWord || (p.company.units || '').split(' ').pop();
  const qt = (x) => `\u201c${String(x).replace(/["\u201c\u201d]/g, '')}\u201d`;
  return P.slice(0, 10).map((x, i) => {
    const id = `G${String(i + 1).padStart(2, '0')}`;
    const owed = said(x.ties).filter((c) => ['broken', 'at-risk', 'deflected'].includes(c.status));
    const quote = owed.find((c) => c.kind !== 'guidance') || owed[0];
    let text, trap, terms, keyFigures = [];
    switch (x.template) {
      case 'guidance':
        text = `You guided to an EBITDA margin of ${imp.low} to ${imp.high}% for ${imp.period}. ${imp.ytdLabel} is at ${r1(imp.ytd)}%, so reaching even the bottom needs about ${r1(imp.need)}% for the rest of the year, against a best quarter of ${r1(imp.record)}%.${quote && quote.kind === 'statement' ? ` Last time you said ${qt(quote.said)}.` : ''} Are you withdrawing the margin guidance?`;
        trap = 'Defending the range invites a follow-up you cannot win; a new range given on the call is guidance without a filing.'; terms = ['guidance', 'margin', 'range', 'band']; keyFigures = [imp.ytd, imp.need, imp.record]; break;
      case 'margin':
        text = `Revenue ${k.revYoY >= 0 ? 'grew' : 'fell'} ${r1(Math.abs(k.revYoY))}% but EBITDA margin fell ${Math.round(-k.mBps)} basis points to ${r1(k.m)}%. What drove the decline, in numbers, and how much of it is structural?`;
        trap = 'A vague "input costs" answer. The analyst has built the bridge and will check yours against it.'; terms = ['margin', 'basis points', 'bps']; keyFigures = [Math.round(-k.mBps), r1(k.m)]; break;
      case 'cash':
        text = `Operating cash flow was ${k.cur.ocf} ${u} against ${k.py.ocf} a year ago${k.conv != null ? `, and cash conversion fell to ${Math.round(k.conv)}% of EBITDA` : ''}.${quote ? ` You said ${qt(quote.said)}.` : ''} What happened to working capital, and why should we believe the next date?`;
        trap = 'Giving a new date. A second missed date is worse than none.'; terms = ['cash', 'working capital']; keyFigures = [k.cur.ocf, k.py.ocf]; break;
      case 'leverage':
        text = `Net debt is ${k.cur.netDebt} ${u}, ${k.lev.toFixed(2)} times EBITDA${quote ? `, against your commitment of ${qt(quote.said)}` : ''}. How much headroom is left, and what gives first if it narrows: capex or the dividend?`;
        trap = 'A flat "no risk" without showing what has to go right.'; terms = ['net debt', 'leverage', 'headroom']; keyFigures = [k.cur.netDebt, +k.lev.toFixed(2)]; break;
      case 'consensus':
        text = `EBITDA came in ${r1(-k.vsCons.ebitda)}% below consensus while revenue was ${r1(Math.abs(k.vsCons.rev))}% ${k.vsCons.rev >= 0 ? 'above' : 'below'}. Was the street wrong on margins, or did something change inside the quarter?`;
        trap = 'Blaming the analysts. They modelled what management told them.'; terms = ['consensus', 'ebitda', 'street']; keyFigures = [k.cur.ebitda]; break;
      case 'segment': {
        const s = x.segment;
        text = s.m < 0 ? `${s.name} posted an EBIT margin of ${s.m}% against ${s.mPy}% a year ago.${quote ? ` You promised ${qt(quote.said)}.` : ''} Is that still realistic, and how much more capital will this business need?` : `${s.name} margin fell from ${s.mPy}% to ${s.m}%. Is this pricing, cost or mix, and is the segment still core?`;
        trap = s.m < 0 ? 'Reaffirming the promise to protect the segment when the trend says otherwise.' : 'Claiming share gains or price rises that are not in the disclosures.'; terms = [s.name.toLowerCase().split(' ')[0], 'margin']; keyFigures = [s.m, s.mPy]; break;
      }
      case 'capex': {
        const c = cs.find((y) => y.metric === 'capex');
        text = `You have spent ${p.ytd.capex} ${u} of capex so far against guidance of about ${c.target.value} for the year. Is capex going up, and why keep spending if cash flow is weak?`;
        trap = 'Announcing a new capex number on the call.'; terms = ['capex']; keyFigures = [p.ytd.capex, c.target.value]; break;
      }
      case 'profit':
        text = `PAT fell ${r1(-k.patYoY)}% to ${k.cur.pat} ${u} while revenue ${k.revYoY >= 0 ? 'grew' : 'fell'} ${r1(Math.abs(k.revYoY))}%. What sits between EBITDA and PAT: depreciation, interest, tax or one-offs, and which of them will recur?`;
        trap = 'Blaming one-offs the notes do not show, or promising a profit recovery date.'; terms = ['pat', 'profit']; keyFigures = [k.cur.pat]; break;
      case 'marginQoq':
        text = `EBITDA margin slipped from ${r1(k.mPq)}% last quarter to ${r1(k.m)}%. Is this seasonal, or is the trend turning?`;
        trap = 'Calling it seasonal without the year-ago comparison to back it.'; terms = ['margin', 'quarter']; keyFigures = [r1(k.mPq), r1(k.m)]; break;
      case 'guidanceAsk':
        text = `You have guided to ${qt(x.commitment.said)}. What has to go right to deliver it, and what would make you change it?`;
        trap = 'Adding precision beyond the stated guidance: that is new guidance.'; terms = ['guidance', 'deliver']; break;
      case 'revenue':
        text = `Revenue fell ${r1(-k.revYoY)}% to ${k.cur.revenue} ${u}. Is this market, share or timing, and what does it mean for the full year?`;
        trap = 'Promising a recovery date or a number that is not in the guidance.'; terms = ['revenue']; keyFigures = [k.cur.revenue]; break;
      case 'deflection':
        text = `Last time you were asked about this and said ${qt(x.commitment.said)}.${x.commitment.why ? ` ${x.commitment.why}.` : ''} Why was it not shared then, and what will you disclose from now on?`;
        trap = 'Repeating the deflection, or arguing the earlier answer was fine.'; terms = (x.kw || []).slice(0, 3); break;
      default:
        text = `Last quarter you said ${qt(x.commitment.said)}.${x.commitment.why ? ` ${x.commitment.why}.` : ''} What changed, and why should we believe the next commitment?`;
        trap = 'Explaining it away. Own what was said, then what happened, then what changes.'; terms = (x.kw || []).slice(0, 3);
    }
    return { id, pressure: x.id, theme: x.theme, persona: PERSONA_BY[x.template] || 'hawk', owner: x.owner, difficulty: x.level === 'red' ? 'Hard' : x.level === 'amber' ? 'Medium' : 'Easy',
      text, trap, cites: [...owed.map((c) => c.ref).filter(Boolean), ...x.recurrent].slice(0, 3), mustAck: owed.map((c) => c.id), terms, keyFigures: keyFigures.filter((v) => num(v) != null),
      followup: 'What exactly will you report next quarter so we can check that?', generated: true };
  }).concat(standardQuestions(p, k, u, Math.min(P.length, 10)));
}

// Questions every call gets, grounded in this pack's figures, so a company with few pressure points
// still gets a full bank. They sit after the pressure-driven ones.
function standardQuestions(p, k, u, start) {
  const Q = [];
  const add = (theme, persona, text, trap, terms, keyFigures = []) => Q.push({ id: `G${String(start + Q.length + 1).padStart(2, '0')}`, pressure: null, theme, persona, owner: theme === 'Outlook' ? 'CEO' : 'CFO', difficulty: 'Medium', text, trap, cites: [], mustAck: [], terms, keyFigures: keyFigures.filter((v) => num(v) != null), followup: 'What would change your view?', generated: true });
  add('Outlook', 'hawk', 'How should we think about the next quarter: demand, pricing and margins?', 'Any number not already in guidance is new guidance given on the fly. Describe drivers, not figures.', ['next quarter', 'demand', 'outlook']);
  if (k.revYoY != null && k.revYoY > 0) add('Growth', 'segment', `Revenue grew ${r1(k.revYoY)}%. How much of that was price and how much volume, and how sustainable is it?`, 'Quoting a price or volume split that is not in the disclosures.', ['price', 'volume', 'growth'], [r1(k.revYoY)]);
  if (num(k.cur.netDebt) || num(k.cur.capex)) add('Capital allocation', 'governance', `${num(k.cur.netDebt) ? (k.cur.netDebt > 0 ? `Net debt is ${k.cur.netDebt} ${u}` : `You hold net cash of ${-k.cur.netDebt} ${u}`) : `Capex was ${k.cur.capex} ${u} this quarter`}. What are the priorities between capex, debt reduction and returns to shareholders?`, 'Promising a dividend or buyback the board has not approved.', ['capex', 'debt', 'dividend'], [num(k.cur.netDebt) ? k.cur.netDebt : k.cur.capex]);
  if (k.mBps != null && k.mBps >= -25) add('Margin', 'hawk', `EBITDA margin was ${r1(k.m)}% against ${r1(k.mPy)}% a year ago. What protects it if input costs or pricing turn against you?`, 'Promising a margin floor that is not in guidance.', ['margin', 'cost', 'pricing'], [r1(k.m), r1(k.mPy)]);
  return Q;
}

// ---------- facts: every number the pack discloses, with what it is ----------
export function factSet(p, k, imp, segs) {
  const F = [];
  const add = (v, label) => { if (num(v) != null) F.push({ v: Math.abs(v), label }); };
  const per = (x, name) => { if (!x) return; for (const f of PERIOD_FIELDS) add(x[f], `${name} ${f === 'ocf' ? 'operating cash flow' : f === 'pat' ? 'PAT' : f === 'ebitda' ? 'EBITDA' : f === 'netDebt' ? 'net debt' : f === 'da' ? 'D&A' : f.replace('Days', ' days')}`); add(margin(x), `${name} EBITDA margin`); };
  per(k.cur, 'current'); per(k.py, 'prior year'); per(k.pq, 'prior quarter');
  for (const h of p.history || []) { add(h.revenue, `${h.label} revenue`); add(h.ebitda, `${h.label} EBITDA`); add(margin(h), `${h.label} EBITDA margin`); add(h.ocf, `${h.label} operating cash flow`); add(h.capex, `${h.label} capex`); }
  if (p.priorFY) { add(p.priorFY.revenue, 'prior FY revenue'); add(p.priorFY.ebitda, 'prior FY EBITDA'); add(p.priorFY.netDebt, 'prior FY net debt'); add(margin(p.priorFY), 'prior FY EBITDA margin'); }
  if (p.ytd) { add(p.ytd.revenue, 'YTD revenue'); add(p.ytd.ebitda, 'YTD EBITDA'); add(p.ytd.capex, 'YTD capex'); add(margin(p.ytd), 'YTD margin'); add(k.ytdRevYoY, 'YTD revenue growth'); }
  for (const s of segs) { add(s.rev, `${s.name} revenue`); add(s.revPy, `${s.name} prior revenue`); add(s.m, `${s.name} EBIT margin`); add(s.mPy, `${s.name} prior margin`); add(s.mPq, `${s.name} prior-quarter margin`); add(s.growth, `${s.name} growth`); add(s.bps, `${s.name} margin change bps`); if (num(s.rev) && num(s.m) != null) add((s.rev * s.m) / 100, `${s.name} EBIT`); }
  for (const [key, lab] of Object.entries({ revYoY: 'revenue growth', revQoQ: 'revenue QoQ', m: 'EBITDA margin', mPy: 'prior EBITDA margin', mBps: 'margin change bps', ebitdaYoY: 'EBITDA change', patYoY: 'PAT change', ocfYoY: 'operating cash flow change', conv: 'cash conversion', convPy: 'prior cash conversion', fcf: 'free cash flow', lev: 'net debt / EBITDA', levBase: 'net debt / EBITDA at year end', ccc: 'cash cycle days', cccPy: 'prior cash cycle days', ttm: 'TTM EBITDA', record: 'record margin', ytdMargin: 'YTD margin' })) add(k[key], lab);
  if (k.mBps != null) add(k.mBps / 100, 'margin change pts');
  if (k.ccc != null && k.cccPy != null) add(k.ccc - k.cccPy, 'cash cycle change days');
  if (num(k.cur.invDays) && num(k.py.invDays)) add(k.cur.invDays - k.py.invDays, 'inventory days change');
  if (num(k.cur.recDays) && num(k.py.recDays)) add(k.cur.recDays - k.py.recDays, 'receivable days change');
  if (num(k.cur.netDebt) && num(p.priorFY?.netDebt)) add(k.cur.netDebt - p.priorFY.netDebt, 'net debt increase');
  if (p.consensus) { add(p.consensus.revenue, 'consensus revenue'); add(p.consensus.ebitda, 'consensus EBITDA'); add(p.consensus.pat, 'consensus PAT'); add(k.vsCons?.margin, 'consensus margin'); for (const [x, v] of Object.entries(k.vsCons || {})) add(v, `vs consensus ${x}`); }
  for (const b of p.bridge || []) add(b.bps, `bridge: ${b.driver}`);
  for (const c of p.commitments || []) { const t = c.target || {}; for (const v of [t.low, t.high, t.value]) add(v, `guidance ${c.id}`); }
  if (imp) for (const r of imp.rows) { add(r.need, 'implied margin needed'); add(r.restRev, 'remaining revenue'); add(r.growth, 'guidance growth'); }
  // Any figure written in the notes, transcript or commitments is disclosed too.
  const texts = [...(p.notes || []).map((x) => [x.text, `note ${x.ref}`]), ...(p.transcript || []).map((x) => [x.text, `transcript ${x.ref}`]), ...(p.commitments || []).map((c) => [c.said + ' ' + (c.why || ''), `commitment ${c.id}`])];
  for (const [t, lab] of texts) for (const m of String(t).matchAll(/(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)/g)) { const v = parseFloat(m[1].replace(/,/g, '')); if (!(v >= 1900 && v <= 2100)) add(v, lab); }
  return F;
}

// ---------- the context every screen renders from ----------
export function analyze(p) {
  normalizePack(p);
  const k = kpis(p);
  const imp = implied(p, k);
  const cs = commitmentStatus(p, k, imp);
  const P = pressureMap(p, k, imp, cs);
  const segs = segmentTable(p);
  const questions = p.questions?.length ? p.questions : generateQuestions(p, P, k, imp, cs);
  const sources = {};
  for (const l of p.transcript || []) sources[l.ref] = `${l.call ? l.call + '. ' : ''}${p.company.speakers?.[l.speaker] || l.speaker}: "${l.text}"`;
  for (const n of p.notes || []) sources[n.ref] = `Notes: ${n.text}`;
  return { pack: p, k, imp, commitments: cs, pressure: P, segs, questions, facts: factSet(p, k, imp, segs), sources };
}

// ---------- rules check of an extraction against its source document ----------
const norm = (s) => String(s).toLowerCase().replace(/[‘’“”"']/g, '').replace(/\s+/g, ' ').trim();
function numberForms(v) {
  const a = Math.abs(v), out = new Set([String(a), a.toFixed(1), a.toFixed(2)]);
  if (Number.isInteger(a)) { out.add(a.toLocaleString('en-IN')); out.add(a.toLocaleString('en-US')); }
  else { out.add(a.toLocaleString('en-IN', { maximumFractionDigits: 2 })); out.add(a.toLocaleString('en-US', { maximumFractionDigits: 2 })); }
  return [...out].filter((x) => x !== '0' && x !== '0.0');
}
export function verifyAgainstSource(p, sourceText) {
  const src = norm(sourceText).replace(/(\d),(\d)/g, '$1$2');
  const has = (v) => numberForms(v).some((f) => src.includes(f.replace(/,/g, '')));
  const checks = [];
  const check = (path, v) => { if (num(v) != null) checks.push({ path, value: v, found: has(v) }); };
  for (const [name, per] of Object.entries(p.periods || {})) for (const f of PERIOD_FIELDS) check(`periods.${name}.${f}`, per?.[f]);
  for (const f of ['revenue', 'ebitda', 'netDebt']) check(`priorFY.${f}`, p.priorFY?.[f]);
  for (const f of ['revenue', 'ebitda', 'capex', 'revenuePy']) check(`ytd.${f}`, p.ytd?.[f]);
  (p.segments || []).forEach((s, i) => { for (const per of ['current', 'priorYear', 'priorQuarter']) for (const f of ['revenue', 'margin']) check(`segments.${i}.${per}.${f}`, s[per]?.[f]); });
  for (const f of ['revenue', 'ebitda', 'pat']) check(`consensus.${f}`, p.consensus?.[f]);
  const quotes = (p.commitments || []).map((c) => ({ id: c.id, found: src.includes(norm(c.said).replace(/(\d),(\d)/g, '$1$2')) }));
  const lines = (p.transcript || []).map((l) => ({ ref: l.ref, found: src.includes(norm(l.text).replace(/(\d),(\d)/g, '$1$2').slice(0, 80)) }));
  const nOk = checks.filter((c) => c.found).length;
  return { checks, quotes, lines, numbersFound: nOk, numbersTotal: checks.length, quotesFound: quotes.filter((q) => q.found).length, linesFound: lines.filter((l) => l.found).length };
}
