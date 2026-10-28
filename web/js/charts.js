// Small SVG charts, laid out by rules rather than fixed coordinates:
//  1. Each chart is drawn at the width it will occupy (W), so 1 SVG unit is about 1 CSS pixel and text
//     never needs scaling.
//  2. Text width is estimated before placing text. A label that does not fit its slot wraps, then
//     truncates with an ellipsis; the full text stays in the tooltip.
//  3. A value label goes outside its bar when there is room, inside it when the bar is wide enough,
//     and across the zero line otherwise. Labels never sit on top of each other.
// One series per chart, so no categorical palette: the accent carries data, and status colours carry
// state beside a text label. Every mark has a hover and focus tooltip (data-tip) and an aria-label.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Numbers as people read them: Indian grouping, a true minus sign (U+2212, not a hyphen), and no "-0".
const fmt = (v, d = 0) => { const n = Number(Number(v).toFixed(d)) || 0; return n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }).replace('-', '\u2212'); };
const LAB = 11, VAL = 12;

// Text is measured with the real font where a canvas exists (the browser), with a 6% safety margin;
// elsewhere (Node scripts) a conservative per-character estimate stands in.
let ctx2d = null;
const estimate = (s, fs) => [...String(s)].reduce((w, ch) => w + (/[0-9]/.test(ch) ? 0.62 : /[ .,:;!|il]/.test(ch) ? 0.32 : /[MW%]/.test(ch) ? 0.9 : /[A-Z]/.test(ch) ? 0.68 : 0.58) * fs, 0);
export function textW(s, fs = LAB, weight = 500) {
  if (typeof document !== 'undefined') {
    ctx2d ||= document.createElement('canvas').getContext('2d');
    ctx2d.font = `${weight} ${fs}px Inter, ui-sans-serif, system-ui, sans-serif`;
    return ctx2d.measureText(String(s)).width * 1.06;
  }
  return estimate(s, fs);
}
export function fit(s, maxW, fs = LAB, maxLines = 2) {
  const words = String(s).split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textW(next, fs) <= maxW) cur = next;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines || out.some((l) => textW(l, fs) > maxW)) {
    out.forEach((l, i) => { let t = l; const last = i === out.length - 1 && lines.length > maxLines; while (t.length > 1 && textW(t + (last || textW(t, fs) > maxW ? '…' : ''), fs) > maxW) t = t.slice(0, -1); out[i] = t + (last || t !== l ? '…' : ''); });
  }
  return out;
}
export const MIN_STEP_PX = 2; // a waterfall step thinner than this from zero is the only reason to cut an axis
const LH = 14; // line height for 11 px labels: the glyph box is about 13.5 px tall

// Honesty by construction. Every chart maps values to pixels through scale(), and only through it, and
// writes the mapping on the <svg> (data-lo, data-hi, data-p0, data-p1) and the value of every mark on
// the mark (data-v, and data-b for the value a bar starts from). scripts/check_charts.mjs reads the
// drawn pixels back on every screen and on random data, and fails if any mark is not where its value
// says. Bars are drawn only by barMark(): a bar whose start lies below the axis (a cut axis) gets the
// break mark and the caption automatically, so no chart can cut an axis without saying so.
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
function scale(lo, hi, p0, p1) {
  if (!(hi > lo)) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
  const f = (v) => r2(p0 + (p1 - p0) * (v - lo) / (hi - lo));
  return Object.assign(f, { lo, hi, p0, p1 });
}
const frame = (kind, s, axis, unit) => `data-chart="${kind}" data-axis="${axis}" data-lo="${s.lo}" data-hi="${s.hi}" data-p0="${s.p0}" data-p1="${s.p1}" data-unit="${esc(unit)}"`;
const NO_DATA = '<p class="tiny muted chart-empty">No figures to chart.</p>';

