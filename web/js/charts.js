// Small SVG charts. One series each, so no categorical palette: the accent carries the data and the
// reserved status colours carry state, always beside a text label. Every mark has a hover/focus tooltip
// (data-tip) and every chart has a text alternative (aria-label plus the table it summarises).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 0) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });

// Vertical bars over time. points: [{label, value, tip, now}]
export function bars({ points, title, unit = '', decimals = 0, h = 180 }) {
  const W = 560, padL = 8, padR = 8, top = 22, bottom = 26;
  const max = Math.max(...points.map((p) => p.value), 0) * 1.12 || 1;
  const bw = (W - padL - padR) / points.length;
  const y = (v) => top + (h - top - bottom) * (1 - v / max);
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}: ${points.map((p) => `${p.label} ${fmt(p.value, decimals)}${unit}`).join(', ')}">
    <line x1="${padL}" x2="${W - padR}" y1="${h - bottom}" y2="${h - bottom}" class="axis"/>
    ${points.map((p, i) => { const x = padL + i * bw + bw * 0.22, w = bw * 0.56, yy = y(p.value), hh = h - bottom - yy; return `
      <g class="mark" tabindex="0" data-tip="${esc(p.tip || `${p.label}: ${fmt(p.value, decimals)}${unit}`)}">
        <rect class="hit" x="${padL + i * bw}" y="${top}" width="${bw}" height="${h - top - bottom}"/>
        <path d="M${x},${h - bottom} V${yy + 4} Q${x},${yy} ${x + 4},${yy} H${x + w - 4} Q${x + w},${yy} ${x + w},${yy + 4} V${h - bottom} Z" class="${p.now ? 'bar now' : 'bar'}"/>
        ${p.now || i === 0 ? `<text x="${x + w / 2}" y="${yy - 6}" text-anchor="middle" class="val">${fmt(p.value, decimals)}${unit}</text>` : ''}
        <text x="${x + w / 2}" y="${h - 8}" text-anchor="middle" class="lab">${esc(p.label)}</text>
      </g>`; }).join('')}
  </svg>`;
}

// A line over time, with an optional shaded target band (for example a guided margin range).
export function line({ points, title, unit = '%', decimals = 1, band = null, h = 180 }) {
  const W = 560, padL = 34, padR = 14, top = 18, bottom = 26;
  const vals = points.map((p) => p.value).concat(band ? [band.low, band.high] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || 1; lo -= pad; hi += pad;
  const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => top + (h - top - bottom) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}: ${points.map((p) => `${p.label} ${fmt(p.value, decimals)}${unit}`).join(', ')}${band ? `; target ${band.low} to ${band.high}${unit}` : ''}">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="lab">${fmt(t, 1)}</text>`).join('')}
    ${band ? `<rect x="${padL}" y="${y(band.high)}" width="${W - padL - padR}" height="${Math.max(2, y(band.low) - y(band.high))}" class="band"/><text x="${W - padR - 4}" y="${y(band.high) - 5}" text-anchor="end" class="lab">${esc(band.label || 'Target')}</text>` : ''}
    <polyline points="${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}" class="line"/>
    ${points.map((p, i) => `<g class="mark" tabindex="0" data-tip="${esc(p.tip || `${p.label}: ${fmt(p.value, decimals)}${unit}`)}">
      <rect class="hit" x="${x(i) - 22}" y="${top}" width="44" height="${h - top - bottom}"/>
      <circle cx="${x(i)}" cy="${y(p.value)}" r="${p.now ? 5.5 : 4}" class="${p.now ? 'dot now' : 'dot'}"/>
      ${p.now ? `<text x="${x(i)}" y="${y(p.value) - 10}" text-anchor="middle" class="val">${fmt(p.value, decimals)}${unit}</text>` : ''}
      <text x="${x(i)}" y="${h - 8}" text-anchor="middle" class="lab">${esc(p.label)}</text></g>`).join('')}
  </svg>`;
}

// Waterfall: start, signed steps, end. Rises in the ok colour, falls in the bad colour, both labelled.
export function waterfall({ start, steps, end, title, unit = '%', decimals = 1, h = 220 }) {
  const W = 560, padL = 8, padR = 8, top = 24, bottom = 40;
  const cols = [{ label: start.label, from: 0, to: start.value, kind: 'total' }];
  let run = start.value;
  for (const s of steps) { cols.push({ label: s.label, from: run, to: run + s.delta, kind: s.delta >= 0 ? 'up' : 'down', delta: s.delta, tip: s.tip }); run += s.delta; }
  cols.push({ label: end.label, from: 0, to: end.value, kind: 'total' });
  const vals = cols.flatMap((c) => [c.from, c.to]).filter((v, i) => i % 2 || cols[Math.floor(i / 2)].kind !== 'total');
  let lo = Math.min(...vals), hi = Math.max(...cols.map((c) => Math.max(c.from, c.to)));
  lo = Math.max(0, lo - (hi - lo) * 0.6);
  const bw = (W - padL - padR) / cols.length;
  const y = (v) => top + (h - top - bottom) * (1 - (v - lo) / (hi - lo));
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}: ${cols.map((c) => `${c.label} ${c.kind === 'total' ? fmt(c.to, decimals) + unit : (c.delta > 0 ? '+' : '') + fmt(c.delta * 100, 0) + ' bps'}`).join(', ')}">
    <line x1="${padL}" x2="${W - padR}" y1="${h - bottom}" y2="${h - bottom}" class="axis"/>
    ${cols.map((c, i) => { const x = padL + i * bw + bw * 0.18, w = bw * 0.64; const y1 = y(Math.max(c.from, c.to)), y2 = c.kind === 'total' ? h - bottom : y(Math.min(c.from, c.to));
      const val = c.kind === 'total' ? `${fmt(c.to, decimals)}${unit}` : `${c.delta > 0 ? '+' : ''}${fmt(c.delta * 100, 0)} bps`;
      return `<g class="mark" tabindex="0" data-tip="${esc(c.tip || `${c.label}: ${val}`)}"><rect class="hit" x="${padL + i * bw}" y="${top}" width="${bw}" height="${h - top - bottom}"/>
        <rect x="${x}" y="${y1}" width="${w}" height="${Math.max(2, y2 - y1)}" rx="3" class="${c.kind === 'total' ? 'bar' : c.kind === 'up' ? 'bar up' : 'bar down'}"/>
        <text x="${x + w / 2}" y="${y1 - 6}" text-anchor="middle" class="val">${val}</text>
        ${String(c.label).split(' ').reduce((acc, wd) => { const last = acc[acc.length - 1]; if (last && (last + ' ' + wd).length <= 12) acc[acc.length - 1] = last + ' ' + wd; else acc.push(wd); return acc; }, []).slice(0, 2).map((ln, k) => `<text x="${x + w / 2}" y="${h - bottom + 14 + k * 12}" text-anchor="middle" class="lab">${esc(ln)}</text>`).join('')}</g>`; }).join('')}
  </svg>`;
}

