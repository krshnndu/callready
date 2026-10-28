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
const fmt = (v, d = 0) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
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
const LH = 14; // line height for 11 px labels: the glyph box is about 13.5 px tall
const tlines = (lines, x, y, anchor, cls, lh = LH) => lines.map((l, i) => `<text x="${x}" y="${y + i * lh}" text-anchor="${anchor}" class="${cls}">${esc(l)}</text>`).join('');

// Vertical bars over time. points: [{label, value, tip, now}]
export function bars({ points, title, unit = '', decimals = 0, W = 560, h = 190 }) {
  const padL = 4, padR = 4, top = 22, bottom = 14 + LH * 2;
  const max = Math.max(...points.map((p) => p.value), 0) * 1.12 || 1;
  const bw = (W - padL - padR) / points.length;
  const y = (v) => top + (h - top - bottom) * (1 - v / max);
  const showAll = points.every((p) => textW(`${fmt(p.value, decimals)}${unit}`, VAL) <= bw - 2);
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" role="img" aria-label="${esc(title)}: ${points.map((p) => `${p.label} ${fmt(p.value, decimals)}${unit}`).join(', ')}">
    <line x1="${padL}" x2="${W - padR}" y1="${h - bottom}" y2="${h - bottom}" class="axis"/>
    ${points.map((p, i) => { const w = Math.min(bw * 0.6, 48), x = padL + i * bw + (bw - w) / 2, yy = y(p.value); const val = `${fmt(p.value, decimals)}${unit}`; return `
      <g class="mark" tabindex="0" data-tip="${esc(p.tip || `${p.label}: ${val}`)}">
        <rect class="hit" x="${padL + i * bw}" y="${top}" width="${bw}" height="${h - top - bottom}"/>
        <path d="M${x},${h - bottom} V${yy + 4} Q${x},${yy} ${x + 4},${yy} H${x + w - 4} Q${x + w},${yy} ${x + w},${yy + 4} V${h - bottom} Z" class="${p.now ? 'bar now' : 'bar'}"/>
        ${(showAll || p.now) && textW(val, VAL) <= bw + 8 ? `<text x="${x + w / 2}" y="${yy - 6}" text-anchor="middle" class="val">${esc(val)}</text>` : ''}
        ${tlines(fit(p.label, bw - 6, LAB, 2), x + w / 2, h - bottom + 14, 'middle', 'lab')}
      </g>`; }).join('')}
  </svg>`;
}

// A line over time, with an optional shaded target band (for example a guided margin range).
export function line({ points, title, unit = '%', decimals = 1, band = null, W = 560, h = 190 }) {
  const padL = 34, padR = 12, top = 20, bottom = 34;
  const vals = points.map((p) => p.value).concat(band ? [band.low, band.high] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || 1; lo -= pad; hi += pad;
  const step = points.length === 1 ? 0 : (W - padL - padR) / (points.length - 1);
  const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : i * step);
  const y = (v) => top + (h - top - bottom) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  // Thin the x labels until neighbours no longer touch; the last (current) label always shows.
  const widest = Math.max(...points.map((p) => textW(p.label)));
  const every = step ? Math.max(1, Math.ceil((widest + 10) / step)) : 1;
  const showLab = (i) => i === points.length - 1 || ((points.length - 1 - i) % every === 0);
  const bandLabel = band ? fit(band.label || 'Target', W - padL - padR - 8, LAB, 1)[0] : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" role="img" aria-label="${esc(title)}: ${points.map((p) => `${p.label} ${fmt(p.value, decimals)}${unit}`).join(', ')}${band ? `; target ${band.low} to ${band.high}${unit}` : ''}">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="lab">${fmt(t, 1)}</text>`).join('')}
    ${band ? `<rect x="${padL}" y="${y(band.high)}" width="${W - padL - padR}" height="${Math.max(2, y(band.low) - y(band.high))}" class="band"/><text x="${W - padR - 4}" y="${y(band.high) - 5}" text-anchor="end" class="lab">${esc(bandLabel)}</text>` : ''}
    <polyline points="${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}" class="line"/>
    ${points.map((p, i) => { const anchor = i === points.length - 1 && points.length > 1 ? 'end' : i === 0 && points.length > 1 ? 'start' : 'middle'; return `<g class="mark" tabindex="0" data-tip="${esc(p.tip || `${p.label}: ${fmt(p.value, decimals)}${unit}`)}">
      <rect class="hit" x="${x(i) - Math.max(14, step / 2)}" y="${top}" width="${Math.max(28, step)}" height="${h - top - bottom}"/>
      <circle cx="${x(i)}" cy="${y(p.value)}" r="${p.now ? 5.5 : 4}" class="${p.now ? 'dot now' : 'dot'}"/>
      ${p.now ? `<text x="${x(i) + (anchor === 'end' ? 4 : 0)}" y="${y(p.value) - 10}" text-anchor="${anchor}" class="val">${fmt(p.value, decimals)}${unit}</text>` : ''}
      ${showLab(i) ? `<text x="${x(i) + (anchor === 'end' ? 4 : anchor === 'start' ? -4 : 0)}" y="${h - bottom + 16}" text-anchor="${anchor}" class="lab">${esc(p.label)}</text>` : ''}</g>`; }).join('')}
  </svg>`;
}

// Waterfall: start, signed steps, end. Rises in the ok colour, falls in the bad colour, both labelled.
// Values that do not fit their column drop the unit, which moves to the caption (unitNote).
export function waterfall({ start, steps, end, title, unit = '%', decimals = 1, W = 560, h = 230 }) {
  const padL = 4, padR = 4, top = 26;
  const cols = [{ label: start.label, from: 0, to: start.value, kind: 'total' }];
  let run = start.value;
  for (const s of steps) { cols.push({ label: s.label, from: run, to: run + s.delta, kind: s.delta >= 0 ? 'up' : 'down', delta: s.delta, tip: s.tip }); run += s.delta; }
  cols.push({ label: end.label, from: 0, to: end.value, kind: 'total' });
  const bw = (W - padL - padR) / cols.length;
  // Try the normal label size; if a word would be cut, step down one size before truncating.
  let lfs = LAB, labelLines = cols.map((c) => fit(c.label, bw - 6, lfs, 3));
  if (labelLines.some((l) => l.some((x) => x.endsWith('\u2026')))) { lfs = LAB - 1.5; labelLines = cols.map((c) => fit(c.label, bw - 4, lfs, 3)); }
  const bottom = 14 + LH * Math.max(...labelLines.map((l) => l.length)) + 2;
  const valText = (c, withUnit) => (c.kind === 'total' ? `${fmt(c.to, decimals)}${unit}` : `${c.delta > 0 ? '+' : ''}${fmt(c.delta * 100, 0)}${withUnit ? ' bps' : ''}`);
  const withUnit = cols.every((c) => textW(valText(c, true), VAL) <= bw - 2);
  const vals = cols.filter((c) => c.kind !== 'total').flatMap((c) => [c.from, c.to]);
  const hi = Math.max(...cols.map((c) => Math.max(c.from, c.to)));
  let lo = Math.min(...vals, hi); lo = Math.max(0, lo - (hi - lo) * 0.6);
  const y = (v) => top + (h - top - bottom) * (1 - (v - lo) / (hi - lo || 1));
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" role="img" aria-label="${esc(title)}: ${cols.map((c) => `${c.label} ${valText(c, true)}`).join(', ')}">
    <line x1="${padL}" x2="${W - padR}" y1="${h - bottom}" y2="${h - bottom}" class="axis"/>
    ${cols.map((c, i) => { const w = Math.min(bw * 0.64, 56), x = padL + i * bw + (bw - w) / 2; const y1 = y(Math.max(c.from, c.to)), y2 = c.kind === 'total' ? h - bottom : y(Math.min(c.from, c.to));
      return `<g class="mark" tabindex="0" data-tip="${esc(c.tip || `${c.label}: ${valText(c, true)}`)}"><rect class="hit" x="${padL + i * bw}" y="${top}" width="${bw}" height="${h - top - bottom}"/>
        <rect x="${x}" y="${y1}" width="${w}" height="${Math.max(2, y2 - y1)}" rx="3" class="${c.kind === 'total' ? 'bar' : c.kind === 'up' ? 'bar up' : 'bar down'}"/>
        <text x="${x + w / 2}" y="${y1 - 6}" text-anchor="middle" class="val">${esc(valText(c, withUnit))}</text>
        ${tlines(labelLines[i], x + w / 2, h - bottom + 14, 'middle', lfs < LAB ? 'lab sm' : 'lab', lfs < LAB ? LH - 1.5 : LH)}</g>`; }).join('')}
  </svg>${withUnit ? '' : '<p class="tiny chart-note">Changes in basis points (bps).</p>'}`;
}