// Round axis ticks: a step of 1, 2, 2.5 or 5 times a power of ten giving about `target` intervals,
// covering lo to hi. Equal or reversed ends are widened, and non-numbers give a plain 0 to 1 axis.
export function niceTicks(lo, hi, target = 4) {
  if (!finite(lo) || !finite(hi)) return [0, 1];
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
  const raw = (hi - lo) / target, pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((st) => (hi - lo) / st <= target + 1) || 10 * pow;
  const first = Math.floor(lo / step + 1e-9), out = [];
  for (let k = first; out.length < 50; k++) { const v = Math.round(k * step * 1e9) / 1e9; out.push(v); if (v >= hi - step * 1e-9) break; }
  return out;
}
// The fewest decimals that write every tick exactly (0.25 needs two, so it is never shown as 0.3).
export const tickDecimals = (ticks) => { for (let d = 0; d <= 12; d++) if (ticks.every((t) => Math.abs(Number(t.toFixed(d)) - t) <= Math.abs(t) * 1e-12)) return d; return 12; };

// A bar from value b to value v along one axis, with its data end rounded. A start outside the axis
// range is drawn from the axis edge with a break mark, and cut.any tells the chart to say so.
function barMark(s, axis, pos, size, b, v, cls, cut) {
  const eps = (s.hi - s.lo) * 1e-9, clipped = b < s.lo - eps || b > s.hi + eps; // sub-pixel float noise is not a cut
  const bb = Math.min(s.hi, Math.max(s.lo, b));
  let pb = s(bb), pe = s(v);
  if (Math.abs(pe - pb) < 2) pe = pb + (pe < pb || (pe === pb && s.p1 < s.p0) ? -2 : 2); // a sliver stays visible
  const dir = Math.sign(pe - pb), r = Math.min(3, Math.abs(pe - pb) / 2, size / 2);
  const a = pos, c = pos + size;
  const d = axis === 'y'
    ? `M${a},${pb} V${pe - dir * r} Q${a},${pe} ${a + r},${pe} H${c - r} Q${c},${pe} ${c},${pe - dir * r} V${pb} Z`
    : `M${pb},${a} H${pe - dir * r} Q${pe},${a} ${pe},${a + r} V${c - r} Q${pe},${c} ${pe - dir * r},${c} H${pb} Z`;
  if (clipped) cut.any = true;
  const brk = !clipped ? '' : axis === 'y'
    ? `<path class="axis-break" d="M${a - 2},${pb + dir * 4} l${size + 4},-5 M${a - 2},${pb + dir * 9} l${size + 4},-5"/>`
    : `<path class="axis-break" d="M${pb + dir * 4},${a - 2} l-5,${size + 4} M${pb + dir * 9},${a - 2} l-5,${size + 4}"/>`;
  return `<path d="${d}" class="${cls}" data-v="${v}" data-b="${b}"/>${brk}`;
}
const cutNote = (cut, s, unit, decimals) => (cut.any ? `Axis starts at ${fmt(s.lo, decimals)}${unit}, not zero, so the steps are visible; the cut is marked on the bars it shortens.` : '');
const tlines = (lines, x, y, anchor, cls, lh = LH) => lines.map((l, i) => `<text x="${x}" y="${y + i * lh}" text-anchor="${anchor}" class="${cls}">${esc(l)}</text>`).join('');

