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
