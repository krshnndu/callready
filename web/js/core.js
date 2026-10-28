// Pack-agnostic engine. Every screen runs on a pack in the callready.pack.v1 format, whether it is the
// shipped sample, a JSON upload or an AI extraction from a results document. Rules only: no model here.

export const SCHEMA = 'callready.pack.v1';
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const pct = (a, b) => (num(a) != null && num(b) ? ((a - b) / Math.abs(b)) * 100 : null);
const clamp = (x) => Math.max(0, Math.min(1, x || 0));
const r1 = (x) => Math.round(x * 10) / 10;
// Quarters elapsed in the financial year, from a label like "Q3 FY27".
export const quarterNum = (label) => { const m = /Q([1-4])/i.exec(label || ''); return m ? Number(m[1]) : null; };
export const margin = (p) => (p && num(p.revenue) && num(p.ebitda) != null ? (p.ebitda / p.revenue) * 100 : null);

// ---------- validation ----------
export const PERIOD_FIELDS = ['revenue', 'ebitda', 'ebit', 'pat', 'ocf', 'capex', 'netDebt', 'da', 'invDays', 'recDays', 'payDays', 'pbt', 'financeCost', 'otherIncome'];

// ---------- Layer 1: sanitise untrusted packs (uploads, AI extraction, files, saved state) ----------
// A schema walk: every field is forced to its type, strings are length-capped, lists are count-capped,
// and source URLs must be http(s). Nothing downstream ever sees a value of the wrong type.
const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = v.replace(/[,\s₹%]/g, '').replace(/^\((.*)\)$/, '-$1'); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; }
  return null;
};
const toStr = (v, max) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').slice(0, max);
const ENUMS_ = () => ({ kind: ['guidance', 'statement', 'deflection'], metric: METRICS, status: ['on-track', 'kept', 'at-risk', 'broken', 'unclear', 'deflected'], source: ['sample', 'dataset', 'upload'], difficulty: ['Hard', 'Medium', 'Easy'] });
export function sanitizePack(raw) {
  const fixes = [];
  const note = (path, why) => fixes.push(`${path}: ${why}`);
  const num = (v, path) => { const n = toNum(v); if (v != null && v !== '' && n !== v) note(path, n == null ? 'not a number, cleared' : 'converted to a number'); return v == null || v === '' ? null : n; };
  const str = (v, max, path) => { const t = toStr(v, max); if (v != null && t !== v) note(path, typeof v === 'string' ? `cut to ${max} characters` : 'not text, cleared'); return t; };
  const list = (v, max, path, each) => { if (v == null) return []; if (!Array.isArray(v)) { note(path, 'not a list, cleared'); return []; } if (v.length > max) note(path, `capped at ${max} items`); return v.slice(0, max).map((x, i) => each(x && typeof x === 'object' ? x : {}, `${path}.${i}`)); };
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  const en = (v, set, path) => { if (v == null || v === '') return undefined; if (set.includes(v)) return v; note(path, 'not an allowed value, cleared'); return undefined; };
  const period = (x, path) => { x = obj(x); if (!x) return null; const o = { label: str(x.label, 40, `${path}.label`) }; if (x.period != null) o.period = str(x.period, 60, `${path}.period`); for (const f of PERIOD_FIELDS) o[f] = num(x[f], `${path}.${f}`); return o; };
  const p = obj(raw);
  if (!p) return { pack: { schema: SCHEMA, company: {}, periods: {} }, fixes: ['pack: not an object'] };
  const c = obj(p.company) || {};
  const speakers = {};
  for (const [k, v] of Object.entries(obj(c.speakers) || {}).slice(0, 8)) { const t = str(v, 80, `company.speakers.${k}`).trim(); if (t) speakers[toStr(k, 20)] = t; }
  const out = {
    schema: SCHEMA,
    id: /^[\w-]{1,60}$/.test(p.id || '') ? p.id : (p.id != null && note('id', 'not a safe id, replaced'), `pack-${Date.now().toString(36)}`),
    company: { name: str(c.name, 160, 'company.name'), short: str(c.short, 60, 'company.short'), quarter: str(c.quarter, 30, 'company.quarter'), period: str(c.period, 60, 'company.period'), units: str(c.units, 40, 'company.units'),
      unitWord: str(c.unitWord, 20, 'company.unitWord'), fyLabel: str(c.fyLabel, 12, 'company.fyLabel'), resultsDate: str(c.resultsDate, 20, 'company.resultsDate'), callDate: str(c.callDate, 20, 'company.callDate'),
      marginBasis: c.marginBasis === 'EBIT' ? 'EBIT' : undefined, synthetic: c.synthetic === true || undefined, speakers },
    periods: { current: period(p.periods?.current, 'periods.current'), priorYear: period(p.periods?.priorYear, 'periods.priorYear'), priorQuarter: period(p.periods?.priorQuarter, 'periods.priorQuarter') },
    history: list(p.history, 24, 'history', (x, path) => ({ label: str(x.label, 40, `${path}.label`), revenue: num(x.revenue, `${path}.revenue`), ebitda: num(x.ebitda, `${path}.ebitda`), ebit: num(x.ebit, `${path}.ebit`), ocf: num(x.ocf, `${path}.ocf`), capex: num(x.capex, `${path}.capex`) })),
    priorFY: obj(p.priorFY) ? { label: str(p.priorFY.label, 20, 'priorFY.label'), revenue: num(p.priorFY.revenue, 'priorFY.revenue'), ebitda: num(p.priorFY.ebitda, 'priorFY.ebitda'), netDebt: num(p.priorFY.netDebt, 'priorFY.netDebt') } : null,
    ytd: obj(p.ytd) ? { label: str(p.ytd.label, 30, 'ytd.label'), revenue: num(p.ytd.revenue, 'ytd.revenue'), ebitda: num(p.ytd.ebitda, 'ytd.ebitda'), capex: num(p.ytd.capex, 'ytd.capex'), revenuePy: num(p.ytd.revenuePy, 'ytd.revenuePy'), quartersElapsed: num(p.ytd.quartersElapsed, 'ytd.quartersElapsed') } : null,
    ttmEbitda: num(p.ttmEbitda, 'ttmEbitda'),
    segments: list(p.segments, 20, 'segments', (x, path) => {
      const sp = (y, q) => (obj(y) ? { revenue: num(y.revenue, `${q}.revenue`), margin: num(y.margin, `${q}.margin`) } : null);
      const seg = { name: str(x.name, 80, `${path}.name`), current: sp(x.current, `${path}.current`), priorYear: sp(x.priorYear, `${path}.priorYear`), priorQuarter: sp(x.priorQuarter, `${path}.priorQuarter`) };
      if (x.key != null) seg.key = str(x.key, 12, `${path}.key`); if (x.owner != null) seg.owner = str(x.owner, 12, `${path}.owner`);
      return seg;
    }),
    consensus: obj(p.consensus) ? { revenue: num(p.consensus.revenue, 'consensus.revenue'), ebitda: num(p.consensus.ebitda, 'consensus.ebitda'), pat: num(p.consensus.pat, 'consensus.pat'), source: str(p.consensus.source, 120, 'consensus.source') } : null,
    bridge: list(p.bridge, 12, 'bridge', (x, path) => ({ driver: str(x.driver, 120, `${path}.driver`), short: x.short != null ? str(x.short, 40, `${path}.short`) : undefined, bps: num(x.bps, `${path}.bps`) })),
    commitments: list(p.commitments, 40, 'commitments', (x, path) => {
      const t = obj(x.target);
      const o = { id: str(x.id, 12, `${path}.id`), kind: en(x.kind, ENUMS_().kind, `${path}.kind`), by: str(x.by, 40, `${path}.by`), said: str(x.said, 400, `${path}.said`), ref: str(x.ref, 40, `${path}.ref`),
        why: str(x.why, 300, `${path}.why`), metric: en(x.metric, ENUMS_().metric, `${path}.metric`) || 'other', status: en(x.status, ENUMS_().status, `${path}.status`), period: str(x.period, 30, `${path}.period`),
        date: str(x.date, 20, `${path}.date`), topic: str(x.topic, 80, `${path}.topic`), segment: x.segment != null ? str(x.segment, 80, `${path}.segment`) : undefined, askedRef: x.askedRef != null ? str(x.askedRef, 40, `${path}.askedRef`) : undefined,
        target: t ? { low: num(t.low, `${path}.target.low`), high: num(t.high, `${path}.target.high`), value: num(t.value, `${path}.target.value`) } : undefined,
        ack: x.ack != null ? list(x.ack, 20, `${path}.ack`, () => null).map((_, i) => toStr(x.ack[i], 40)) : undefined };
      if (o.status === undefined) delete o.status;
      return o;
    }),
    transcript: list(p.transcript, 300, 'transcript', (x, path) => ({ ref: str(x.ref, 40, `${path}.ref`), call: str(x.call, 120, `${path}.call`), speaker: str(x.speaker, 80, `${path}.speaker`), text: str(x.text, 1200, `${path}.text`) })),
    notes: list(p.notes, 60, 'notes', (x, path) => ({ ref: str(x.ref, 20, `${path}.ref`), text: str(x.text, 1200, `${path}.text`) })),
    remarks: str(p.remarks, 12000, 'remarks'),
  };
  if (p.unallocated != null) { out.unallocated = {}; for (const [k, v] of Object.entries(obj(p.unallocated) || {}).slice(0, 24)) out.unallocated[toStr(k, 30)] = num(v, `unallocated.${k}`); }
  if (p.questions != null) out.questions = list(p.questions, 40, 'questions', (x, path) => ({ id: str(x.id, 8, `${path}.id`), pressure: x.pressure == null ? null : str(x.pressure, 30, `${path}.pressure`), theme: str(x.theme, 40, `${path}.theme`), persona: str(x.persona, 20, `${path}.persona`), owner: str(x.owner, 12, `${path}.owner`),
    difficulty: en(x.difficulty, ENUMS_().difficulty, `${path}.difficulty`) || 'Medium', text: str(x.text, 900, `${path}.text`), trap: str(x.trap, 400, `${path}.trap`), cites: list(x.cites, 6, `${path}.cites`, () => null).map((_, i) => toStr(x.cites[i], 40)),
    mustAck: list(x.mustAck, 8, `${path}.mustAck`, () => null).map((_, i) => toStr(x.mustAck[i], 12)), terms: list(x.terms, 8, `${path}.terms`, () => null).map((_, i) => toStr(x.terms[i], 30)), keyFigures: list(x.keyFigures, 8, `${path}.keyFigures`, () => null).map((_, i) => toNum(x.keyFigures[i])).filter((v) => v != null),
    followup: str(x.followup, 400, `${path}.followup`), model: x.model != null ? str(x.model, 1500, `${path}.model`) : undefined, weak: x.weak != null ? str(x.weak, 1500, `${path}.weak`) : undefined, generated: x.generated === true || undefined }));
  if (p.personas != null) { out.personas = {}; for (const [k, v] of Object.entries(obj(p.personas) || {}).slice(0, 12)) { const o = obj(v) || {}; out.personas[toStr(k, 20)] = { name: str(o.name, 60, `personas.${k}.name`), firm: str(o.firm, 60, `personas.${k}.firm`), style: str(o.style, 120, `personas.${k}.style`) }; } }
  const pv = obj(p.provenance) || {};
  const urls = list(pv.urls, 10, 'provenance.urls', () => null).map((_, i) => toStr(pv.urls[i], 400));
  const safeUrls = urls.filter((u) => /^https?:\/\/[^\s"'<>]+$/i.test(u));
  if (safeUrls.length !== urls.length) note('provenance.urls', `${urls.length - safeUrls.length} non-http link(s) dropped`);
  out.provenance = { source: en(pv.source, ENUMS_().source, 'provenance.source') || 'upload', urls: safeUrls };
  for (const k of ['extractedBy', 'at', 'caveats', 'note']) if (pv[k] != null) out.provenance[k] = str(pv[k], k === 'caveats' ? 600 : 120, `provenance.${k}`);
  if (pv.policy === 'strict' || pv.policy === 'confirmed') out.provenance.policy = pv.policy;
  if (pv.removed != null) out.provenance.removed = list(pv.removed, 80, 'provenance.removed', () => null).map((_, i) => toStr(pv.removed[i], 160));
  if (pv.unverifiedKept != null) out.provenance.unverifiedKept = list(pv.unverifiedKept, 50, 'provenance.unverifiedKept', () => null).map((_, i) => toStr(pv.unverifiedKept[i], 120));
  if (pv.extractedSeconds != null) out.provenance.extractedSeconds = num(pv.extractedSeconds, 'provenance.extractedSeconds');
  if (pv.files != null) out.provenance.files = list(pv.files, 10, 'provenance.files', () => null).map((_, i) => toStr(pv.files[i], 120));
  if (pv.unverified != null) out.provenance.unverified = list(pv.unverified, 50, 'provenance.unverified', () => null).map((_, i) => toStr(pv.unverified[i], 120));
  if (obj(pv.verify)) { out.provenance.verify = {}; for (const [k, v] of Object.entries(pv.verify).slice(0, 8)) out.provenance.verify[toStr(k, 20)] = toNum(v) ?? 0; }
  for (const k of Object.keys(out.company)) if (out.company[k] === undefined) delete out.company[k];
  return { pack: out, fixes };
}

// Upload limits: what the browser will read and send for conversion.
export const UPLOAD = { maxFiles: 5, maxFileBytes: 20e6, maxTotalBytes: 40e6, types: /\.(pdf|txt|md)$/i };
export function uploadAllowed(files) {
  const fs = [...(files || [])];
  if (!fs.length) return { ok: false, reason: 'Choose at least one file, or paste text.' };
  if (fs.length > UPLOAD.maxFiles) return { ok: false, reason: `At most ${UPLOAD.maxFiles} files at a time.` };
  const bad = fs.find((f) => !UPLOAD.types.test(f.name || ''));
  if (bad) return { ok: false, reason: `${bad.name} is not a PDF or text file.` };
  const big = fs.find((f) => f.size > UPLOAD.maxFileBytes);
  if (big) return { ok: false, reason: `${big.name} is over ${UPLOAD.maxFileBytes / 1e6} MB.` };
  if (fs.reduce((t, f) => t + f.size, 0) > UPLOAD.maxTotalBytes) return { ok: false, reason: `The files together are over ${UPLOAD.maxTotalBytes / 1e6} MB.` };
  return { ok: true };
}

// Some companies report operating profit (EBIT) and no EBITDA. The margin checks then run on EBIT,
// and the pack says so, rather than the pack being rejected.
export function normalizePack(p) {
  const per = p?.periods || {};
  // EBITDA not printed (annual statements, some results formats): derive it by arithmetic from figures
  // that are, and record how. Operating EBITDA = PBT + finance costs + D&A - other income.
  // Normalising runs more than once (validate, analyze); the record of a derivation must survive it.
  p.derived = p.derived || [];
  for (const k of ['current', 'priorYear', 'priorQuarter']) {
    const x = per[k];
    if (!x || num(x.ebitda) != null || num(x.ebit) != null) continue;
    if ([x.pbt, x.financeCost, x.da].every((v) => num(v) != null)) {
      const oi = num(x.otherIncome) ?? 0;
      x.ebitda = Math.round((x.pbt + x.financeCost + x.da - oi) * 100) / 100;
      p.derived.push(`periods.${k}.ebitda = PBT + finance costs + D&A${oi ? ' - other income' : ''} (${x.pbt} + ${x.financeCost} + ${x.da}${oi ? ` - ${oi}` : ''})`);
    }
  }
  const usesEbit = ['current', 'priorYear'].every((k) => per[k] && per[k].ebitda == null && typeof per[k].ebit === 'number');
  if (usesEbit) {
    for (const x of [per.current, per.priorYear, per.priorQuarter, ...(p.history || [])]) if (x && x.ebitda == null && typeof x.ebit === 'number') x.ebitda = x.ebit;
    p.company = { ...(p.company || {}), marginBasis: 'EBIT' };
  }
  if (typeof p?.company?.units === 'string') p.company.units = p.company.units.split(/[;(]/)[0].trim();
  // A guidance range written backwards is swapped.
  for (const c of p?.commitments || []) { const t = c.target; if (t && num(t.low) != null && num(t.high) != null && t.low > t.high) [t.low, t.high] = [t.high, t.low]; }
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
  if (p.schema !== SCHEMA) errors.push(`“schema” must be “${SCHEMA}”.`);
  if (!p.company?.name) errors.push('company.name is missing.');
  if (!p.company?.quarter) errors.push('company.quarter is missing (for example “Q2 FY27”).');
  for (const k of ['current', 'priorYear']) {
    const per = p.periods?.[k];
    if (!per) { errors.push(`periods.${k} is missing.`); continue; }
    if (num(per.revenue) == null) errors.push(`periods.${k}.revenue must be a number.`);
    if (num(per.ebitda) == null) errors.push(`periods.${k}.ebitda is missing. The document must print EBITDA (or operating profit), or profit before tax, finance costs and depreciation so EBITDA can be derived. Type it in from the document if it is there.`);
  }
  if (!p.periods?.priorQuarter) warnings.push('No prior quarter: quarter-on-quarter figures are skipped.');
  // Layer 2: figures must make financial sense.
  for (const k of ['current', 'priorYear', 'priorQuarter']) {
    const per = p.periods?.[k]; if (!per) continue;
    if (num(per.revenue) != null && per.revenue <= 0) errors.push(`periods.${k}.revenue must be above zero.`);
    // A profit cannot exceed revenue; a loss can (Tejas Networks lost more than its revenue a year ago), so a
    // very large loss is only a units warning.
    for (const f of ['ebitda', 'ebit']) {
      if (num(per[f]) == null || !(num(per.revenue) > 0)) continue;
      const lab = f === 'ebit' ? 'EBIT' : 'EBITDA';
      if (per[f] > per.revenue) errors.push(`periods.${k}.${lab} (${per[f]}) cannot be larger than revenue (${per.revenue}): check the units.`);
      else if (per[f] < -3 * per.revenue) warnings.push(`periods.${k}.${lab} loss (${per[f]}) is over three times revenue (${per.revenue}): check the units.`);
    }
    for (const f of ['invDays', 'recDays', 'payDays']) if (num(per[f]) != null && (per[f] < 0 || per[f] > 730)) warnings.push(`periods.${k}.${f} of ${per[f]} days is outside 0 to 730 days.`);
  }
  for (const [i, sg] of (p.segments || []).entries()) for (const k of ['current', 'priorYear', 'priorQuarter']) { const m = sg?.[k]?.margin; if (num(m) != null && (m < -100 || m > 100)) errors.push(`segments.${i}.${k}.margin of ${m}% is outside -100 to 100%: margins are percentages.`); }
  { const cur = p.periods?.current; const base = num(p.ttmEbitda) ?? (num(cur?.ebitda) ? cur.ebitda * 4 : null); if (num(cur?.netDebt) != null && base > 0 && cur.netDebt > 20 * base) warnings.push(`Net debt of ${cur.netDebt} is above 20x EBITDA: check the units.`); }
  if (p.company?.quarter && !/^(Q[1-4]\s?)?FY\s?\d{2,4}$/i.test(p.company.quarter.trim())) warnings.push(`The quarter label "${p.company.quarter}" is not like "Q2 FY27": period comparisons may be mislabelled.`);

  const cur = p.periods?.current;
  if (Array.isArray(p.segments) && p.segments.length && num(cur?.revenue)) {
    const sum = p.segments.reduce((s, x) => s + (num(x.current?.revenue) || 0), 0);
    const gap = Math.abs(sum - cur.revenue) / cur.revenue;
    if (gap > 0.10) warnings.push(`Segment revenues add up to ${r1(sum)}, not the reported ${cur.revenue}: segments are left out of the analysis until the table is fixed.`);
    else if (gap > 0.02) warnings.push(`Segment revenues add up to ${r1(sum)}, not the reported ${cur.revenue} (more than 2% apart). Check the segment table.`);
  }
  const ids = new Set();
  for (const c of p.commitments || []) {
    if (!c.id || ids.has(c.id)) errors.push(`Commitment id "${c.id}" is missing or repeated.`);
    ids.add(c.id);
    if (!['guidance', 'statement', 'deflection'].includes(c.kind)) errors.push(`Commitment ${c.id}: kind must be guidance, statement or deflection.`);
    if (!c.said) errors.push(`Commitment ${c.id}: “said” (the words on record) is missing.`);
  }
  if (p.consensus && num(p.consensus.revenue) && num(cur?.revenue) && !(p.consensus.revenue / cur.revenue > 0.5 && p.consensus.revenue / cur.revenue < 2)) warnings.push(`Consensus revenue (${p.consensus.revenue}) is more than 2x away from reported revenue (${cur.revenue}), probably other units: consensus is ignored.`);
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
  // Consensus in different units from the actuals (more than 2x away) is ignored, not compared.
  const consOk = p.consensus && num(p.consensus.revenue) && num(cur.revenue) && p.consensus.revenue / cur.revenue > 0.5 && p.consensus.revenue / cur.revenue < 2;
  if (consOk) k.vsCons = { rev: pct(cur.revenue, p.consensus.revenue), ebitda: pct(cur.ebitda, p.consensus.ebitda), pat: pct(cur.pat, p.consensus.pat), margin: num(p.consensus.ebitda) && num(p.consensus.revenue) ? (p.consensus.ebitda / p.consensus.revenue) * 100 : null };
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
  // Segments that do not add up to within 10% of revenue (double counting, other units) are left out.
  if (!segmentsUsable(p)) return [];
  return (p.segments || []).filter((s) => s.current).map((s, i) => {
    const c = s.current, y = s.priorYear || {};
    return { name: s.name, key: s.key || `S${i + 1}`, rev: c.revenue, m: c.margin, revPy: y.revenue, mPy: y.margin, mPq: s.priorQuarter?.margin,
      growth: pct(c.revenue, y.revenue), bps: num(c.margin) != null && num(y.margin) != null ? (c.margin - y.margin) * 100 : null };
  });
}

export function segmentsUsable(p) {
  const segs = (p.segments || []).filter((s) => num(s.current?.revenue));
  const rev = p.periods?.current?.revenue;
  if (!segs.length || !num(rev)) return true;
  const sum = segs.reduce((t, s) => t + s.current.revenue, 0);
  return Math.abs(sum - rev) / rev <= 0.10;
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
      const share = p.ytd.capex / t.value, elapsed = (p.ytd.quartersElapsed || quarterNum(p.company?.quarter) || 2) / 4;
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
  const units = p.company.unitWord || (p.company.units || '').split(' ').pop() || '';
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
    magnitude: clamp((p.ytd.capex / capex.target.value - (p.ytd.quartersElapsed || quarterNum(p.company?.quarter) || 2) / 4) / 0.3), salience: 0.6, ties: [capex.id], kw: KW.capex, owner: 'CFO', template: 'capex' });
  const patTitle = num(k.cur.pat) && num(k.py.pat) ? (k.cur.pat < 0 && k.py.pat >= 0 ? `PAT turned to a loss of ${-k.cur.pat} ${units}` : k.cur.pat < 0 && k.py.pat < 0 ? (k.cur.pat < k.py.pat ? `Loss widened to ${-k.cur.pat} ${units}` : null) : k.patYoY <= -15 ? `PAT down ${r1(-k.patYoY)}%` : null) : null;
  if (patTitle) P.push({ id: 'profit', theme: 'Profit', title: patTitle,
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
        trap = 'A vague “input costs” answer. The analyst has built the bridge and will check yours against it.'; terms = ['margin', 'basis points', 'bps']; keyFigures = [Math.round(-k.mBps), r1(k.m)]; break;
      case 'cash':
        text = `Operating cash flow was ${k.cur.ocf} ${u} against ${k.py.ocf} a year ago${k.conv != null ? `, and cash conversion fell to ${Math.round(k.conv)}% of EBITDA` : ''}.${quote ? ` You said ${qt(quote.said)}.` : ''} What happened to working capital, and why should we believe the next date?`;
        trap = 'Giving a new date. A second missed date is worse than none.'; terms = ['cash', 'working capital']; keyFigures = [k.cur.ocf, k.py.ocf]; break;
      case 'leverage':
        text = `Net debt is ${k.cur.netDebt} ${u}, ${k.lev.toFixed(2)} times EBITDA${quote ? `, against your commitment of ${qt(quote.said)}` : ''}. How much headroom is left, and what gives first if it narrows: capex or the dividend?`;
        trap = 'A flat “no risk” without showing what has to go right.'; terms = ['net debt', 'leverage', 'headroom']; keyFigures = [k.cur.netDebt, +k.lev.toFixed(2)]; break;
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
        text = `${k.cur.pat < 0 ? (k.py.pat >= 0 ? `You moved from a profit of ${k.py.pat} ${u} to a loss of ${-k.cur.pat} ${u}` : `The loss widened from ${-k.py.pat} to ${-k.cur.pat} ${u}`) : `PAT fell ${r1(-k.patYoY)}% to ${k.cur.pat} ${u}`} while revenue ${k.revYoY >= 0 ? 'grew' : 'fell'} ${r1(Math.abs(k.revYoY))}%. What sits between EBITDA and PAT: depreciation, interest, tax or one-offs, and which of them will recur?`;
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
  // A derived figure is not looked for in the document; the figures it was computed from are.
  const derived = new Set((p.derived || []).map((d) => d.split(' = ')[0]));
  const check = (path, v) => { if (num(v) != null && !derived.has(path)) checks.push({ path, value: v, found: has(v) }); };
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

// ---------- strict evidence policy: nothing unverified is used ----------
// Run when an extracted pack is used. Figures not found in the source document are cleared, and
// commitments and transcript lines not found word for word are left out, unless a person has confirmed
// them against the document (keepUnverified). Every removal is reported.
export function applyEvidencePolicy(pack, sourceText, { keepUnverified = false } = {}) {
  const p = JSON.parse(JSON.stringify(pack));
  p.provenance = { ...(p.provenance || {}), policy: keepUnverified ? 'confirmed' : 'strict' };
  if (!sourceText) return { pack: p, removed: [] };
  const ver = verifyAgainstSource(p, sourceText);
  if (keepUnverified) {
    p.provenance.unverifiedKept = ver.checks.filter((c) => !c.found).map((c) => `${c.path}=${c.value}`).slice(0, 50);
    return { pack: p, removed: [] };
  }
  const removed = [];
  for (const c of ver.checks.filter((x) => !x.found)) {
    const ks = c.path.split('.'); const last = ks.pop(); const t = ks.reduce((o, k) => o?.[k], p);
    if (t && last in t) { t[last] = null; removed.push(`${c.path} (${c.value}): not found in the document, cleared`); }
  }
  const qOk = new Set(ver.quotes.filter((q) => q.found).map((q) => q.id));
  for (const c of p.commitments || []) if (!qOk.has(c.id)) removed.push(`commitment ${c.id} "${String(c.said).slice(0, 60)}": quote not found word for word, left out`);
  p.commitments = (p.commitments || []).filter((c) => qOk.has(c.id));
  const lOk = new Set(ver.lines.filter((l) => l.found).map((l) => l.ref));
  for (const l of p.transcript || []) if (!lOk.has(l.ref)) removed.push(`transcript line ${l.ref}: not found word for word, left out`);
  p.transcript = (p.transcript || []).filter((l) => lOk.has(l.ref));
  for (const sg of p.segments || []) for (const k of ['current', 'priorYear', 'priorQuarter']) if (sg[k] && sg[k].revenue == null && sg[k].margin == null) sg[k] = null;
  p.provenance.removed = removed.slice(0, 80);
  return { pack: p, removed };
}