// Vertical bars over time, from zero. points: [{label, value, tip, now}]. Negative values hang below
// the zero line.
export function bars({ points, title, unit = '', decimals = 0, W = 560, h = 190 }) {
  points = (points || []).filter((p) => finite(p.value));
  if (!points.length) return NO_DATA;
  const padL = 4, padR = 4, top = 22, bottom = 14 + LH * 2;
  const vs = points.map((p) => p.value), cut = { any: false };
  const s = scale(Math.min(0, ...vs) * 1.12, Math.max(0, ...vs) * 1.12, h - bottom, top);
  const bw = (W - padL - padR) / points.length;
  const showAll = points.every((p) => textW(`${fmt(p.value, decimals)}${unit}`, VAL) <= bw - 2);
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" ${frame('bars', s, 'y', unit)} role="img" aria-label="${esc(`${title}: ${points.map((p) => `${p.label} ${fmt(p.value, decimals)}${unit}`).join(', ')}`)}">
    <line x1="${padL}" x2="${W - padR}" y1="${s(0)}" y2="${s(0)}" class="axis"/>
    ${points.map((p, i) => { const w = Math.min(bw * 0.6, 48), x = padL + i * bw + (bw - w) / 2, ye = s(p.value); const val = `${fmt(p.value, decimals)}${unit}`; return `
      <g class="mark" tabindex="0" data-tip="${esc(p.tip || `${p.label}: ${val}`)}">
        <rect class="hit" x="${padL + i * bw}" y="${top}" width="${bw}" height="${h - top - bottom}"/>
        ${barMark(s, 'y', x, w, 0, p.value, p.now ? 'bar now' : 'bar', cut)}
        ${(showAll || p.now) && textW(val, VAL) <= bw + 8 ? `<text x="${x + w / 2}" y="${p.value < 0 ? ye + 14 : ye - 6}" text-anchor="middle" class="val">${esc(val)}</text>` : ''}
        ${tlines(fit(p.label, bw - 6, LAB, 2), x + w / 2, h - bottom + 14, 'middle', 'lab')}
      </g>`; }).join('')}
  </svg>`;
}

// A line over time, with an optional shaded target band (for example a guided margin range). A line
// reads by position, not length, so its axis fits the data; the ticks are round and carry the unit.
export function line({ points, title, unit = '%', decimals = 1, band = null, W = 560, h = 190 }) {
  points = (points || []).filter((p) => finite(p.value));
  if (!points.length) return NO_DATA;
  if (band && !(finite(band.low) && finite(band.high))) band = null;
  const padR = 12, top = 20, bottom = 34;
  const vals = points.map((p) => p.value).concat(band ? [band.low, band.high] : []);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals)), td = tickDecimals(ticks);
  const padL = Math.ceil(Math.max(...ticks.map((t) => textW(`${fmt(t, td)}${unit}`)))) + 10; // the gutter fits the widest tick
  const s = scale(ticks[0], ticks[ticks.length - 1], h - bottom, top);
  const step = points.length === 1 ? 0 : (W - padL - padR) / (points.length - 1);
  const x = (i) => r2(padL + (points.length === 1 ? (W - padL - padR) / 2 : i * step));
  // Thin the x labels until neighbours no longer touch; the last (current) label always shows.
  const widest = Math.max(...points.map((p) => textW(p.label)));
  const every = step ? Math.max(1, Math.ceil((widest + 10) / step)) : 1;
  const showLab = (i) => i === points.length - 1 || ((points.length - 1 - i) % every === 0);
  const bandLabel = band ? fit(band.label || 'Target', W - padL - padR - 8, LAB, 1)[0] : '';
  const [bl, bh] = band ? [Math.min(band.low, band.high), Math.max(band.low, band.high)] : [];
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" ${frame('line', s, 'y', unit)} role="img" aria-label="${esc(`${title}: ${points.map((p) => `${p.label} ${fmt(p.value, decimals)}${unit}`).join(', ')}${band ? `; target ${bl} to ${bh}${unit}` : ''}`)}">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${s(t)}" y2="${s(t)}" class="grid"/><text x="${padL - 6}" y="${s(t) + 4}" text-anchor="end" class="lab tick" data-v="${t}">${fmt(t, td)}${esc(unit)}</text>`).join('')}
    ${band ? `<rect x="${padL}" y="${s(bh)}" width="${W - padL - padR}" height="${Math.max(2, s(bl) - s(bh))}" class="band"/><text x="${W - padR - 4}" y="${s(bh) - 5}" text-anchor="end" class="lab">${esc(bandLabel)}</text>` : ''}
    <polyline points="${points.map((p, i) => `${x(i)},${s(p.value)}`).join(' ')}" class="line"/>
    ${points.map((p, i) => { const anchor = i === points.length - 1 && points.length > 1 ? 'end' : i === 0 && points.length > 1 ? 'start' : 'middle'; return `<g class="mark" tabindex="0" data-tip="${esc(p.tip || `${p.label}: ${fmt(p.value, decimals)}${unit}`)}">
      <rect class="hit" x="${x(i) - Math.max(14, step / 2)}" y="${top}" width="${Math.max(28, step)}" height="${h - top - bottom}"/>
      <circle cx="${x(i)}" cy="${s(p.value)}" r="${p.now ? 5.5 : 4}" class="${p.now ? 'dot now' : 'dot'}" data-v="${p.value}"/>
      ${p.now ? `<text x="${x(i) + (anchor === 'end' ? 4 : 0)}" y="${s(p.value) - 10}" text-anchor="${anchor}" class="val">${fmt(p.value, decimals)}${esc(unit)}</text>` : ''}
      ${showLab(i) ? `<text x="${x(i) + (anchor === 'end' ? 4 : anchor === 'start' ? -4 : 0)}" y="${h - bottom + 16}" text-anchor="${anchor}" class="lab">${esc(p.label)}</text>` : ''}</g>`; }).join('')}
  </svg>`;
}

// Waterfall: start, signed steps, end. Rises in the ok colour, falls in the bad colour, both labelled.
// If the steps do not add up to the change, the remainder is drawn as its own "Not explained" step
// rather than left as a silent jump. When every value is positive the axis is cut above zero so small
// steps stay visible; barMark marks the cut and the caption says where the axis starts.
export function waterfall({ start, steps, end, title, unit = '%', decimals = 1, W = 560, h = 230 }) {
  if (!finite(start?.value) || !finite(end?.value)) return NO_DATA;
  const padL = 4, padR = 4, top = 26;
  const cols = [{ label: start.label, from: 0, to: start.value, kind: 'total' }];
  let run = start.value;
  for (const st of (steps || []).filter((x) => finite(x.delta))) { cols.push({ label: st.label, from: run, to: run + st.delta, kind: st.delta >= 0 ? 'up' : 'down', delta: st.delta, tip: st.tip }); run += st.delta; }
  const gap = end.value - run;
  if (Math.abs(gap) >= 0.005) cols.push({ label: 'Not explained', from: run, to: end.value, kind: 'gap', delta: gap, tip: `Not explained by the drivers listed: ${gap > 0 ? '+' : ''}${fmt(gap * 100, 0)} bps` });
  cols.push({ label: end.label, from: 0, to: end.value, kind: 'total' });
  const bw = (W - padL - padR) / cols.length;
  // Try the normal label size; if a word would be cut, step down one size before truncating.
  let lfs = LAB, labelLines = cols.map((c) => fit(c.label, bw - 6, lfs, 3));
  if (labelLines.some((l) => l.some((x) => x.endsWith('…')))) { lfs = LAB - 1.5; labelLines = cols.map((c) => fit(c.label, bw - 4, lfs, 3)); }
  const bottom = 14 + LH * Math.max(...labelLines.map((l) => l.length)) + 2;
  const valText = (c, withUnit) => (c.kind === 'total' ? `${fmt(c.to, decimals)}${unit}` : `${c.delta > 0 ? '+' : ''}${fmt(c.delta * 100, 0)}${withUnit ? ' bps' : ''}`);
  const withUnit = cols.every((c) => textW(valText(c, true), VAL) <= bw - 2);
  const ends = cols.flatMap((c) => (c.kind === 'total' ? [c.to] : [c.from, c.to]));
  const hi = Math.max(0, ...ends), stepEnds = cols.filter((c) => c.kind !== 'total').flatMap((c) => [c.from, c.to]);
  let lo = Math.min(0, ...ends);
  // Bars start at zero. The axis is cut only when the smallest step would be thinner than MIN_STEP_PX
  // drawn from zero, because a cut makes the totals look further apart than they are.
  const smallest = Math.min(...cols.filter((c) => c.kind !== 'total' && c.delta).map((c) => Math.abs(c.delta)));
  if (lo === 0 && hi > 0 && (smallest / hi) * (h - top - bottom) < MIN_STEP_PX) { const sl = Math.min(...stepEnds, ...cols.filter((c) => c.kind === 'total').map((c) => c.to)); lo = Math.max(0, Math.floor(sl - (hi - sl) * 0.6)); }
  const s = scale(lo, hi, h - bottom, top), cut = { any: false };
  const base = s(Math.max(s.lo, Math.min(s.hi, 0)));
  const marks = cols.map((c, i) => { const w = Math.min(bw * 0.64, 56), x = padL + i * bw + (bw - w) / 2; const yTop = Math.min(s(Math.max(s.lo, c.from)), s(c.to)), yBot = Math.max(s(Math.max(s.lo, c.from)), s(c.to));
    const cls = c.kind === 'total' ? 'bar' : c.kind === 'gap' ? 'bar gap' : c.kind === 'up' ? 'bar up' : 'bar down';
    const neg = c.kind === 'total' ? c.to < 0 : false;
    return `<g class="mark" tabindex="0" data-tip="${esc(c.tip || `${c.label}: ${valText(c, true)}`)}"><rect class="hit" x="${padL + i * bw}" y="${top}" width="${bw}" height="${h - top - bottom}"/>
        ${barMark(s, 'y', x, w, c.from, c.to, cls, cut)}
        <text x="${x + w / 2}" y="${neg ? yBot + 14 : yTop - 6}" text-anchor="middle" class="val">${esc(valText(c, withUnit))}</text>
        ${tlines(labelLines[i], x + w / 2, h - bottom + 14, 'middle', lfs < LAB ? 'lab sm' : 'lab', lfs < LAB ? LH - 1.5 : LH)}</g>`; }).join('');
  const note = [cutNote(cut, s, unit, 0), withUnit ? '' : 'Changes in basis points (bps).'].filter(Boolean).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" ${frame('waterfall', s, 'y', unit)} role="img" aria-label="${esc(`${title}: ${cols.map((c) => `${c.label} ${valText(c, true)}`).join(', ')}`)}">
    <line x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}" class="axis"/>
    ${marks}
  </svg>${note ? `<p class="tiny chart-note">${note}</p>` : ''}`;
}

