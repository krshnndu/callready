// Recommendations before the call: pure rules over the analysed pack. Every recommendation carries the
// evidence it rests on (commitment ids, transcript or note refs, or the computed fact), so none is
// free-standing advice.
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const f1 = (x) => (num(x) ? (Math.round(x * 10) / 10).toFixed(1) : '-');
const unq = (t) => String(t ?? '').replace(/["“”]/g, '');

export function recommendations(ctx, { themes = [], best = {}, rc = { gaps: [], risky: [] }, contra = [] } = {}) {
  const { imp, commitments: cs, pressure: P, k: K, pack } = ctx;
  const R = [];
  if (imp && num(imp.need) && imp.need > imp.record) R.push({ title: 'Decide on margin guidance before the call, not during it',
    body: `${imp.ytdLabel} EBITDA margin is ${f1(imp.ytd)}%. The bottom of the ${imp.low} to ${imp.high}% range needs about ${f1(imp.need)}% for the rest of the year, above the ${f1(imp.record)}% best quarter on record. Defending it invites the hardest follow-up of the call. Recommend the board settles a revised range and files it with the results, so the CFO can point to it.`,
    evidence: [imp.guidanceId, ...cs.filter((c) => c.id === imp.guidanceId && c.ref).map((c) => c.ref), `computed: rest-of-year margin needed ${f1(imp.need)}% vs record ${f1(imp.record)}%`] });
  if (rc.gaps.length) R.push({ title: pack.remarks ? 'Close the gaps in the prepared remarks' : 'Write the prepared remarks around the pressure map',
    body: `${pack.remarks ? 'The draft is silent on' : 'Cover'}: ${rc.gaps.map((g) => g.label).slice(0, 5).join('; ')}.${num(K.mBps) && K.mBps < 0 ? ` Explain the ${Math.abs(Math.round(K.mBps))} bps margin decline with its drivers.` : ''}${rc.risky[0] ? ` Remove "${rc.risky[0].phrase}": ${rc.risky[0].why}` : ''}`,
    evidence: [`computed: ${rc.gaps.length} pressure points not covered by the remarks`, ...(num(K.mBps) ? [`computed: EBITDA margin ${f1(K.m)}% vs ${f1(K.mPy)}%`] : [])] });
  const broken = cs.filter((c) => c.status === 'broken');
  if (broken.length) R.push({ title: `Own ${broken.length === 1 ? 'the statement that did not hold' : `the ${broken.length} statements that did not hold`} in the opening`,
    body: `${broken.map((c) => `${c.id} (“${unq(c.said)}”): ${c.why}`).join('; ')}. One sentence each, from the speaker who made it: what was said, what happened, what changes.`,
    evidence: broken.flatMap((c) => [c.id, ...(c.ref ? [c.ref] : [])]) });
  for (const c of cs.filter((x) => x.status === 'deflected')) R.push({ title: `Disclose ${c.topic || 'the deflected item'} proactively`,
    body: `Last time: “${unq(c.said)}”. ${c.why || ''} Put it in the CFO's section before an analyst asks again, and commit to regular disclosure.`,
    evidence: [c.id, ...(c.ref ? [c.ref] : []), ...(c.askedRef ? [c.askedRef] : [])] });
  const weak = themes.filter((t) => t.band === 'red' || t.band === 'off').map((t) => t.th);
  if (weak.length) R.push({ title: `Rehearse again: ${weak.slice(0, 4).join(', ')}`,
    body: `These themes are not ready${Object.keys(best).length ? ' on the answers given so far' : ' because nothing has been rehearsed yet'}. Owners follow the pressure map: ${P.slice(0, 4).map((x) => `${x.theme} to ${x.owner === 'ENERGY' ? 'the segment head' : x.owner}`).join('; ')}.`,
    evidence: [`computed: readiness below 55 or not rehearsed on ${weak.length} theme${weak.length === 1 ? '' : 's'}`] });
  if (contra.length) R.push({ title: 'Align the speakers on one line per theme',
    body: `${contra.map((c) => c.q.id).join(', ')} got different answers from different speakers. Agree the wording, then rehearse both again.`,
    evidence: contra.map((c) => `rehearsal ${c.q.id}: ${c.latest.map((x) => `${x.speaker} ${x.total}`).join(' vs ')}`) });
  R.push({ title: 'Send every forward-looking figure through the company secretary',
    body: 'Any number about the rest of the year, the next year or the current quarter that is not already in guidance is new disclosure. The scorecard flags these in red; none should reach the call.',
    evidence: ['rule: disclosure-safety check in the scorecard (SEBI listing and insider-trading rules)'] });
  return R;
}
