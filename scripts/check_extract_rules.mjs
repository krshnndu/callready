// Tests for the rule-based extractor (robustness plan, task R3). Ground truth:
//  - the synthetic sample's results document (always available, runs in CI)
//  - real filings in the scratch area, when present locally: two new companies with hand-checked truth
//    (scratchpad/newco/manifest.json) and the six test datasets' source texts (agreement with the
//    rules-verified AI extraction).
// Run: node scripts/check_extract_rules.mjs [scratch-dir]
import { readFileSync, existsSync } from 'node:fs';
import { samplePack } from '../web/js/sample.js';
import { validatePack, verifyAgainstSource } from '../web/js/core.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
let ex = null;
try { ex = await import('../web/js/extract.js'); } catch (e) { ok(false, `web/js/extract.js loads (${e.message.split('\n')[0]})`); }
if (!ex) { console.log(`\n${fails} FAILED`); process.exit(1); }

console.log('--- Sample results document');
const html = readFileSync(new URL('../web/samples/meridian-arc-q2fy27-results.html', import.meta.url), 'utf8');
const text = html.replace(/<\/(tr|p|h\d|li)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
const { pack, report } = ex.extractByRules(text, { name: 'meridian-arc-q2fy27-results.pdf' });
const T = samplePack.periods;
for (const per of ['current', 'priorYear', 'priorQuarter']) for (const f of ['revenue', 'ebitda', 'ocf', 'capex', 'da']) ok(pack.periods?.[per]?.[f] === T[per][f], `${per}.${f}: ${pack.periods?.[per]?.[f]} (truth ${T[per][f]})`);
for (const f of ['pat', 'invDays', 'recDays', 'payDays']) for (const per of ['current', 'priorYear']) ok(pack.periods?.[per]?.[f] === T[per][f], `${per}.${f}: ${pack.periods?.[per]?.[f]} (truth ${T[per][f]})`);
ok(pack.periods?.current?.netDebt === 940 && pack.periods?.priorQuarter?.netDebt === 760, 'net debt read for both periods that print it');
ok(pack.company?.quarter === 'Q2 FY27' && /INR crore/i.test(pack.company?.units || ''), `quarter ${pack.company?.quarter}, units ${pack.company?.units}`);
ok(/Meridian Arc Industries/.test(pack.company?.name || ''), `company name: ${pack.company?.name}`);
ok(validatePack(pack).errors.length === 0, `the rules-only pack validates (${validatePack(pack).errors.join(' ') || 'no errors'})`);
const v = verifyAgainstSource(pack, text);
ok(v.numbersFound === v.numbersTotal && v.numbersTotal >= 25, `every extracted figure is in the document (${v.numbersFound}/${v.numbersTotal})`);
ok(pack.commitments.some((c) => /13\.5 to 14\.5/.test(c.said) && c.metric === 'ebitdaMargin' && c.target?.low === 13.5 && c.target?.high === 14.5), 'margin guidance sentence found verbatim, with its range');
ok(pack.commitments.some((c) => /around 600 crore/.test(c.said)), 'capex guidance sentence found verbatim');
ok(v.quotesFound === v.quotes.length, `every guidance quote is word for word (${v.quotesFound}/${v.quotes.length})`);
ok(Array.isArray(report.tables) && report.tables.length >= 1, `report lists the tables used (${report.tables?.length})`);

console.log('--- Misaligned rows give no figure, never a wrong one');
{
  const t = 'Havells India Limited\n(In Rs crores) Q2 FY27 Q2 FY26 YoY (%) Q1 FY27\nNet Revenue (NR) 6,417 4,767 34.6% 6,510\nEBITDA 576 442 30.5% 474\nNet Profit 353 31 7 11.1% 298\nTax 123 96  103\n';
  const { pack: p, report: r } = ex.extractByRules(t, {});
  ok(p.periods.priorYear.pat == null && p.periods.current.pat == null, `a row with more numbers than periods (a number split in two) is refused (PAT ${p.periods.current.pat}/${p.periods.priorYear.pat})`);
  ok(p.periods.current.revenue === 6417 && p.periods.priorQuarter.revenue === 6510 && p.periods.priorYear.ebitda === 442, 'well-formed rows around it are still read');
  ok((r.rejected || []).some((x) => /net profit/i.test(x)), 'the refused row is reported');
}

console.log('--- Annual statements (FY vs FY), like the Reliance Retail upload');
{
  const t = 'Reliance Retail Limited\nStatement of Profit and Loss for the year ended 31 March 2025 (Rs in crore)\nParticulars FY25 FY24\nRevenue from operations 271,012 258,388\nOther income 1,214 1,108\nFinance costs 3,056 2,811\nDepreciation and amortisation expense 4,519 4,035\nProfit before tax 13,402 11,989\nProfit for the year 9,973 8,875\n';
  const { pack: p } = ex.extractByRules(t, {});
  ok(p.company.quarter === 'FY25' && p.periods.current.label === 'FY25' && p.periods.priorYear.label === 'FY24', `annual periods recognised (${p.company.quarter}: ${p.periods.current.label} vs ${p.periods.priorYear.label})`);
  ok(p.periods.current.revenue === 271012 && p.periods.priorYear.revenue === 258388, 'annual revenue read for both years');
  ok(p.periods.current.pat === 9973 && p.periods.current.pbt === 13402 && p.periods.current.financeCost === 3056 && p.periods.current.da === 4519, 'PAT, PBT, finance costs and D&A read');
}

{
  const t = 'Reliance Retail Limited\n(Rs in crore)\nParticulars Year ended 31 March 2025 Year ended 31 March 2024\nRevenue from operations 271,012 258,388\nProfit before tax 13,402 11,989\n';
  const { pack: p } = ex.extractByRules(t, {});
  ok(p.company.quarter === 'FY25' && p.periods.current.revenue === 271012 && p.periods.priorYear.pbt === 11989, `year-end dates read as financial years (${p.company.quarter}, ${p.periods.current.revenue}, ${p.periods.priorYear.pbt})`);
  const u = 'X Limited\nParticulars March 31, 2025 March 31, 2024\nRevenue from operations 1,000 900\n';
  ok(ex.extractByRules(u, {}).pack.periods.priorYear.revenue === 900, 'the US date order (March 31, 2025) also works');
}

const scratch = process.argv[2] || '/private/tmp/claude-501/-Users-krshnndu-Projects-illuminati-assignment/ce522e7e-e5ba-4f11-b613-b61d426ea16b/scratchpad';
if (existsSync(`${scratch}/newco/manifest.json`)) {
  console.log('--- New, unseen companies (truth read from the PDFs)');
  for (const m of JSON.parse(readFileSync(`${scratch}/newco/manifest.json`))) {
    const t = m.files.map((f) => readFileSync(`${scratch}/newco/${m.slug}/${f.kind}.txt`, 'utf8')).join('\n\n');
    const { pack: p } = ex.extractByRules(t, { name: m.company });
    const tr = m.truth;
    const got = { revenue_current: p.periods?.current?.revenue, revenue_prior_year: p.periods?.priorYear?.revenue, ebitda_current: p.periods?.current?.ebitda, ebitda_prior_year: p.periods?.priorYear?.ebitda, pat_current: p.periods?.current?.pat, pat_prior_year: p.periods?.priorYear?.pat };
    for (const [k, want] of Object.entries(tr).filter(([k]) => k in got)) ok(got[k] === Number(String(want).replace(/,/g, '')), `${m.slug} ${k}: ${got[k]} (truth ${want})`);
    const vv = verifyAgainstSource(p, t);
    ok(vv.numbersFound === vv.numbersTotal, `${m.slug}: every rule-extracted figure is in the document (${vv.numbersFound}/${vv.numbersTotal})`);
    ok(validatePack(p).errors.length === 0, `${m.slug}: rules-only pack validates (${validatePack(p).errors.join(' ') || 'ok'})`);
  }
}
if (existsSync(`${scratch}/dsx`)) {
  console.log('--- Agreement with the verified AI extraction on the six test datasets');
  for (const d of JSON.parse(readFileSync(new URL('../web/datasets/index.json', import.meta.url)))) {
    const f = `${scratch}/dsx/${d.slug}.txt`; if (!existsSync(f)) continue;
    const t = readFileSync(f, 'utf8');
    const ai = JSON.parse(readFileSync(new URL(`../web/datasets/${d.slug}.json`, import.meta.url)));
    const { pack: r } = ex.extractByRules(t, { name: d.company });
    let agree = 0, both = 0, onlyRules = 0;
    for (const per of ['current', 'priorYear']) for (const fld of ['revenue', 'ebitda', 'pat']) {
      const a = ai.periods?.[per]?.[fld], b = r.periods?.[per]?.[fld];
      if (a != null && b != null) { both++; if (Math.abs(a - b) <= Math.max(0.5, Math.abs(a) * 0.001)) agree++; } else if (b != null) onlyRules++;
    }
    const vv = verifyAgainstSource(r, t);
    console.log(`INFO  ${d.slug.padEnd(18)} rules found ${vv.numbersTotal} figures, all in document: ${vv.numbersFound === vv.numbersTotal}; agree with AI on ${agree}/${both} headline figures${onlyRules ? `, ${onlyRules} more only by rules` : ''}`);
    ok(vv.numbersFound === vv.numbersTotal, `${d.slug}: every rule-extracted figure is in the document`);
  }
}
console.log(fails ? `\n${fails} extractor check(s) FAILED` : '\nAll extractor checks passed');
process.exit(fails ? 1 : 0);