// Horizontal diverging bars around zero, for changes (for example segment margin change in bps).
export function diverging({ rows, title, unit = ' bps' }) {
  const W = 560, rowH = 34, labW = 150, padR = 60, h = rows.length * rowH + 10;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const mid = labW + (W - labW - padR) / 2, half = (W - labW - padR) / 2;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}: ${rows.map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`).join(', ')}">
    <line x1="${mid}" x2="${mid}" y1="2" y2="${h - 4}" class="axis"/>
    ${rows.map((r, i) => { const w = (Math.abs(r.value) / max) * half, x = r.value >= 0 ? mid : mid - w, yy = 6 + i * rowH;
      return `<g class="mark" tabindex="0" data-tip="${esc(r.tip || `${r.label}: ${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}`)}"><rect class="hit" x="0" y="${yy}" width="${W}" height="${rowH - 4}"/>
        <text x="${labW - 10}" y="${yy + 19}" text-anchor="end" class="lab strong">${esc(r.label)}</text>
        <rect x="${x}" y="${yy + 6}" width="${Math.max(2, w)}" height="${rowH - 16}" rx="3" class="${r.value >= 0 ? 'bar up' : 'bar down'}"/>
        <text x="${r.value >= 0 ? x + w + 6 : x - 6}" y="${yy + 19}" text-anchor="${r.value >= 0 ? 'start' : 'end'}" class="val">${r.value > 0 ? '+' : ''}${fmt(r.value)}${unit}</text></g>`; }).join('')}
  </svg>`;
}

// One tooltip for every chart on the page: hover or keyboard focus on any [data-tip].
export function installTooltip() {
  if (document.getElementById('tip')) return;
  const tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
  const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.style.opacity = '1'; const r = tip.getBoundingClientRect(); tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`; tip.style.top = `${Math.max(8, y - r.height - 12)}px`; };
  const hide = () => { tip.style.opacity = '0'; };
  document.addEventListener('pointermove', (e) => { const el = e.target.closest?.('[data-tip]'); el ? show(el, e.clientX, e.clientY) : hide(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, { passive: true });
}