// Horizontal bars around zero, for changes such as segment margin change in bps. The zero line sits
// where the data puts it (all negative: at the right), and every value label is placed where it fits.
// A row with total: true (a net change) is drawn in the accent below a rule; gap: true marks a
// remainder the other rows do not explain.
export function diverging({ rows, title, unit = ' bps', W = 560 }) {
  rows = (rows || []).filter((r) => finite(r.value));
  if (!rows.length) return NO_DATA;
  const gap = 8;
  const labMax = Math.min(W * 0.36, Math.max(...rows.map((r) => textW(r.label, 12))) + 4);
  // A label that does not fit wraps to a second line (all rows then get the taller height), then truncates.
  const labels = rows.map((r) => fit(r.label ?? '', labMax, 12, 2));
  const rowH = labels.some((l) => l.length > 1) ? 40 : 30;
  const plotL = labMax + gap, plotR = W - 4;
  const neg = Math.max(0, ...rows.map((r) => -r.value)), pos = Math.max(0, ...rows.map((r) => r.value));
  const valW = Math.max(...rows.map((r) => textW(`${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`, VAL))) + 8;
  // Reserve room for outside labels on each side that has bars.
  const innerL = plotL + (neg ? valW : 0), innerR = plotR - (pos ? valW : 0);
  const s = scale(-neg, pos, innerL, innerR), cut = { any: false };
  const zero = s(0), h = rows.length * rowH + 8;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" ${frame('diverging', s, 'x', unit)} role="img" aria-label="${esc(`${title}: ${rows.map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`).join(', ')}`)}">
    <line x1="${zero}" x2="${zero}" y1="2" y2="${h - 4}" class="axis"/>
    ${rows.map((r, i) => { const yy = 4 + i * rowH, cy = yy + rowH / 2 + 4, pe = s(r.value);
      const val = `${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`;
      const vx = r.value >= 0 ? Math.max(pe, zero + 2) + 6 : Math.min(pe, zero - 2) - 6;
      return `<g class="mark" tabindex="0" data-tip="${esc(r.tip || `${r.label}: ${val}`)}"><rect class="hit" x="0" y="${yy}" width="${W}" height="${rowH - 2}"/>
        ${r.total ? `<line class="sep" x1="0" x2="${W}" y1="${yy}" y2="${yy}"/>` : ''}${tlines(labels[i], 0, cy - (labels[i].length - 1) * 7, 'start', 'lab strong')}
        ${barMark(s, 'x', yy + 7, rowH - 14, 0, r.value, r.total ? 'bar total' : r.gap ? 'bar gap' : r.value >= 0 ? 'bar up' : 'bar down', cut)}
        <text x="${vx}" y="${cy}" text-anchor="${r.value >= 0 ? 'start' : 'end'}" class="val">${esc(val)}</text></g>`; }).join('')}
  </svg>`;
}

// A one-line scale: value markers against a shaded range, such as the margin needed for the rest of
// the year against the guided range and the best quarter on record. marks: [{value, label, bad}].
// Ticks are round, about one per 70 px, and the end ticks are anchored inward so they stay inside.
export function gauge({ marks, band = null, title, unit = '%', decimals = 1, W = 640 }) {
  marks = (marks || []).filter((m) => finite(m.value));
  if (!marks.length) return NO_DATA;
  if (band && !(finite(band.low) && finite(band.high))) band = null;
  const pad = 14;
  const vals = marks.map((m) => m.value).concat(band ? [band.low, band.high] : []);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), Math.max(2, Math.min(8, Math.floor((W - 2 * pad) / 70)))), td = tickDecimals(ticks);
  const s = scale(ticks[0], ticks[ticks.length - 1], pad, W - pad);
  const sorted = [...marks].sort((a, b) => a.value - b.value);
  // Marker labels: a label that would touch its left neighbour drops to the next row.
  let lastEnd = -Infinity, rows = 0;
  const placed = sorted.map((m) => { const t = `${fmt(m.value, decimals)}${unit}`, w = textW(t, 12); const cx = Math.min(W - pad - w / 2, Math.max(pad + w / 2, s(m.value))); const row = cx - w / 2 < lastEnd + 6 ? 1 : 0; if (!row) lastEnd = cx + w / 2; rows = Math.max(rows, row); return { ...m, t, cx, row }; });
  const H = 100 + rows * 15;
  const [bl, bh] = band ? [Math.min(band.low, band.high), Math.max(band.low, band.high)] : [];
  const bandLabel = band ? band.label || `${bl} to ${bh}${unit}` : '';
  const bw = band ? textW(bandLabel) : 0, bx = band ? Math.min(W - pad - bw / 2, Math.max(pad + bw / 2, (s(bl) + s(bh)) / 2)) : 0;
  const tickAnchor = (t, i) => { const w = textW(`${fmt(t, td)}${unit}`); return i === 0 && s(t) - w / 2 < 0 ? 'start' : i === ticks.length - 1 && s(t) + w / 2 > W ? 'end' : 'middle'; };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" ${frame('gauge', s, 'x', unit)} role="img" aria-label="${esc(`${title}: ${marks.map((m) => `${m.label} ${fmt(m.value, decimals)}${unit}`).join(', ')}${band ? `; ${bandLabel}` : ''}`)}">
    <rect x="${pad}" y="40" width="${W - 2 * pad}" height="10" rx="5" fill="var(--sunk)"/>
    ${band ? `<rect x="${Math.min(s(bl), s(bh) - 2)}" y="36" width="${Math.max(2, s(bh) - s(bl))}" height="18" rx="4" class="gauge-band" data-v="${bh}" data-b="${bl}"/><text class="lab" x="${bx}" y="28" text-anchor="middle">${esc(bandLabel)}</text>` : ''}
    ${ticks.map((t, i) => `<text class="lab tick" data-v="${t}" x="${s(t)}" y="${H - 4}" text-anchor="${tickAnchor(t, i)}">${fmt(t, td)}${esc(unit)}</text>`).join('')}
    ${placed.map((m) => `<g class="mark${m.bad ? ' bad' : ''}" tabindex="0" data-tip="${esc(`${m.label}: ${m.t}`)}"><line class="gauge-tick" x1="${s(m.value)}" x2="${s(m.value)}" y1="34" y2="58"/><circle class="gauge-dot" cx="${s(m.value)}" cy="45" r="${m.bad ? 6 : 4}" data-v="${m.value}"/><text class="val" x="${m.cx}" y="${74 + m.row * 15}" text-anchor="middle">${esc(m.t)}</text></g>`).join('')}
  </svg>`;
}

// One tooltip for every chart on the page: hover or keyboard focus on any [data-tip]; tap on touch.
export function installTooltip() {
  if (document.getElementById('tip')) return;
  const tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
  const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.style.opacity = '1'; const r = tip.getBoundingClientRect(); tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`; tip.style.top = `${Math.max(8, y - r.height - 12)}px`; };
  const hide = () => { tip.style.opacity = '0'; };
  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const el = e.target.closest?.('[data-tip]'); el ? show(el, e.clientX, e.clientY) : hide(); });
  document.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; const el = e.target.closest?.('[data-tip]'); el ? show(el, e.clientX, e.clientY) : hide(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, { passive: true });
}
