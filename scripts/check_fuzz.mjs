// Fuzz and property test for the engine (robustness plan, task R1). Mutates real packs at random
// (fields removed, zeroed, negated, nulled, made tiny or huge) and checks that the engine never throws
// and never shows NaN, Infinity, "undefined" or "null" in any text a user would read.
// Run: node scripts/check_fuzz.mjs [iterations]
import { readFileSync } from 'node:fs';
import { analyze, validatePack, sanitizePack } from '../web/js/core.js';
import { scoreAnswer, remarksCheck } from '../web/js/score.js';
import { samplePack } from '../web/js/sample.js';

const N = Number(process.argv[2] || 3000);
let seed = 20261028;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const index = JSON.parse(readFileSync(new URL('../web/datasets/index.json', import.meta.url)));
const bases = [samplePack, ...index.map((d) => JSON.parse(readFileSync(new URL(`../web/datasets/${d.slug}.json`, import.meta.url))))];
const BAD = /\b(NaN|Infinity|undefined|null)\b/;

// Every numeric leaf path in a pack, so mutations reach every field the engine reads.
function numericPaths(o, pre = '') {
  const out = [];
  for (const [k, v] of Object.entries(o || {})) {
    const p = pre ? `${pre}.${k}` : k;
    if (typeof v === 'number') out.push(p);
    else if (v && typeof v === 'object' && !['questions', 'personas', 'provenance'].includes(k)) out.push(...numericPaths(v, p));
  }
  return out;
}
const getP = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const setP = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((x, k) => x?.[k], o); if (t) t[last] = v; };
const dropKeys = ['priorQuarter', 'history', 'ytd', 'priorFY', 'consensus', 'segments', 'commitments', 'transcript', 'notes', 'remarks', 'bridge', 'ttmEbitda', 'questions'];

function texts(ctx) {
  const t = [];
  for (const x of ctx.pressure) t.push(x.title, x.evidence);
  for (const q of ctx.questions) t.push(q.text, q.trap);
  for (const c of ctx.commitments) t.push(c.why || '');
  return t;
}

let fails = 0, invalid = 0, ran = 0;
const failures = new Map();
for (let i = 0; i < N; i++) {
  const p = JSON.parse(JSON.stringify(pick(bases)));
  const ops = 1 + Math.floor(rand() * 6);
  const log = [];
  for (let j = 0; j < ops; j++) {
    const kind = pick(['drop', 'zero', 'negate', 'null', 'tiny', 'huge', 'dropKey']);
    if (kind === 'dropKey') { const k = pick(dropKeys); if (k === 'priorQuarter') delete p.periods.priorQuarter; else delete p[k]; log.push(`drop ${k}`); continue; }
    const path = pick(numericPaths(p));
    if (!path) continue;
    const v = getP(p, path);
    const nv = kind === 'drop' ? undefined : kind === 'zero' ? 0 : kind === 'negate' ? -v : kind === 'null' ? null : kind === 'tiny' ? 0.0001 : v * 1000;
    setP(p, path, nv); log.push(`${kind} ${path}`);
  }
  const { pack } = sanitizePack(p);
  const v = validatePack(pack);
  if (v.errors.length) { invalid++; continue; } // refused packs never reach the engine: correct behaviour
  ran++;
  try {
    const ctx = analyze(pack);
    ctx.warnings = v.warnings;
    const bad = texts(ctx).find((s) => BAD.test(String(s)));
    if (bad) throw new Error(`user-visible text contains ${String(bad).match(BAD)[0]}: "${String(bad).slice(0, 90)}"`);
    remarksCheck(ctx, pack.remarks || 'Revenue grew and margins fell.');
    for (const q of ctx.questions.slice(0, 3)) {
      const r = scoreAnswer(ctx, q, 'We said margins would recover, and they did not. Revenue was 100 crore and margin 10%. We will report it every quarter.');
      if (!Number.isFinite(r.total)) throw new Error(`score is ${r.total}`);
    }
  } catch (e) {
    fails++;
    const key = String(e.message).replace(/"[^"]*"/g, '"..."').slice(0, 120);
    if (!failures.has(key)) failures.set(key, { msg: e.message, log, company: pack.company?.name });
  }
}
for (const [, f] of [...failures].slice(0, 12)) console.log(`FAIL  ${f.msg}\n      ${f.company}: ${f.log.join('; ')}`);
console.log(`\n${N} mutated packs: ${invalid} refused by validation (correct), ${ran} analysed, ${fails} failures in ${failures.size} distinct kinds`);
process.exit(fails ? 1 : 0);