// Horizontal bars around zero, for changes such as segment margin change in bps. The zero line sits
// where the data puts it (all negative: at the right), and every value label is placed where it fits.
export function diverging({ rows, title, unit = ' bps', W = 560 }) {
  const rowH = 30, gap = 8;
  const labMax = Math.min(W * 0.36, Math.max(...rows.map((r) => textW(r.label, 12))) + 4);
  const labels = rows.map((r) => fit(r.label, labMax, 12, 1)[0]);
  const plotL = labMax + gap, plotR = W - 4;
  const neg = Math.max(0, ...rows.map((r) => -r.value)), pos = Math.max(0, ...rows.map((r) => r.value));
  const valW = Math.max(...rows.map((r) => textW(`${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`, VAL))) + 8;
  // Reserve room for outside labels on each side that has bars.
  const innerL = plotL + (neg ? valW : 0), innerR = plotR - (pos ? valW : 0);
  const span = (neg + pos) || 1;
  const zero = innerL + (innerR - innerL) * (neg / span);
  const scale = (innerR - innerL) / span;
  const h = rows.length * rowH + 8;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" width="${W}" role="img" aria-label="${esc(title)}: ${rows.map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`).join(', ')}">
    <line x1="${zero}" x2="${zero}" y1="2" y2="${h - 4}" class="axis"/>
    ${rows.map((r, i) => { const w = Math.abs(r.value) * scale, x = r.value >= 0 ? zero : zero - w, yy = 4 + i * rowH, cy = yy + rowH / 2 + 4;
      const val = `${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`;
      const vx = r.value >= 0 ? x + w + 6 : x - 6;
      return `<g class="mark" tabindex="0" data-tip="${esc(r.tip || `${r.label}: ${val}`)}"><rect class="hit" x="0" y="${yy}" width="${W}" height="${rowH - 2}"/>
        <text x="0" y="${cy}" text-anchor="start" class="lab strong">${esc(labels[i])}</text>
        <rect x="${x}" y="${yy + 7}" width="${Math.max(2, w)}" height="${rowH - 14}" rx="3" class="${r.value >= 0 ? 'bar up' : 'bar down'}"/>
        <text x="${vx}" y="${cy}" text-anchor="${r.value >= 0 ? 'start' : 'end'}" class="val">${esc(val)}</text></g>`; }).join('')}
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
