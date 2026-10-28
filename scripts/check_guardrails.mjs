// Guardrail tests for the pack pipeline (docs/superpowers/plans/2026-10-28-guardrails.md, tasks 1, 2, 4).
// Layer 1: sanitizePack forces untrusted packs into shape. Layer 2: validatePack refuses figures that
// make no financial sense. Upload limits: uploadAllowed. Run: node scripts/check_guardrails.mjs
import { readFileSync } from 'node:fs';
import * as core from '../web/js/core.js';
import { samplePack } from '../web/js/sample.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const has = (name) => typeof core[name] === 'function';

console.log('--- Layer 1: sanitising untrusted packs');
ok(has('sanitizePack'), 'sanitizePack exists');
if (has('sanitizePack')) {
  const p = clone(samplePack);
  p.periods.current.revenue = '2,480';
  p.periods.current.pat = 'abc';
  p.periods.current.ocf = { evil: true };
  p.company.name = 'x'.repeat(10000);
  p.transcript = Array.from({ length: 500 }, (_, i) => ({ ref: `T${i}`, speaker: 'CEO', text: 'hello' }));
  p.provenance = { source: 'upload', urls: ['javascript:alert(1)', 'https://www.nseindia.com/x.pdf', 'data:text/html,hi'] };
  p.commitments[0].said = ['not', 'a', 'string'];
  p.segments[0].name = { toString: 'nope' };
  const { pack: s, fixes } = core.sanitizePack(p);
  ok(s.periods.current.revenue === 2480, 'numeric string "2,480" becomes the number 2480');
  ok(s.periods.current.pat === null, 'a non-numeric string in a figure becomes null');
  ok(s.periods.current.ocf === null, 'an object in a figure becomes null');
  ok(s.company.name.length <= 160, `a 10,000-character company name is cut (now ${s.company.name.length})`);
  ok(s.transcript.length <= 300, `transcript lines are capped (now ${s.transcript.length})`);
  ok(JSON.stringify(s.provenance.urls) === JSON.stringify(['https://www.nseindia.com/x.pdf']), 'only http(s) source URLs survive');
  ok(s.commitments[0].said === '', 'an array where a quote belongs becomes an empty string');
  ok(typeof s.segments[0].name === 'string', 'an object where a name belongs becomes a string');
  ok(Array.isArray(fixes) && fixes.length >= 5, `fixes are reported (${fixes?.length})`);
  for (const junk of [null, [], 42, 'pack']) { let threw = false; try { core.sanitizePack(junk); } catch { threw = true; } ok(!threw, `never throws on ${JSON.stringify(junk)}`); }
  ok(core.sanitizePack(clone(samplePack)).fixes.length === 0, 'the sample needs no fixes');
}

console.log('--- Layer 2: figures must make financial sense');
const errs = (mut) => { const p = clone(samplePack); delete p.questions; mut(p); return core.validatePack(p); };
ok(errs((p) => { p.periods.current.revenue = 0; }).errors.some((e) => /revenue/i.test(e)), 'revenue of 0 is an error');
ok(errs((p) => { p.periods.priorYear.revenue = -5; }).errors.some((e) => /revenue/i.test(e)), 'negative revenue is an error');
ok(errs((p) => { p.periods.current.ebitda = 9999; }).errors.some((e) => /EBITDA/.test(e)), 'EBITDA above revenue is an error');
ok(!errs((p) => { p.periods.priorYear.ebitda = -2500; }).errors.length, 'an EBITDA loss larger than revenue is allowed (loss-makers), not an error');
ok(errs((p) => { p.periods.priorYear.ebitda = -9000; }).warnings.some((e) => /three times/.test(e)), 'a loss over three times revenue is a units warning');
ok(errs((p) => { p.segments[0].current.margin = 250; }).errors.some((e) => /margin/i.test(e)), 'a segment margin of 250% is an error');
ok(errs((p) => { p.periods.current.invDays = -4; }).warnings.some((e) => /days/i.test(e)), 'negative day counts are a warning');
ok(errs((p) => { p.periods.current.netDebt = 99999; }).warnings.some((e) => /net debt/i.test(e)), 'net debt above 20x EBITDA is a warning');
ok(errs((p) => { p.company.quarter = 'last quarter'; }).warnings.some((e) => /quarter/i.test(e)), 'an unrecognised quarter label is a warning');
const sample = core.validatePack(clone(samplePack));
ok(sample.errors.length === 0 && sample.warnings.length === 0, `the sample validates cleanly (${sample.errors.length} errors, ${sample.warnings.length} warnings)`);
const index = JSON.parse(readFileSync(new URL('../web/datasets/index.json', import.meta.url)));
for (const d of index) {
  const p = JSON.parse(readFileSync(new URL(`../web/datasets/${d.slug}.json`, import.meta.url)));
  const v = core.validatePack(p);
  ok(v.errors.length === 0, `test dataset ${d.slug} still validates (${v.errors.join(' ') || 'no errors'})`);
}

