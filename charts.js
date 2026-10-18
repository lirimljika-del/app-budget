/* Graphiques SVG légers (aucune bibliothèque externe). */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const niceMax = v => {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  };
  const short = c => { const v = Math.round(c / 100); return Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v); };

  // Donut : parts = [{label, value, color}]
  function donut(parts, centerTop, centerBottom) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    const R = 62, r = 44, cx = 80, cy = 80;
    if (!total) return `<svg viewBox="0 0 160 160" class="chart donut" role="img" aria-label="Aucune dépense"><circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="var(--track)" stroke-width="${R - r}"/><text x="80" y="85" text-anchor="middle" class="ct-sub">Aucune donnée</text></svg>`;
    let a0 = -Math.PI / 2, out = '';
    const GAP = parts.length > 1 ? 0.03 : 0;
    for (const p of parts) {
      const ang = p.value / total * Math.PI * 2;
      if (ang <= 0) continue;
      const a1 = a0 + ang - GAP, s = a0 + GAP / 2, big = ang - GAP > Math.PI ? 1 : 0;
      const pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
      if (parts.length === 1) out += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${p.color}" stroke-width="${R - r}"/>`;
      else out += `<path d="M ${pt(R, s)} A ${R} ${R} 0 ${big} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${big} 0 ${pt(r, s)} Z" fill="${p.color}"/>`;
      a0 += ang;
    }
    return `<svg viewBox="0 0 160 160" class="chart donut" role="img" aria-label="Répartition des dépenses">${out}
      <text x="80" y="77" text-anchor="middle" class="ct-big">${esc(centerTop)}</text><text x="80" y="95" text-anchor="middle" class="ct-sub">${esc(centerBottom)}</text></svg>`;
  }

  // Courbe cumulée : series = [{pts:[v|null], color, dashed, fill}], labels sur l'axe X = 1..n
  function line(opts) {
    const { n, series, markY, height = 170 } = opts;
    const W = 340, H = height, L = 34, Rr = 8, T = 10, B = 22;
    let max = 0;
    for (const s of series) for (const v of s.pts) if (v != null && v > max) max = v;
    if (markY && markY > max) max = markY;
    max = niceMax(max);
    const x = i => L + (n <= 1 ? 0 : i * (W - L - Rr) / (n - 1));
    const y = v => T + (H - T - B) * (1 - v / max);
    let g = '';
    for (let k = 0; k <= 3; k++) {
      const v = max * k / 3, yy = y(v);
      g += `<line x1="${L}" x2="${W - Rr}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 3}" text-anchor="end" class="ax">${short(v)}</text>`;
    }
    for (const i of [0, Math.floor((n - 1) / 2), n - 1]) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="ax">${i + 1}</text>`;
    if (markY) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(markY)}" y2="${y(markY)}" class="mark"/>`;
    for (const s of series) {
      const pts = s.pts.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
      if (!pts.length) continue;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (s.fill && pts.length > 1) g += `<path d="${d} L ${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L ${pts[0][0].toFixed(1)} ${y(0)} Z" fill="${s.color}" opacity=".13"/>`;
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${s.dashed ? ' stroke-dasharray="5 5"' : ''}/>`;
      const lp = pts[pts.length - 1];
      g += `<circle cx="${lp[0]}" cy="${lp[1]}" r="3.5" fill="${s.color}"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'Courbe')}">${g}</svg>`;
  }

  // Barres groupées : groups = [{label, bars:[{value,color}]}]
  function bars(opts) {
    const { groups, height = 170 } = opts;
    const W = 340, H = height, L = 34, Rr = 6, T = 10, B = 24;
    let max = 0;
    for (const g of groups) for (const b of g.bars) if (b.value > max) max = b.value;
    max = niceMax(max);
    const gw = (W - L - Rr) / Math.max(1, groups.length);
    const k = groups[0] ? groups[0].bars.length : 1;
    const bw = Math.min(26, (gw * 0.72) / k);
    const y = v => T + (H - T - B) * (1 - Math.max(0, v) / max);
    let s = '';
    for (let i = 0; i <= 3; i++) {
      const v = max * i / 3, yy = y(v);
      s += `<line x1="${L}" x2="${W - Rr}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 3}" text-anchor="end" class="ax">${short(v)}</text>`;
    }
    groups.forEach((g, gi) => {
      const cx = L + gw * gi + gw / 2, x0 = cx - (bw * k) / 2;
      g.bars.forEach((b, bi) => {
        const h = Math.max(b.value > 0 ? 2 : 0, y(0) - y(b.value));
        s += `<rect x="${(x0 + bi * bw + 1).toFixed(1)}" y="${(y(0) - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${b.color}"/>`;
      });
      s += `<text x="${cx}" y="${H - 7}" text-anchor="middle" class="ax">${esc(g.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'Barres')}">${s}</svg>`;
  }

  window.Charts = { donut, line, bars };
})();
