// Scores the pitch-path answers exactly as the browser does and posts them to the coach,
// so the live demo hits the cache. Usage: node scripts/warm_demo.mjs https://callreadyai.vercel.app
import { analyze } from '../web/js/core.js';
import { scoreAnswer as score } from '../web/js/score.js';
import { samplePack } from '../web/js/sample.js';
const ctx = analyze(samplePack);
const questions = ctx.questions;
const scoreAnswer = (q, t) => score(ctx, q, t);
const base = process.argv[2] || 'https://callreadyai.vercel.app';
const runs = [['Q01', 'weak'], ['Q03', 'weak']];
for (const [qid, kind] of runs) {
  const q = questions.find((x) => x.id === qid);
  const res = scoreAnswer(q, q[kind]);
  const body = { qid, answer: q[kind], speaker: q.owner, total: res.total, flags: res.flags.map((f) => `${f.dim}: ${f.text}: ${f.why}`) };
  const t = Date.now();
  const r = await fetch(`${base}/api/coach`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  console.log(qid, kind, r.status, j.model || j.error || j.detail, j.cached ? 'cached' : 'fresh', `${((Date.now() - t) / 1000).toFixed(1)}s`);
}