console.log('--- Units and consistency rules (robustness R4)');
{
  const run = (mut) => { const p = clone(samplePack); delete p.questions; mut(p); const v = core.validatePack(p); const ctx = core.analyze(p); return { v, ctx }; };
  const a = run((p) => { p.consensus.revenue = 24400; p.consensus.ebitda = 3150; });
  ok(!a.ctx.k.vsCons && a.v.warnings.some((w) => /consensus/i.test(w)), 'consensus 10x away from actuals is ignored, with a warning');
  const b = run((p) => { p.segments.push({ name: 'Duplicate total', current: { revenue: 2480, margin: 11 }, priorYear: { revenue: 2170, margin: 14 } }); });
  ok(b.ctx.segs.length === 0 && !b.ctx.pressure.some((x) => x.id.startsWith('seg-')), 'segments that do not sum to revenue are left out of the analysis');
  const c = run((p) => { const g = p.commitments.find((x) => x.id === 'G2'); g.target = { low: 14.5, high: 13.5 }; });
  ok(c.ctx.imp && c.ctx.imp.low === 13.5 && c.ctx.imp.high === 14.5, 'a guidance range written backwards is swapped');
  const d = run((p) => { delete p.ytd.quartersElapsed; p.company.quarter = 'Q4 FY27'; });
  ok(d.ctx.commitments.find((x) => x.id === 'G4').status === 'on-track', 'quarters elapsed come from the quarter label when missing (Q4 is 4, so 410 of 600 is on track)');
  const e = run((p) => { p.periods.current.pat = -50; });
  ok(e.ctx.pressure.some((x) => /turned to a loss/i.test(x.title)), 'PAT that turns negative is called a loss, not a percentage fall');
  const f = run((p) => { p.periods.current.pat = -150; p.periods.priorYear.pat = -100; });
  ok(f.ctx.pressure.some((x) => /loss widened/i.test(x.title)), 'a loss that grows is called a widening loss');
  const g = run((p) => { p.periods.current.pat = -80; p.periods.priorYear.pat = -100; });
  ok(!g.ctx.pressure.some((x) => x.id === 'profit'), 'a loss that narrows is not a pressure point');
}

console.log('--- Strict evidence policy: nothing unverified is used (robustness R2)');
ok(has('applyEvidencePolicy'), 'applyEvidencePolicy exists');
if (has('applyEvidencePolicy')) {
  const html = readFileSync(new URL('../web/samples/meridian-arc-q2fy27-results.html', import.meta.url), 'utf8');
  const source = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  const p = clone(samplePack); delete p.questions;
  p.periods.current.pat = 999;                       // invented
  p.periods.priorQuarter.capex = 777;                // invented
  p.segments[0].current.margin = 7.1;                // true, printed in the table
  p.commitments = [
    { id: 'G1', kind: 'guidance', by: 'CFO', said: 'Capex for FY27 will be around 600 crore, and net debt to EBITDA will stay below 1x.', metric: 'capex', target: { value: 600 } },
    { id: 'S9', kind: 'statement', by: 'CFO', said: 'We promised margins of 20 percent by Q2.', metric: 'ebitdaMargin', target: { low: 20 } },
  ];
  p.transcript = [{ ref: 'T1', speaker: 'CFO', text: 'Working capital should normalise by the end of Q2 as channel inventory unwinds after the summer season.' }, { ref: 'T2', speaker: 'CEO', text: 'We will double revenue next year.' }];
  const { pack: s, removed } = core.applyEvidencePolicy(p, source, { keepUnverified: false });
  ok(s.periods.current.pat === null && s.periods.priorQuarter.capex === null, 'invented figures are cleared');
  ok(s.periods.current.revenue === 2480 && s.periods.priorYear.ebitda === 308 && s.segments[0].current.margin === 7.1, 'figures found in the document are kept');
  ok(s.commitments.map((c) => c.id).join() === 'G1', 'a commitment quoted word for word is kept; an invented one is dropped');
  ok(s.transcript.map((l) => l.ref).join() === 'T1', 'a transcript line found in the document is kept; an invented one is dropped');
  ok(['periods.current.pat', 'periods.priorQuarter.capex', 'commitment S9', 'transcript line T2'].every((k) => removed.some((r) => r.startsWith(k))), 'each planted value is named in the removals');
  ok(removed.some((r) => r.startsWith('segments.0.priorQuarter.revenue')), 'a true-looking figure the document never prints (last quarter segment revenue) is also cleared');
  const kept = core.applyEvidencePolicy(p, source, { keepUnverified: true });
  ok(kept.pack.periods.current.pat === 999 && kept.removed.length === 0, 'with confirmation, unverified values are kept and marked');
  ok(kept.pack.provenance?.policy === 'confirmed' && s.provenance?.policy === 'strict', 'the pack records which policy was applied');
}

