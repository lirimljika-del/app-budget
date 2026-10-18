/* Graphiques SVG sobres et interactifs (aucune bibliothèque externe). Toucher un élément affiche sa valeur. */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const niceMax = v => {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  };
  const short = c => { const v = Math.round(c / 100); return Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v); };
  const css = (prop, color) => `style="${prop}:${color}"`;      // accepte les variables CSS (thème clair/sombre)
  const TIP0 = '<div class="chart-tip">Touche le graphique pour voir les valeurs</div>';

  // Donut : parts = [{label, value, color, tip}]
  function donut(parts, centerTop, centerBottom) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    const R = 62, r = 46, cx = 80, cy = 80;
    if (!total) return `<svg viewBox="0 0 160 160" class="chart donut" role="img" aria-label="Aucune dépense"><circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" ${css('stroke', 'var(--track)')} stroke-width="${R - r}"/><text x="80" y="85" text-anchor="middle" class="ct-sub">Aucune donnée</text></svg>`;
    let a0 = -Math.PI / 2, out = '';
    const GAP = parts.length > 1 ? 0.03 : 0;
    for (const p of parts) {
      const ang = p.value / total * Math.PI * 2;
      if (ang <= 0) continue;
      const a1 = a0 + ang - GAP, s = a0 + GAP / 2, big = ang - GAP > Math.PI ? 1 : 0;
      const pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
      const tip = `data-tip="${esc(p.tip || p.label)}"`;
      if (parts.length === 1) out += `<circle class="hit" ${tip} cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" ${css('stroke', p.color)} stroke-width="${R - r}"/>`;
      else out += `<path class="hit" ${tip} d="M ${pt(R, s)} A ${R} ${R} 0 ${big} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${big} 0 ${pt(r, s)} Z" ${css('fill', p.color)}/>`;
      a0 += ang;
    }
    return `<svg viewBox="0 0 160 160" class="chart donut" role="img" aria-label="Répartition des dépenses">${out}
      <text x="80" y="77" text-anchor="middle" class="ct-big">${esc(centerTop)}</text><text x="80" y="95" text-anchor="middle" class="ct-sub">${esc(centerBottom)}</text></svg>${TIP0}`;
  }

  // Courbe : series = [{pts:[v|null], color, dashed, fill}] ; tip(i) → texte
  function line(opts) {
    const { n, series, markY, height = 170, tip } = opts;
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
      if (s.fill && pts.length > 1) g += `<path d="${d} L ${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L ${pts[0][0].toFixed(1)} ${y(0)} Z" ${css('fill', s.color)} opacity=".10"/>`;
      g += `<path d="${d}" fill="none" ${css('stroke', s.color)} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"${s.dashed ? ' stroke-dasharray="5 5"' : ''}/>`;
      const lp = pts[pts.length - 1];
      g += `<circle cx="${lp[0]}" cy="${lp[1]}" r="3.5" ${css('fill', s.color)}/>`;
    }
    if (tip) {
      const cw = (W - L - Rr) / Math.max(1, n - 1);
      for (let i = 0; i < n; i++) g += `<rect class="hit" x="${(x(i) - cw / 2).toFixed(1)}" y="${T}" width="${cw.toFixed(1)}" height="${H - T - B}" fill="transparent" data-tip="${esc(tip(i))}"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'Courbe')}">${g}</svg>${tip ? TIP0 : ''}`;
  }

  // Barres groupées : groups = [{label, tip, bars:[{value,color}]}]
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
        s += `<rect x="${(x0 + bi * bw + 1).toFixed(1)}" y="${(y(0) - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" ${css('fill', b.color)}/>`;
      });
      s += `<text x="${cx}" y="${H - 7}" text-anchor="middle" class="ax">${esc(g.label)}</text>`;
      if (g.tip) s += `<rect class="hit" x="${(cx - gw / 2).toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${H - T - B + 14}" fill="transparent" data-tip="${esc(g.tip)}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'Barres')}">${s}</svg>${groups.some(g => g.tip) ? TIP0 : ''}`;
  }

  document.addEventListener('click', e => {
    const h = e.target.closest && e.target.closest('.chart .hit'); if (!h) return;
    const tip = h.closest('.card, .sheet') && h.closest('.card, .sheet').querySelector('.chart-tip');
    if (tip) tip.innerHTML = esc(h.getAttribute('data-tip')).replace(/^(.*?) · /, '<b>$1</b> · ');
  });

  window.Charts = { donut, line, bars };
})();