console.log('--- EBITDA derived from verified components when not printed');
{
  const p = clone(samplePack); delete p.questions; delete p.bridge;
  for (const k of ['current', 'priorYear', 'priorQuarter']) p.periods[k].ebitda = null;
  Object.assign(p.periods.current, { pbt: 164, financeCost: 28, da: 108 });
  Object.assign(p.periods.priorYear, { pbt: 202, financeCost: 17, da: 99 });
  p.periods.priorQuarter = null;
  const v = core.validatePack(p);
  ok(v.errors.length === 0, `a pack with PBT, finance costs and D&A but no EBITDA validates (${v.errors.join(' ') || 'ok'})`);
  const ctx = core.analyze(p);
  ok(ctx.k.cur.ebitda === 300 && ctx.k.py.ebitda === 318, `EBITDA derived as PBT + finance costs + D&A (${ctx.k.cur.ebitda}, ${ctx.k.py.ebitda})`);
  ok((p.derived || []).some((d) => /periods\.current\.ebitda/.test(d)), 'the derivation is recorded on the pack');
  const src = 'Profit before tax 164 202 Finance costs 28 17 Depreciation 108 99 Revenue 2,480 2,170';
  const ver = core.verifyAgainstSource(p, src);
  ok(!ver.checks.some((c) => c.path === 'periods.current.ebitda'), 'a derived figure is not looked for in the document; its inputs are');
  ok(ver.checks.some((c) => c.path === 'periods.current.pbt' && c.found), 'the inputs of a derived figure are verified');
  const q = clone(samplePack); delete q.questions; q.periods.current.ebitda = null;
  const e = core.validatePack(q).errors.join(' ');
  ok(/profit before tax/i.test(e) && /finance cost/i.test(e), `when EBITDA cannot be found or derived, the error names what is needed (${e.slice(0, 120)})`);
  const a = clone(samplePack); delete a.questions; a.company.quarter = 'FY25';
  ok(!core.validatePack(a).warnings.some((w) => /quarter label/i.test(w)), 'an annual label like FY25 is accepted');
}

console.log('--- Upload limits');
ok(has('uploadAllowed'), 'uploadAllowed exists');
if (has('uploadAllowed')) {
  const f = (name, size) => ({ name, size });
  ok(!core.uploadAllowed([f('big.pdf', 30e6)]).ok, 'a 30 MB file is refused');
  ok(!core.uploadAllowed(Array.from({ length: 6 }, (_, i) => f(`r${i}.pdf`, 1e5))).ok, 'six files are refused');
  ok(!core.uploadAllowed([f('setup.exe', 1e5)]).ok, 'an .exe is refused');
  ok(core.uploadAllowed([f('results.pdf', 2e6), f('call.txt', 5e4)]).ok, 'a 2 MB PDF and a text file are allowed');
  ok(!core.uploadAllowed([]).ok, 'no files is refused with a reason');
}

console.log(fails ? `\n${fails} guardrail check(s) FAILED` : '\nAll guardrail checks passed');
process.exit(fails ? 1 : 0);
