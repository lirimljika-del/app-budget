/* Interface de l'application — JavaScript natif, aucune dépendance. */
(function () {
  'use strict';
  const E = window.Engine, Store = window.Store, Lock = window.Lock, Charts = window.Charts;

  // ---------- Utilitaires ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const WDL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const wdOf = iso => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).getDay();
  const todayStr = () => E.localDateStr();
  const curYm = () => todayStr().slice(0, 7);
  const BILL_EMOJI = { 'Loyer': '🏠', 'Assurance maladie': '🏥', 'Assurance auto': '🚗', 'Autre assurance': '🛡️', 'Téléphone': '📱', 'Internet': '🌐', 'Abonnement': '🔁', 'Leasing': '🚙', 'Impôts': '🏛️', 'Autre': '🧾' };
  const METHODS = ['Carte', 'Espèces', 'TWINT', 'Autre'];
  const EMOJIS = ['🏷️', '🐶', '🎁', '📚', '🏋️', '✈️', '🎮', '☕', '👕', '🔧', '🏠', '💡', '👶', '🎓', '🚗', '🍺'];
  const COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF', '#FF375F', '#5E5CE6', '#AC8E68'];

  const P = { // icônes (trait)
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    exp: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
    stats: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', chevL: '<path d="M15 18l-6-6 6-6"/>', chevR: '<path d="M9 18l6-6-6-6"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    up: '<path d="M18 15l-6-6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  };
  const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  // Point d'extension pour les modules (abonnements, import) : fonctions d'interface partagées.
  const App = { E, Store, Lock, Charts, views: {}, pages: {}, pageTab: {}, A: null };
  window.App = App;
  // ---------- État ----------
  let state = null;
  const ui = { billsTab: 'bills', tab: 'home', page: null, viewMonth: curYm(), statsRange: 'month', archiveYear: Number(curYm().slice(0, 4)), animate: true, lastDay: todayStr() };
  let form = {}; let lastCat = null;
  const cur = () => state.settings.currency || 'CHF';
  const money = (c, o = {}) => `<span class="num">${E.formatMoney(c, o)}</span>`;
  const mcur = (c, o = {}) => `${money(c, o)}&nbsp;${esc(cur())}`;
  const catOf = id => state.categories.find(c => c.id === id) || { id: '?', name: 'Catégorie supprimée', icon: '❔', color: '#8E8E93' };
  const month = ym => E.computeMonth(state, ym, todayStr());

  async function persist() { try { await Store.save(state); } catch (e) { toast('⚠️ Enregistrement impossible : ' + e.message); } }
  async function commit(fn, opts = {}) {
    const before = JSON.stringify(state);
    try { fn(); } catch (e) { toast('⚠️ ' + e.message); return false; }
    await persist();
    render();
    if (opts.msg) toast(opts.msg, opts.undo ? { label: 'Annuler', fn: async () => { state = JSON.parse(before); await persist(); render(); toast('Annulé'); } } : null);
    return true;
  }

  // ---------- Toast / feuilles ----------
  let toastT;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${msg}</span>${action ? '<button id="toast-act">' + esc(action.label) + '</button>' : ''}`;
    t.classList.add('show');
    if (action) $('#toast-act').onclick = () => { t.classList.remove('show'); action.fn(); };
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 6500 : 3200);
  }
  function openSheet(html) {
    closeSheet(true);
    document.body.insertAdjacentHTML('beforeend', `<div class="scrim" data-act="closeSheet"></div><div class="sheet" id="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`);
    document.body.style.overflow = 'hidden';
    const f = $('#sheet [autofocus]'); if (f) setTimeout(() => f.focus(), 280);
  }
  function closeSheet(keepScroll) {
    document.querySelectorAll('.scrim,.sheet').forEach(n => n.remove());
    if (!keepScroll) document.body.style.overflow = '';
  }
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const setErr = m => { const e = $('#sheet .err'); if (e) e.textContent = m || ''; };
  let pendingFns = [];
  function confirmSheet(title, text, buttons) {
    pendingFns = buttons.map(b => b.fn);
    openSheet(`<h3>${esc(title)}</h3><p style="color:var(--muted);margin:0 4px 8px">${text}</p><div class="actions">${buttons.map((b, i) => `<button class="btn ${b.cls || 'sec'}" data-act="pending" data-i="${i}">${esc(b.label)}</button>`).join('')}<button class="btn sec" data-act="closeSheet">Annuler</button></div>`);
  }

  // ---------- Briques d'affichage ----------
  const barCls = pct => (pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'good');
  const bar = (pct, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, pct || 0))}%"></i></div>`;
  const dateLabel = iso => `${WD[wdOf(iso)]} ${E.fmtDate(iso)}`;
  const empty = (t, s) => `<div class="empty"><b>${t}</b>${s || ''}</div>`;
  const monthNav = ym => `<div class="monthnav"><button data-act="mprev" aria-label="Mois précédent">${ic('chevL')}</button><b>${E.monthLabel(ym)}</b><button data-act="mnext" aria-label="Mois suivant">${ic('chevR')}</button></div>`;
  const backBtn = (label, act = 'back') => `<button class="back" data-act="${act}">${ic('chevL')}${esc(label)}</button>`;

  function expenseRow(e) {
    const c = catOf(e.category);
    return `<button class="item" data-act="editExpense" data-id="${e.id}"><span class="ico" style="background:${c.color}26">${c.icon}</span>
      <span class="m"><div class="t">${esc(e.desc || c.name)}</div><div class="s">${esc(c.name)}${e.method ? ' · ' + esc(e.method) : ''} · ${E.fmtDate(e.date)}${e.bankKey ? ' · 🏦' : ''}</div></span>
      <span class="a ${e.amount < 0 ? 'pos' : ''}">${e.amount < 0 ? '+' + money(-e.amount) : '−' + money(e.amount)}</span></button>`;
  }
  const STAT = { paid: ['good', 'Payée'], pending: ['muted', 'À payer'], overdue: ['bad', 'En retard'] };
  function billRow(b) {
    const [cls, lbl] = STAT[b.status];
    return `<button class="item" data-act="billMenu" data-id="${b.id}"><span class="ico" style="background:var(--track)">${BILL_EMOJI[b.category] || '🧾'}</span>
      <span class="m"><div class="t">${esc(b.name)}</div><div class="s">Éch. ${E.fmtDate(b.dueDate)} · ${b.recurring ? E.FREQ_LABEL[b.freq] : 'Exceptionnelle'}${b.overridden ? ' · modifiée' : ''}</div></span>
      <span class="a">${money(b.amount)}<small class="pill ${cls}" style="margin-top:3px">${lbl}</small></span></button>`;
  }
  function incomeRow(i) {
    return `<button class="item" data-act="incomeMenu" data-id="${i.id}"><span class="ico" style="background:rgba(48,209,88,.16)">💰</span>
      <span class="m"><div class="t">${esc(i.name)}</div><div class="s">${i.recurring ? 'Récurrent' : 'Exceptionnel'} · ${E.fmtDate(i.date)}${i.overridden ? ' · montant du mois modifié' : ''}</div></span>
      <span class="a pos">+${money(i.amount)}</span></button>`;
  }
  function catBars(rows, showEmptyLimitOnly) {
    const list = rows.filter(r => r.spent > 0 || r.limit != null);
    if (!list.length) return empty('Aucune dépense', 'Les catégories apparaîtront ici.');
    return list.map(r => {
      let note = '';
      if (r.status === 'over') note = `<span class="pill bad">Dépassé de ${money(r.over)}</span>`;
      else if (r.status === 'alert') note = `<span class="pill bad">Limite atteinte</span>`;
      else if (r.status === 'warn') note = `<span class="pill warn">${r.pct}&nbsp;% utilisé</span>`;
      const right = r.limit != null ? `${money(r.spent, { auto: true })} / ${money(r.limit, { auto: true })}` : money(r.spent);
      return `<div class="cat-row"><div class="l"><span>${r.cat.icon} ${esc(r.cat.name)}</span><span class="num" style="color:var(--muted);font-size:13px">${right}</span></div>
        ${r.limit != null ? bar(r.pct, barCls(r.pct)) : bar(0)}
        ${r.limit != null ? `<div class="l" style="margin:6px 0 0;font-size:12.5px;color:var(--muted)"><span style="font-weight:500">${r.remaining >= 0 ? 'Reste ' + money(r.remaining) : 'Dépassement ' + money(-r.remaining)}</span>${note}</div>` : ''}</div>`;
    }).join('');
  }

  // ---------- Écran : Accueil ----------
  const DASH = [['budget', 'Budget disponible'], ['daily', 'Budget quotidien'], ['upcoming', 'Factures et abonnements à venir'], ['trend', 'Évolution des dépenses'],
    ['progress', 'Progression du mois'], ['forecast', 'Prévision de fin de mois'], ['recap', 'Récapitulatif'], ['cats', 'Catégories les plus coûteuses'], ['recent', 'Dernières transactions']];
  function dashOrder() {
    const saved = Array.isArray(state.settings.dashOrder) ? state.settings.dashOrder : [];
    const out = saved.filter(x => DASH.some(d => d[0] === x.id));
    for (const [id] of DASH) if (!out.some(x => x.id === id)) out.push({ id, on: true });
    return out;
  }
  function upcomingItems(m, t) {
    const items = [...m.bills.filter(b => b.status !== 'paid').map(b => ({ ...b, kind: 'bill' })), ...m.subsOcc.filter(b => b.status !== 'paid').map(b => ({ ...b, kind: 'sub' }))];
    const nm = E.addMonths(m.ym, 1), horizon = E.addDays(t, 21);
    for (const b of E.billOccurrences(state, nm, t)) if (b.dueDate <= horizon && b.status !== 'paid') items.push({ ...b, kind: 'bill' });
    for (const b of E.subOccurrences(state, nm, t)) if (b.dueDate <= horizon && b.status !== 'paid') items.push({ ...b, kind: 'sub' });
    return items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  }
  const SECTIONS = {
    budget(m) {
      const deficit = m.remaining < 0;
      return `<div class="card hero ${deficit ? 'deficit' : ''}"><h2>${deficit ? 'Déficit du mois (calculé)' : 'Réellement disponible (calculé)'}</h2>
        <div class="big">${deficit ? '−' : ''}${money(Math.abs(m.remaining), { auto: true })}<span class="cur">${esc(cur())}</span></div>
        <div class="note" style="margin:6px 0 0">Budget total du mois : <b>${mcur(m.income, { auto: true })}</b></div>
        <div class="rows">
          <div class="row"><span>Revenus du mois</span><b>${money(m.income)}</b></div>
          <div class="row"><span>Factures prévues</span><b>−${money(m.billsTotal)}</b></div>
          <div class="row"><span>Abonnements${m.subsSmoothed ? ' (lissés)' : ''}</span><b>−${money(m.subsTotal)}</b></div>
          <div class="row"><span>Dépenses effectuées</span><b>−${money(m.spent)}</b></div>
          <div class="row"><span>Épargne réservée</span><b>−${money(m.reserved)}</b></div></div>
        <div class="note">Calculé à partir de tes saisies — ce n’est pas le solde de ton compte bancaire.</div></div>`;
    },
    daily(m) {
      const d = m.daily;
      if (d.mode === 'ok') {
        const tl = d.todayLeft;
        return `<div class="card daily"><h2>Budget quotidien</h2><div class="lbl">Tu peux dépenser</div><div class="big">${mcur(d.perDay, { auto: true })}</div>
          <div class="lbl">par jour · ${m.daysLeft} jour${m.daysLeft > 1 ? 's' : ''} restant${m.daysLeft > 1 ? 's' : ''} (aujourd’hui inclus)</div>
          <div style="margin-top:12px"><span class="pill ${tl >= 0 ? 'good' : 'bad'}">${tl >= 0 ? 'Aujourd’hui : encore ' + mcur(tl) : 'Aujourd’hui : dépassé de ' + mcur(-tl)}</span></div></div>`;
      }
      if (d.mode === 'deficit') return `<div class="card daily deficit"><h2>Budget quotidien</h2><div class="lbl">Déficit</div><div class="big">−${mcur(d.deficit, { auto: true })}</div>
        <div class="alert bad"><span>⚠️</span><span><b>Aucun budget quotidien disponible.</b> Tes factures, abonnements, dépenses et épargne dépassent tes revenus de ${mcur(d.deficit)} ce mois-ci.</span></div></div>`;
      if (d.mode === 'exhausted') return `<div class="card daily"><h2>Budget quotidien</h2><div class="lbl">Il ne te reste rien à dépenser</div><div class="big">${mcur(0)}</div><div class="alert warn"><span>⚠️</span><span>Ton budget du mois est entièrement utilisé.</span></div></div>`;
      return '';
    },
    upcoming(m, t) {
      const items = upcomingItems(m, t).slice(0, 6);
      const rows = items.map(b => {
        const left = E.diffDays(t, b.dueDate), when = left < 0 ? `en retard de ${-left} j` : left === 0 ? 'aujourd’hui' : left === 1 ? 'demain' : `dans ${left} j`;
        return `<button class="item" data-act="${b.kind === 'sub' ? 'goSubs' : 'goBills'}"><span class="ico" style="background:var(--track)">${b.kind === 'sub' ? '🔁' : (BILL_EMOJI[b.category] || '🧾')}</span>
          <span class="m"><div class="t">${esc(b.name)}</div><div class="s">${E.fmtDate(b.dueDate)} · <span class="${left < 0 ? 'neg' : ''}">${when}</span>${b.estimated ? ' · estimée' : ''}</div></span><span class="a">${money(b.amount)}</span></button>`;
      }).join('');
      return `<div class="card"><div class="card-head"><h2>À venir</h2><button class="link" data-act="goBills">Tout voir</button></div>${rows ? `<div class="list">${rows}</div>` : empty('Rien à payer prochainement')}</div>`;
    },
    trend(m) {
      const ds = E.dailySeries(state, m.ym, todayStr());
      if (!m.expenses.length) return '';
      const ceiling = Math.max(0, m.income - m.billsTotal - m.subsTotal - m.reserved);
      return `<div class="card"><h2>Évolution des dépenses</h2>${Charts.line({ n: ds.dim, label: 'Dépenses cumulées', height: 140, markY: ceiling || null, tip: i => ds.cumul[i] == null ? `Jour ${i + 1}` : `Jour ${i + 1} · ${E.formatMoney(ds.cumul[i], { auto: true })} ${cur()} cumulés`,
        series: [{ pts: ds.cumul, color: 'var(--c-spent)', fill: true }] })}</div>`;
    },
    progress(m, t) {
      return `<div class="card"><h2>Progression du mois</h2><div class="prog">
        <div><div class="l"><span>${E.fmtDate(t)} · ${m.daysLeft} jour${m.daysLeft > 1 ? 's' : ''} restant${m.daysLeft > 1 ? 's' : ''}</span><span>${m.pctMonth}&nbsp;% écoulé</span></div>${bar(m.pctMonth)}</div>
        <div><div class="l"><span>Budget consommé</span><span>${m.pctBudget == null ? '—' : m.pctBudget + ' %'}</span></div>${bar(m.pctBudget || 0, m.pctBudget == null ? '' : barCls(m.pctBudget))}</div></div></div>`;
    },
    forecast(m) {
      const f = m.forecast;
      if (!(f.available && (m.hasIncome || m.spent > 0))) return '';
      const ok = f.projectedEnd >= 0;
      return `<div class="card"><h2>Prévision de fin de mois</h2>
        <div style="font-size:17px;font-weight:500;line-height:1.4">${ok ? `À ce rythme, tu termineras le mois avec environ <span class="pos">${mcur(f.projectedEnd, { auto: true })}</span> disponibles.` : `Tes dépenses actuelles risquent de dépasser ton budget d’environ <span class="neg">${mcur(f.overBudget, { auto: true })}</span>.`}</div>
        <div class="note">Estimation, pas une certitude : moyenne de ${mcur(f.avgDaily)} par jour sur ${m.dayNum} jour${m.dayNum > 1 ? 's' : ''}, factures et abonnements déjà prévus inclus une seule fois.${f.lowConfidence ? ' Début de mois : estimation peu fiable.' : ''}</div></div>`;
    },
    recap(m) {
      const unpaidN = m.bills.filter(b => b.status !== 'paid').length + m.subsOcc.filter(b => b.status !== 'paid').length, od = m.billsOverdue.length + m.subsOverdue.length;
      return `<div class="grid2" style="margin:12px 0"><div class="card tap kpi" data-act="goBills"><div class="k">Factures et abonnements restants</div><div class="v">${mcur(m.billsUnpaid + m.subsUnpaid, { auto: true })}</div><div class="d ${od ? 'neg' : ''}" style="color:${od ? '' : 'var(--muted)'}">${unpaidN} à payer${od ? ' · ' + od + ' en retard' : ''}</div></div>
        <div class="card tap kpi" data-act="goExpenses"><div class="k">Dépenses du mois</div><div class="v">${mcur(m.spent, { auto: true })}</div><div class="d" style="color:var(--muted)">${m.expenses.length} transaction${m.expenses.length > 1 ? 's' : ''}</div></div></div>`;
    },
    cats(m) {
      const top = m.cats.filter(r => r.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 4);
      const warns = m.cats.filter(r => r.status === 'warn' || r.status === 'alert' || r.status === 'over');
      let h = `<div class="card"><div class="card-head"><h2>Catégories les plus coûteuses</h2><button class="link" data-act="openCategories">Limites</button></div>`;
      if (warns.length) h += warns.map(r => `<div class="alert ${r.status === 'warn' ? 'warn' : 'bad'}" style="margin:0 0 8px"><span>${r.status === 'warn' ? '🟠' : '🔴'}</span><span><b>${esc(r.cat.name)}</b> : ${r.status === 'over' ? 'limite dépassée de ' + mcur(r.over) : r.status === 'alert' ? 'limite atteinte (100 %)' : r.pct + ' % de la limite utilisé'}</span></div>`).join('');
      return h + (top.length ? catBars(top) : empty('Aucune dépense ce mois-ci')) + '</div>';
    },
    recent() {
      const last = [...state.expenses].sort((a, b) => (a.date === b.date ? (b.ts || 0) - (a.ts || 0) : a.date < b.date ? 1 : -1)).slice(0, 5);
      return `<div class="card"><div class="card-head"><h2>Dernières transactions</h2><button class="link" data-act="goExpenses">Tout voir</button></div>${last.length ? `<div class="list">${last.map(expenseRow).join('')}</div>` : empty('Aucune transaction')}</div>`;
    },
  };
  function viewHome() {
    const t = todayStr(), m = month(curYm());
    const empt = !state.incomes.length && !state.bills.length && !state.expenses.length && !state.subs.length;
    let h = `<div class="top"><div><div class="sub">${WDL[wdOf(t)]} ${E.fmtDate(t)}</div><h1>Budget</h1></div>
      <div style="display:flex;gap:8px"><button class="icon-btn" data-act="toggleHide" aria-label="Masquer les montants">${ic('eye')}</button><button class="icon-btn" data-act="openSettings" aria-label="Paramètres">${ic('gear')}</button></div></div>`;
    h += `<div class="shortcuts"><button class="main" data-act="addExpense"><span class="sc">${ic('plus')}</span>Dépense</button><button data-act="addBill"><span class="sc">${ic('bills')}</span>Facture</button><button data-act="importOpen"><span class="sc">${ic('doc')}</span>Relevé PDF</button></div>`;
    if (App.remindersHtml) h += App.remindersHtml();
    if (empt) return h + `<div class="card"><h2>Bienvenue</h2><p style="margin:0 0 6px">Ton application est vide : aucune donnée n’est inventée. Commence par :</p>
      <button class="btn" data-act="addIncome">1 · Ajouter mon salaire</button><button class="btn sec" data-act="addBill">2 · Ajouter mes factures</button><button class="btn sec" data-act="goSubs">3 · Ajouter mes abonnements</button>
      <button class="btn sec" data-act="importOpen">… ou importer un relevé bancaire PDF</button></div><div class="note" style="text-align:center;padding:0 12px">Toutes les données restent sur cet iPhone.</div>`;
    for (const { id, on } of dashOrder()) if (on) h += SECTIONS[id](m, t) || '';
    if (!m.hasIncome) h += `<div class="alert info"><span>ℹ️</span><span>Aucun revenu enregistré ce mois-ci. <a class="link" data-act="addIncome">Ajouter un revenu</a></span></div>`;
    return h + `<div style="text-align:center;margin:14px 0"><button class="link" data-act="dashEdit">Personnaliser l’accueil</button></div>`;
  }

  // ---------- Écran : Factures ----------
  function viewBills() {
    const ym = ui.viewMonth, m = month(ym);
    const seg = `<div class="tabs2"><button class="${ui.billsTab !== 'subs' ? 'on' : ''}" data-act="billsTab" data-v="bills">Factures</button><button class="${ui.billsTab === 'subs' ? 'on' : ''}" data-act="billsTab" data-v="subs">Abonnements</button></div>`;
    if (ui.billsTab === 'subs' && App.views.subs) return `<div class="top"><h1>Factures</h1><button class="icon-btn red" data-act="addSub" aria-label="Ajouter un abonnement">${ic('plus')}</button></div>${seg}${monthNav(ym)}${App.views.subs(m)}`;
    const groups = [['overdue', 'En retard'], ['pending', 'À payer'], ['paid', 'Payées']];
    let h = `<div class="top"><h1>Factures</h1><button class="icon-btn red" data-act="addBill" aria-label="Ajouter une facture">${ic('plus')}</button></div>${seg}${monthNav(ym)}
      <div class="card" style="margin-top:12px"><div class="grid2" style="gap:14px"><div class="kpi"><div class="k">Total du mois</div><div class="v">${mcur(m.billsTotal, { auto: true })}</div></div>
      <div class="kpi"><div class="k">Reste à payer</div><div class="v ${m.billsOverdue.length ? 'neg' : ''}">${mcur(m.billsUnpaid, { auto: true })}</div></div></div>
      <div style="margin-top:14px">${bar(m.billsTotal ? Math.round(m.billsPaid * 100 / m.billsTotal) : 0, 'good')}</div><div class="note">${mcur(m.billsPaid)} payé${m.billsOverdue.length ? ' · ' + m.billsOverdue.length + ' en retard' : ''}. Les factures non payées sont déjà déduites du budget disponible.</div></div>`;
    if (!m.bills.length) return h + `<div class="card">${empty('Aucune facture ce mois-ci', 'Ajoute un loyer, une assurance ou un abonnement.')}<button class="btn" data-act="addBill">Ajouter une facture</button></div>`;
    for (const [k, lbl] of groups) {
      const l = m.bills.filter(b => b.status === k);
      if (!l.length) continue;
      h += `<div class="group-h"><span>${lbl}</span><span class="num">${E.formatMoney(l.reduce((a, b) => a + b.amount, 0))}</span></div><div class="card" style="margin-top:4px;padding:6px 16px"><div class="list">${l.map(billRow).join('')}</div></div>`;
    }
    return h;
  }

  // ---------- Écran : Dépenses ----------
  function viewExpenses() {
    const ym = ui.viewMonth, m = month(ym);
    let h = `<div class="top"><h1>Dépenses</h1><div style="display:flex;gap:8px"><button class="icon-btn" data-act="importOpen" aria-label="Importer un relevé PDF">${ic('doc')}</button><button class="icon-btn red" data-act="addExpense" aria-label="Ajouter une dépense">${ic('plus')}</button></div></div>${monthNav(ym)}
      <div class="card" style="margin-top:12px"><div class="grid2" style="gap:14px"><div class="kpi"><div class="k">Dépensé</div><div class="v">${mcur(m.spent, { auto: true })}</div></div>
      <div class="kpi"><div class="k">Moyenne / jour</div><div class="v">${mcur(m.dayNum ? Math.round(m.spent / m.dayNum) : 0, { auto: true })}</div></div></div></div>`;
    if (!m.expenses.length) return h + `<div class="card">${empty('Aucune dépense', 'Appuie sur « Ajouter une dépense ».')}</div>`;
    const byDay = {};
    for (const e of [...m.expenses].reverse()) (byDay[e.date] = byDay[e.date] || []).push(e);
    for (const day of Object.keys(byDay).sort().reverse()) {
      const l = byDay[day];
      h += `<div class="group-h"><span>${dateLabel(day)}</span><span class="num">−${E.formatMoney(l.reduce((a, e) => a + e.amount, 0))}</span></div><div class="card" style="margin-top:4px;padding:6px 16px"><div class="list">${l.map(expenseRow).join('')}</div></div>`;
    }
    return h;
  }

  // ---------- Écran : Statistiques ----------
  function viewStats() {
    const rng = ui.statsRange, today = todayStr(), cy = Number(curYm().slice(0, 4));
    const n = { month: 1, '3': 3, '6': 6, year: 12 }[rng];
    const endYm = rng === 'year' ? `${cy}-12` : curYm();
    const r = E.rangeStats(state, endYm, n, today);
    const col = { inc: 'var(--c-income)', bill: 'var(--c-bill)', spent: 'var(--c-spent)', sav: 'var(--c-sav)' };
    const lbl = m => MS[Number(m.ym.slice(5)) - 1];
    const F = (c) => `${E.formatMoney(c, { auto: true })} ${cur()}`;
    let h = `<div class="top"><h1>Statistiques</h1></div><div class="seg">${[['month', 'Mois'], ['3', '3 mois'], ['6', '6 mois'], ['year', 'Année']].map(([k, l]) => `<button class="${rng === k ? 'on' : ''}" data-act="statsRange" data-v="${k}">${l}</button>`).join('')}</div>`;
    const dl = r.deltaPct;
    h += `<div class="grid2" style="margin-top:12px">
      <div class="card kpi"><div class="k">Dépensé</div><div class="v">${mcur(r.spent, { auto: true })}</div><div class="d" style="color:${dl == null ? 'var(--muted)' : dl > 0 ? 'var(--bad)' : 'var(--good)'}">${dl == null ? 'Pas de période précédente' : (dl > 0 ? '▲ +' : '▼ ') + dl + ' % vs précédent'}</div></div>
      <div class="card kpi"><div class="k">Revenus</div><div class="v">${mcur(r.income, { auto: true })}</div><div class="d" style="color:var(--muted)">${r.pctIncomeSpent == null ? '—' : r.pctIncomeSpent + ' % dépensé (factures et abonnements incl.)'}</div></div>
      <div class="card kpi"><div class="k">Moyenne quotidienne</div><div class="v">${mcur(r.avgDaily, { auto: true })}</div></div>
      <div class="card kpi"><div class="k">Plus grosse dépense</div><div class="v">${r.biggest ? mcur(r.biggest.amount, { auto: true }) : '—'}</div><div class="d" style="color:var(--muted)">${r.biggest ? esc(r.biggest.desc || catOf(r.biggest.category).name) : ''}</div></div></div>`;
    h += `<div class="card kpi"><div class="k">Catégorie la plus coûteuse</div><div class="v">${r.topCategory ? r.topCategory.cat.icon + ' ' + esc(r.topCategory.cat.name) : '—'}</div><div class="d" style="color:var(--muted)">${r.topCategory ? mcur(r.topCategory.spent) : 'Aucune dépense'}</div></div>`;

    const parts = r.categories.map(c => ({ label: c.cat.name, value: c.spent, color: c.cat.color, tip: `${c.cat.name} · ${F(c.spent)} (${r.spent ? Math.round(c.spent * 100 / r.spent) : 0} %)` }));
    h += `<div class="card"><h2>Répartition des dépenses</h2>${Charts.donut(parts, E.formatMoney(r.spent, { auto: true }), cur())}<div class="legend">${parts.slice(0, 8).map(p => `<span><i style="background:${p.color}"></i>${esc(p.label)} ${r.spent ? Math.round(p.value * 100 / r.spent) : 0} %</span>`).join('')}</div></div>`;

    if (rng === 'month') {
      const ds = E.dailySeries(state, curYm(), today), m = ds.month;
      const ceiling = Math.max(0, m.income - m.billsTotal - m.subsTotal - m.reserved);
      const proj = m.forecast.available && ds.last >= 1 ? ds.cumul.map((v, i) => (i >= ds.last - 1 ? Math.round(m.spent / ds.last * (i + 1)) : null)) : [];
      h += `<div class="card"><h2>Dépenses cumulées du mois</h2>${Charts.line({ n: ds.dim, label: 'Dépenses cumulées', markY: ceiling || null,
        tip: i => `Jour ${i + 1} · ` + (ds.cumul[i] != null ? `${F(ds.cumul[i])} cumulés (${F(ds.perDay[i])} ce jour)` : proj[i] != null ? `${F(proj[i])} estimés` : 'à venir'),
        series: [{ pts: ds.cumul, color: col.spent, fill: true }, ...(proj.length ? [{ pts: proj, color: col.spent, dashed: true }] : [])] })}
        <div class="legend"><span><i style="background:${col.spent}"></i>Dépenses (pointillé : estimation)</span><span><i style="background:var(--bad)"></i>Plafond (revenus − factures − abonnements − épargne)</span></div></div>
        <div class="card"><h2>Dépenses par jour</h2>${Charts.bars({ label: 'Dépenses par jour', groups: ds.perDay.map((v, i) => ({ label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '', tip: `Jour ${i + 1} · ${F(v)}`, bars: [{ value: v, color: col.spent }] })) })}</div>`;
    }
    const cmp = rng === 'month' ? E.rangeStats(state, curYm(), 6, today) : r;
    const fix = m => m.billsTotal + m.subsTotal;
    h += `<div class="card"><h2>Revenus vs dépenses</h2>${Charts.bars({ label: 'Revenus et dépenses par mois', groups: cmp.months.map(m => ({ label: lbl(m), tip: `${E.monthLabel(m.ym)} · revenus ${F(m.income)} · factures et abonnements ${F(fix(m))} · dépenses ${F(m.spent)}`, bars: [{ value: m.income, color: col.inc }, { value: fix(m), color: col.bill }, { value: m.spent, color: col.spent }] })) })}
      <div class="legend"><span><i style="background:${col.inc}"></i>Revenus</span><span><i style="background:${col.bill}"></i>Factures et abonnements</span><span><i style="background:${col.spent}"></i>Dépenses</span></div></div>`;
    h += `<div class="card"><h2>Comparaison des dépenses</h2>${Charts.bars({ label: 'Dépenses par mois', groups: cmp.months.map(m => ({ label: lbl(m), tip: `${E.monthLabel(m.ym)} · ${F(m.spent)}`, bars: [{ value: m.spent, color: col.spent }] })) })}</div>`;
    h += `<div class="card"><h2>Évolution des factures et abonnements</h2>${Charts.bars({ label: 'Factures et abonnements par mois', groups: cmp.months.map(m => ({ label: lbl(m), tip: `${E.monthLabel(m.ym)} · factures ${F(m.billsTotal)} · abonnements ${F(m.subsTotal)}`, bars: [{ value: m.billsTotal, color: col.bill }, { value: m.subsTotal, color: col.sav }] })) })}
      <div class="legend"><span><i style="background:${col.bill}"></i>Factures</span><span><i style="background:${col.sav}"></i>Abonnements</span></div></div>`;
    const avgs = cmp.months.map(m => (m.rel === 'future' ? null : m.dayNum ? Math.round(m.spent / m.dayNum) : 0));
    h += `<div class="card"><h2>Dépense moyenne par jour</h2>${Charts.bars({ label: 'Moyenne quotidienne', groups: cmp.months.map((m, i) => ({ label: lbl(m), tip: `${E.monthLabel(m.ym)} · ${F(avgs[i] || 0)} par jour`, bars: [{ value: avgs[i] || 0, color: col.spent }] })) })}</div>`;
    h += `<div class="card"><h2>Évolution de l’épargne (cumul planifié)</h2>${Charts.line({ n: cmp.savedSeries.length, label: 'Épargne cumulée', tip: i => `${E.monthLabel(cmp.savedSeries[i].ym)} · ${F(cmp.savedSeries[i].saved)} réservés`, series: [{ pts: cmp.savedSeries.map(s => s.saved), color: col.sav, fill: true }] })}<div class="note">Montants réservés selon tes objectifs — pas un solde bancaire.</div></div>`;
    return h;
  }

  // ---------- Écran : Archives ----------
  function viewArchive() {
    const y = ui.archiveYear, today = todayStr();
    const ms = Array.from({ length: 12 }, (_, i) => month(`${y}-${E.pad(i + 1)}`));
    const tot = k => ms.reduce((a, m) => a + m[k], 0);
    let h = `<div class="top"><h1>Archives</h1></div><div class="monthnav"><button data-act="yprev">${ic('chevL')}</button><b>${y}</b><button data-act="ynext">${ic('chevR')}</button></div>
      <div class="card" style="margin-top:12px"><h2>Année ${y}</h2><div class="grid2" style="gap:14px"><div class="kpi"><div class="k">Revenus</div><div class="v">${mcur(tot('income'), { auto: true })}</div></div><div class="kpi"><div class="k">Factures et abonnements</div><div class="v">${mcur(tot('billsTotal') + tot('subsTotal'), { auto: true })}</div></div>
      <div class="kpi"><div class="k">Dépenses</div><div class="v">${mcur(tot('spent'), { auto: true })}</div></div><div class="kpi"><div class="k">Épargne</div><div class="v">${mcur(tot('reserved'), { auto: true })}</div></div></div></div>
      <div class="card" style="padding:4px 16px">`;
    ms.forEach((m, i) => {
      const empty0 = !m.income && !m.billsTotal && !m.subsTotal && !m.spent && !m.reserved;
      h += `<button class="mrow" data-act="openMonth" data-ym="${m.ym}" style="${m.rel === 'future' && empty0 ? 'opacity:.45' : ''}"><span class="mn">${E.MONTHS[i]}${m.rel === 'current' ? ' <span class="pill good" style="margin-left:6px">En cours</span>' : ''}</span>
        <span class="mv">${empty0 ? '<small>—</small>' : `<span class="${m.remaining < 0 ? 'neg' : ''}">${m.remaining < 0 ? '−' : ''}${money(Math.abs(m.remaining), { auto: true })}</span><small>${m.rel === 'current' ? 'restant' : 'reste'} · dép. ${money(m.spent, { auto: true })}</small>`}</span>${ic('chevR', 'chev')}</button>`;
    });
    return h + `</div><div class="note" style="padding:0 6px">Chaque mois est conservé tel quel. Modifier une facture ou un revenu récurrent s’applique à partir du mois choisi, jamais aux mois passés.</div>`;
  }

  function viewMonthPage() {
    const ym = ui.viewMonth, m = month(ym);
    const past = m.rel === 'past';
    let h = `${backBtn('Archives')}<div class="page-title">${E.monthLabel(ym)}</div>${monthNav(ym)}
      <div class="card hero ${m.remaining < 0 ? 'deficit' : ''}" style="margin-top:12px"><h2>${past ? 'Reste du mois' : m.rel === 'current' ? 'Budget restant (calculé)' : 'Prévu'}</h2><div class="big">${m.remaining < 0 ? '−' : ''}${money(Math.abs(m.remaining), { auto: true })}<span class="cur">${esc(cur())}</span></div>
      <div class="rows"><div class="row"><span>Revenus</span><b>${money(m.income)}</b></div><div class="row"><span>Factures</span><b>−${money(m.billsTotal)}</b></div><div class="row"><span>Abonnements</span><b>−${money(m.subsTotal)}</b></div><div class="row"><span>Dépenses</span><b>−${money(m.spent)}</b></div><div class="row"><span>Épargne</span><b>−${money(m.reserved)}</b></div></div></div>
      <div class="card"><h2>Catégories</h2>${catBars(m.cats)}</div>
      <div class="card"><div class="card-head"><h2>Revenus</h2><button class="link" data-act="addIncome">+ Ajouter</button></div>${m.incomes.length ? `<div class="list">${m.incomes.map(incomeRow).join('')}</div>` : empty('Aucun revenu')}</div>
      <div class="card"><div class="card-head"><h2>Factures</h2><button class="link" data-act="addBill">+ Ajouter</button></div>${m.bills.length ? `<div class="list">${m.bills.map(billRow).join('')}</div>` : empty('Aucune facture')}</div>
      ${m.subsOcc.length ? `<div class="card"><h2>Abonnements</h2><div class="list">${m.subsOcc.map(o => `<button class="item" data-act="goSubs"><span class="ico" style="background:var(--track)">🔁</span><span class="m"><div class="t">${esc(o.name)}</div><div class="s">${E.fmtDate(o.dueDate)} · ${STAT[o.status][1]}${o.estimated ? ' · estimée' : ''}</div></span><span class="a">${money(o.amount)}</span></button>`).join('')}</div></div>` : ''}
      <div class="card"><div class="card-head"><h2>Dépenses</h2><div style="display:flex;gap:14px"><button class="link" data-act="importOpen">Importer un relevé</button><button class="link" data-act="addExpense">+ Ajouter</button></div></div>${m.expenses.length ? `<div class="list">${[...m.expenses].reverse().map(expenseRow).join('')}</div>` : empty('Aucune dépense')}</div>`;
    return h;
  }

  // ---------- Écran : Revenus ----------
  function viewIncomes() {
    const ym = ui.viewMonth, m = month(ym);
    let h = `${backBtn('Paramètres', 'openSettings')}<div class="top"><div class="page-title" style="margin:0">Revenus</div><button class="icon-btn" data-act="addIncome">${ic('plus')}</button></div>${monthNav(ym)}
      <div class="card" style="margin-top:12px"><h2>Revenus de ${E.monthLabel(ym)}</h2><div class="kpi"><div class="v pos">${mcur(m.income, { auto: true })}</div></div>${m.incomes.length ? `<div class="list" style="margin-top:8px">${m.incomes.map(incomeRow).join('')}</div>` : empty('Aucun revenu ce mois-ci', 'Ajoute ton salaire pour activer les calculs.')}</div>`;
    const rec = state.incomes.filter(i => i.type === 'recurring');
    h += `<div class="card"><h2>Sources récurrentes</h2>${rec.length ? `<div class="list">${rec.map(i => { const v = E.valueAt(i.versions, ym) || i.versions[0]; return `<button class="item" data-act="incomeMenu" data-id="${i.id}"><span class="ico" style="background:rgba(48,209,88,.16)">🔁</span><span class="m"><div class="t">${esc(i.name)}</div><div class="s">Chaque mois le ${v.day || 1}${i.stopFrom ? ' · arrêté dès ' + E.monthLabel(i.stopFrom) : ''}</div></span><span class="a">${money(v.amount)}</span></button>`; }).join('')}</div>` : empty('Aucune source récurrente')}</div>`;
    return h;
  }

  // ---------- Écran : Épargne ----------
  function viewSavings() {
    const ym = curYm(), m = month(ym);
    let h = `${backBtn('Paramètres', 'openSettings')}<div class="top"><div class="page-title" style="margin:0">Épargne</div><button class="icon-btn" data-act="addGoal">${ic('plus')}</button></div>
      <div class="card"><h2>Réservé ce mois-ci</h2><div class="kpi"><div class="v">${mcur(m.reserved, { auto: true })}</div></div><div class="note">Cette somme est exclue de ton budget quotidien. C’est une réserve planifiée, pas la preuve d’un virement effectué.</div></div>`;
    if (!state.goals.length) return h + `<div class="card">${empty('Aucun objectif', 'Ex. : Épargne générale 500 CHF/mois, Vacances 2’000 CHF.')}<button class="btn" data-act="addGoal">Créer un objectif</button></div>`;
    for (const g of state.goals) {
      const s = E.goalSummary(g, ym), mv = E.valueAt(g.versions, ym);
      h += `<button class="card tap" style="display:block;width:100%;text-align:left" data-act="editGoal" data-id="${g.id}"><div class="card-head"><b style="font-size:17px">${esc(g.name)}</b><span class="pill ${s.reached ? 'good' : ''}">${s.reached ? 'Atteint ✓' : mcur(mv ? mv.monthly : 0, { auto: true }) + '/mois'}</span></div>
        ${g.target != null ? `${bar(s.pct, s.reached ? 'good' : '')}<div class="l" style="display:flex;justify-content:space-between;margin-top:8px;font-size:14px"><span>${mcur(s.saved, { auto: true })}</span><span style="color:var(--muted)">sur ${mcur(g.target, { auto: true })} · ${s.pct} %</span></div>` : `<div class="kpi"><div class="v">${mcur(s.saved, { auto: true })}</div><div class="k">cumulé depuis ${E.monthLabel(g.startMonth)}</div></div>`}</button>`;
    }
    return h;
  }

  // ---------- Écran : Catégories ----------
  function viewCategories() {
    const ym = curYm(), m = month(ym);
    let h = `${backBtn('Paramètres', 'openSettings')}<div class="top"><div class="page-title" style="margin:0">Catégories</div><button class="icon-btn" data-act="addCategory">${ic('plus')}</button></div>
      <div class="note" style="margin:0 6px 10px">Les limites sont des plafonds de dépenses : elles ne sont pas déduites du budget global.</div><div class="card" style="padding:6px 16px"><div class="list">`;
    for (const r of m.cats) {
      h += `<button class="item" data-act="editCategory" data-id="${r.cat.id}"><span class="ico" style="background:${r.cat.color}26">${r.cat.icon}</span><span class="m"><div class="t">${esc(r.cat.name)}</div><div class="s">${r.limit != null ? 'Limite ' + E.formatMoney(r.limit, { auto: true }) + ' ' + esc(cur()) + ' · dépensé ' + E.formatMoney(r.spent, { auto: true }) : 'Pas de limite'}</div></span>${ic('chevR', 'chev')}</button>`;
    }
    return h + '</div></div>';
  }

  // ---------- Écran : Paramètres ----------
  function viewSettings() {
    const th = state.settings.theme;
    return `${backBtn('Retour', 'closeSettings')}<div class="page-title">Paramètres</div>
      <div class="group-h"><span>Finances</span></div><div class="card set-card"><div class="list">
        <button class="item" data-act="openIncomes"><span class="m"><div class="t">Revenus</div><div class="s">Salaire, revenus supplémentaires</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="openCategories"><span class="m"><div class="t">Catégories et limites</div><div class="s">Plafonds mensuels de dépenses</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="openSavings"><span class="m"><div class="t">Épargne et objectifs</div><div class="s">Montants réservés chaque mois</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="goSubs"><span class="m"><div class="t">Abonnements</div><div class="s">${state.subs.length} enregistré${state.subs.length > 1 ? 's' : ''}</div></span>${ic('chevR', 'chev')}</button></div></div>
      <div class="group-h"><span>Relevés bancaires</span></div><div class="card set-card"><div class="list">
        <button class="item" data-act="importOpen"><span class="m"><div class="t">Importer un relevé PDF</div><div class="s">Lecture 100 % locale sur cet iPhone</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="importHistory"><span class="m"><div class="t">Historique des importations</div><div class="s">${state.imports.length} import${state.imports.length > 1 ? 's' : ''}</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="importPrefs"><span class="m"><div class="t">Préférences d’import</div><div class="s">Date comptable, mes comptes, conservation des PDF</div></span>${ic('chevR', 'chev')}</button></div></div>
      <div class="group-h"><span>Affichage</span></div><div class="card" style="padding:14px 16px">
        <div class="field" style="margin-top:0"><label>Thème</label><div class="seg">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<button class="${th === k ? 'on' : ''}" data-act="setTheme" data-v="${k}">${l}</button>`).join('')}</div></div>
        <div class="field"><label>Devise</label><select class="in" id="s-cur" data-change="setCurrency">${['CHF', 'EUR', 'USD', 'GBP'].map(c => `<option ${cur() === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="switch"><span>Masquer les montants</span><input type="checkbox" ${state.settings.hideAmounts ? 'checked' : ''} data-change="toggleHideChk"></div>
        <div class="switch" style="margin-top:10px"><span>Lisser les abonnements annuels<br><small style="color:var(--muted)">Provision mensuelle, sans double comptage</small></span><input type="checkbox" ${state.settings.smoothSubs ? 'checked' : ''} data-change="toggleSmooth"></div>
        <button class="btn sec" data-act="dashEdit">Personnaliser l’accueil</button></div>
      <div class="group-h"><span>Sécurité</span></div><div class="card set-card"><div class="list" id="sec-list"><div class="empty">…</div></div></div>
      <div class="group-h"><span>Données</span></div><div class="card set-card"><div class="list">
        <button class="item" data-act="exportData"><span class="m"><div class="t">Exporter une sauvegarde</div><div class="s">Fichier .json à enregistrer dans Fichiers / iCloud</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="importPick"><span class="m"><div class="t">Importer une sauvegarde</div><div class="s">Remplace les données actuelles</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="listBackups"><span class="m"><div class="t">Sauvegardes automatiques</div><div class="s">1 par jour sur l’appareil, 14 jours</div></span>${ic('chevR', 'chev')}</button>
        <button class="item" data-act="resetAll"><span class="m"><div class="t neg">Réinitialiser l’application</div><div class="s">Efface toutes les données (avec sauvegarde préalable)</div></span></button></div></div>
      <input type="file" id="import-file" accept=".json,application/json" class="hidden">
      <div class="note" style="text-align:center;margin-top:18px">Données stockées uniquement sur cet appareil · ${state.expenses.length} dépenses · ${state.bills.length} factures</div>`;
  }
  async function fillSecurity() {
    const el = $('#sec-list'); if (!el) return;
    const on = await Lock.enabled(), face = on && await Lock.hasFace(), fs = await Lock.faceSupported();
    el.innerHTML = on
      ? `<button class="item" data-act="lockNow"><span class="m"><div class="t">Verrouiller maintenant</div></span></button>
         <button class="item" data-act="changePin"><span class="m"><div class="t">Changer le code PIN</div></span>${ic('chevR', 'chev')}</button>
         ${fs ? `<button class="item" data-act="${face ? 'faceOff' : 'faceOn'}"><span class="m"><div class="t">Face ID / Touch ID</div><div class="s">${face ? 'Activé' : 'Désactivé'}</div></span><span class="pill ${face ? 'good' : ''}">${face ? 'Activé' : 'Activer'}</span></button>` : ''}
         <button class="item" data-act="pinOff"><span class="m"><div class="t neg">Désactiver le verrouillage</div></span></button>`
      : `<button class="item" data-act="pinOn"><span class="m"><div class="t">Activer le verrouillage</div><div class="s">Code PIN à 6 chiffres, puis Face ID en option</div></span>${ic('chevR', 'chev')}</button>`;
  }

  // ---------- Rendu principal ----------
  function tabbar() {
    const T = [['home', 'Accueil'], ['bills', 'Factures'], ['expenses', 'Dépenses'], ['stats', 'Stats'], ['archive', 'Archives']];
    const active = ui.page ? (ui.page === 'month' ? 'archive' : (App.pageTab && App.pageTab[ui.page]) || null) : ui.tab;
    return `<div class="tabbar"><nav>${T.map(([k, l]) => `<button class="${active === k ? 'on' : ''}" data-act="tab" data-v="${k}" aria-label="${l}">${ic(k === 'expenses' ? 'exp' : k)}<span>${l}</span></button>`).join('')}</nav></div>`;
  }
  function render() {
    if (!state) return;
    const y = window.scrollY;
    const r = document.documentElement;
    if (state.settings.theme === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = state.settings.theme;
    document.body.classList.toggle('blur', !!state.settings.hideAmounts);
    let body;
    if (ui.page === 'settings') body = viewSettings();
    else if (ui.page === 'incomes') body = viewIncomes();
    else if (ui.page === 'savings') body = viewSavings();
    else if (ui.page === 'categories') body = viewCategories();
    else if (ui.page === 'month') body = viewMonthPage();
    else if (ui.page && App.pages[ui.page]) body = App.pages[ui.page]();
    else body = { home: viewHome, bills: viewBills, expenses: viewExpenses, stats: viewStats, archive: viewArchive }[ui.tab]();
    $('#app').innerHTML = `<div class="${ui.animate ? 'view' : ''}">${body}</div>${tabbar()}`;
    if (ui.page === 'settings') fillSecurity();
    window.scrollTo(0, ui.animate ? 0 : y);
    ui.animate = false;
  }
  function go(tab, page) { ui.tab = tab; ui.page = page || null; ui.animate = true; render(); }

  // ---------- Formulaires ----------
  function chips(list, selected, act) {
    return list.map(o => `<button type="button" class="chip ${o.id === selected ? 'on' : ''}" data-act="${act}" data-id="${esc(o.id)}">${o.icon ? o.icon + ' ' : ''}${esc(o.name)}</button>`).join('');
  }
  function expenseSheet(id) {
    const e = id ? state.expenses.find(x => x.id === id) : null;
    const vm = ui.viewMonth, def = vm === curYm() ? todayStr() : vm + '-01';
    form = { id, cat: e ? e.category : (lastCat && state.categories.some(c => c.id === lastCat) ? lastCat : state.categories[0].id), method: e ? e.method || '' : '' };
    openSheet(`<h3>${e ? 'Modifier la dépense' : 'Nouvelle dépense'}</h3>
      <div class="field"><input class="in amount num" id="f-amt" inputmode="decimal" placeholder="0.00" value="${e ? E.formatMoney(e.amount).replace(/’/g, '') : ''}" autofocus autocomplete="off"><div style="text-align:center;color:var(--muted);font-weight:600">${esc(cur())}</div></div>
      <div class="field"><label>Catégorie</label><div class="chips" id="cat-chips">${chips(state.categories, form.cat, 'pickCat')}</div></div>
      <div class="field"><label>Date</label><input class="in" type="date" id="f-date" value="${e ? e.date : def}"></div>
      <div class="field"><label>Description (facultatif)</label><input class="in" id="f-desc" maxlength="80" value="${esc(e ? e.desc : '')}" placeholder="Ex. Plein Migrol"></div>
      <div class="field"><label>Moyen de paiement (facultatif)</label><div class="chips" id="m-chips">${chips(METHODS.map(x => ({ id: x, name: x })), form.method, 'pickMethod')}</div></div>
      <div class="err"></div><div class="actions"><button class="btn" data-act="saveExpense">${e ? 'Enregistrer' : 'Ajouter'}</button>${e ? '<button class="btn danger" data-act="delExpense" data-id="' + e.id + '">Supprimer</button>' : ''}</div>`);
  }
  async function saveExpense() {
    const cents = E.parseMoney(val('f-amt')), date = val('f-date');
    if (cents == null || cents <= 0) return setErr('Entre un montant valide supérieur à 0.');
    if (!E.isValidDate(date)) return setErr('Date invalide.');
    const isNew = !form.id, f = { amount: cents, category: form.cat, date, desc: val('f-desc'), method: form.method };
    lastCat = form.cat;
    const ok = await commit(() => { if (isNew) E.addExpense(state, f); else E.updateExpense(state, form.id, f); });
    if (!ok) return;
    closeSheet();
    const m = month(date.slice(0, 7)), c = m.cats.find(r => r.cat.id === f.category);
    let msg = isNew ? 'Dépense ajoutée' : 'Dépense modifiée';
    if (m.rel === 'current') msg += m.daily.mode === 'ok' ? ` · ${E.formatMoney(m.daily.perDay, { auto: true })} ${cur()}/jour` : m.daily.mode === 'deficit' ? ' · budget dépassé' : '';
    if (c && c.status === 'warn') msg += ` · ${c.cat.name} : ${c.pct} % de la limite`;
    if (c && (c.status === 'alert' || c.status === 'over')) msg += ` · ⚠️ limite ${c.cat.name} ${c.status === 'over' ? 'dépassée' : 'atteinte'}`;
    toast(msg);
  }

  function billSheet(id) {
    const ym = ui.viewMonth;
    const occ = id ? E.billOccurrences(state, ym, todayStr()).find(b => b.id === id) : null;
    const item = id ? state.bills.find(b => b.id === id) : null;
    const rec = item ? item.type === 'recurring' : true;
    form = { id, type: rec ? 'recurring' : 'oneoff', cat: item ? item.category : 'Loyer', freq: occ && occ.freq || 'monthly' };
    const v = item && rec ? E.valueAt(item.versions, ym) || item.versions[0] : null;
    const defDate = ym === curYm() ? todayStr() : ym + '-01';
    openSheet(`<h3>${item ? 'Modifier la facture' : 'Nouvelle facture'}</h3>
      ${item ? '' : `<div class="seg" style="margin-bottom:6px"><button class="on" data-act="billType" data-v="recurring">Récurrente</button><button data-act="billType" data-v="oneoff">Exceptionnelle</button></div>`}
      <div class="field"><label>Nom</label><input class="in" id="f-name" maxlength="60" value="${esc(item ? item.name : '')}" placeholder="Ex. Assurance maladie" autofocus></div>
      <div class="field"><label>Montant (${esc(cur())})</label><input class="in num" id="f-amt" inputmode="decimal" placeholder="0.00" value="${occ ? E.formatMoney(occ.amount).replace(/’/g, '') : ''}"></div>
      <div class="field"><label>Catégorie</label><select class="in" id="f-bcat">${E.BILL_CATEGORIES.map(c => `<option ${c === form.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      ${item && rec ? `<div class="field" id="g-day"><label>Jour d’échéance (1–31)</label><input class="in" id="f-day" inputmode="numeric" value="${v.day || 1}"></div>`
        : `<div class="field" id="g-date"><label id="l-date">Première échéance</label><input class="in" type="date" id="f-date" value="${item ? item.date : defDate}"></div>`}
      <div class="field" id="g-freq" ${rec ? '' : 'class="hidden"'}><label>Fréquence</label><select class="in" id="f-freq">${Object.entries(E.FREQ_LABEL).map(([k, l]) => `<option value="${k}" ${k === form.freq ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Description (facultatif)</label><input class="in" id="f-desc" maxlength="120" value="${esc(item ? item.desc : '')}"></div>
      ${item && rec ? `<div class="switch"><span>Modifier seulement ${E.monthLabel(ym)}<br><small style="color:var(--muted)">Sinon : à partir de ce mois, sans toucher au passé</small></span><input type="checkbox" id="f-once"></div>` : ''}
      <div class="err"></div><div class="actions"><button class="btn" data-act="saveBill">Enregistrer</button></div>`);
    if (!rec && item) { const g = $('#g-freq'); if (g) g.classList.add('hidden'); }
    if (!item) { form.type = 'recurring'; }
  }
  async function saveBill() {
    const ym = ui.viewMonth, name = val('f-name'), cents = E.parseMoney(val('f-amt'));
    if (!name) return setErr('Donne un nom à la facture.');
    if (cents == null || cents < 0) return setErr('Montant invalide.');
    const base = { name, category: val('f-bcat'), desc: val('f-desc'), amount: cents };
    const item = form.id ? state.bills.find(b => b.id === form.id) : null;
    let ok;
    if (item) {
      if (item.type === 'oneoff') {
        const date = val('f-date'); if (!E.isValidDate(date)) return setErr('Date invalide.');
        ok = await commit(() => E.updateOneoff(item, { ...base, date }));
      } else {
        const day = parseInt(val('f-day'), 10), once = $('#f-once').checked;
        if (!(day >= 1 && day <= 31)) return setErr('Jour entre 1 et 31.');
        ok = await commit(() => E.editRecurring(item, ym, { ...base, day, freq: val('f-freq') }, once));
      }
    } else {
      const date = val('f-date'); if (!E.isValidDate(date)) return setErr('Date invalide.');
      ok = await commit(() => {
        if (form.type === 'oneoff') E.addBill(state, { type: 'oneoff', ...base, date });
        else E.addBill(state, { type: 'recurring', ...base, from: date.slice(0, 7), day: Number(date.slice(8, 10)), freq: val('f-freq') });
      });
      if (ok && date.slice(0, 7) !== ui.viewMonth) ui.viewMonth = date.slice(0, 7), render();
    }
    if (ok) { closeSheet(); toast('Facture enregistrée'); }
  }

  function incomeSheet(id) {
    const ym = ui.viewMonth;
    const item = id ? state.incomes.find(i => i.id === id) : null;
    const rec = item ? item.type === 'recurring' : true;
    const occ = item ? E.incomeOccurrences(state, ym).find(i => i.id === id) : null;
    const v = item && rec ? E.valueAt(item.versions, ym) || item.versions[0] : null;
    form = { id, type: rec ? 'recurring' : 'oneoff' };
    const amount = occ ? occ.amount : v ? v.amount : item ? item.amount : null;
    openSheet(`<h3>${item ? 'Modifier le revenu' : 'Nouveau revenu'}</h3>
      ${item ? '' : `<div class="seg" style="margin-bottom:6px"><button class="on" data-act="incType" data-v="recurring">Récurrent</button><button data-act="incType" data-v="oneoff">Exceptionnel</button></div>`}
      <div class="field"><label>Nom</label><input class="in" id="f-name" maxlength="60" value="${esc(item ? item.name : '')}" placeholder="Ex. Salaire" autofocus></div>
      <div class="field"><label>Montant (${esc(cur())})</label><input class="in num" id="f-amt" inputmode="decimal" placeholder="0.00" value="${amount != null ? E.formatMoney(amount).replace(/’/g, '') : ''}"></div>
      ${item && rec ? `<div class="field"><label>Jour de versement (1–31)</label><input class="in" id="f-day" inputmode="numeric" value="${v.day || 1}"></div>`
        : `<div class="field"><label id="l-date">Date de début</label><input class="in" type="date" id="f-date" value="${item ? item.date : (ym === curYm() ? todayStr() : ym + '-01')}"></div>`}
      <div class="field"><label>Description (facultatif)</label><input class="in" id="f-desc" maxlength="120" value="${esc(item ? item.desc : '')}"></div>
      ${item && rec ? `<div class="switch"><span>Modifier seulement ${E.monthLabel(ym)}<br><small style="color:var(--muted)">Les autres mois ne changent pas</small></span><input type="checkbox" id="f-once"></div>` : ''}
      <div class="err"></div><div class="actions"><button class="btn" data-act="saveIncome">Enregistrer</button></div>`);
  }
  async function saveIncome() {
    const ym = ui.viewMonth, name = val('f-name'), cents = E.parseMoney(val('f-amt'));
    if (!name) return setErr('Donne un nom au revenu.');
    if (cents == null || cents < 0) return setErr('Montant invalide.');
    const item = form.id ? state.incomes.find(i => i.id === form.id) : null;
    let ok;
    if (item) {
      if (item.type === 'oneoff') { const date = val('f-date'); if (!E.isValidDate(date)) return setErr('Date invalide.'); ok = await commit(() => E.updateOneoff(item, { name, amount: cents, date, desc: val('f-desc') })); }
      else { const day = parseInt(val('f-day'), 10); if (!(day >= 1 && day <= 31)) return setErr('Jour entre 1 et 31.'); ok = await commit(() => E.editRecurring(item, ym, { name, desc: val('f-desc'), amount: cents, day }, $('#f-once').checked)); }
    } else {
      const date = val('f-date'); if (!E.isValidDate(date)) return setErr('Date invalide.');
      ok = await commit(() => E.addIncome(state, form.type === 'oneoff' ? { type: 'oneoff', name, amount: cents, date, desc: val('f-desc') } : { type: 'recurring', name, amount: cents, from: date.slice(0, 7), day: Number(date.slice(8, 10)), desc: val('f-desc') }));
      if (ok && date.slice(0, 7) !== ui.viewMonth) ui.viewMonth = date.slice(0, 7), render();
    }
    if (ok) { closeSheet(); toast('Revenu enregistré'); }
  }

  function goalSheet(id) {
    const g = id ? state.goals.find(x => x.id === id) : null, ym = curYm();
    const mv = g ? E.valueAt(g.versions, ym) : null;
    form = { id };
    openSheet(`<h3>${g ? 'Modifier l’objectif' : 'Nouvel objectif'}</h3>
      <div class="field"><label>Nom</label><input class="in" id="f-name" maxlength="50" value="${esc(g ? g.name : '')}" placeholder="Ex. Vacances" autofocus></div>
      <div class="field"><label>Versement mensuel réservé (${esc(cur())})</label><input class="in num" id="f-monthly" inputmode="decimal" placeholder="0.00" value="${mv ? E.formatMoney(mv.monthly).replace(/’/g, '') : ''}"></div>
      <div class="field"><label>Montant cible (facultatif — vide = épargne générale)</label><input class="in num" id="f-target" inputmode="decimal" placeholder="Ex. 2000" value="${g && g.target != null ? E.formatMoney(g.target).replace(/’/g, '') : ''}"></div>
      <div class="field"><label>Déjà épargné au départ</label><input class="in num" id="f-initial" inputmode="decimal" placeholder="0.00" value="${g && g.initial ? E.formatMoney(g.initial).replace(/’/g, '') : ''}"></div>
      ${g ? '<div class="note">Un nouveau versement mensuel s’applique à partir de ce mois, pas aux mois passés.</div>' : `<div class="field"><label>Premier mois</label><input class="in" type="month" id="f-start" value="${ym}"></div>`}
      <div class="err"></div><div class="actions"><button class="btn" data-act="saveGoal">Enregistrer</button>${g ? `<button class="btn danger" data-act="delGoal" data-id="${g.id}">Supprimer</button>` : ''}</div>`);
  }
  async function saveGoal() {
    const name = val('f-name'), monthly = E.parseMoney(val('f-monthly') || '0'), tv = val('f-target'), target = tv ? E.parseMoney(tv) : null, initial = E.parseMoney(val('f-initial') || '0');
    if (!name) return setErr('Donne un nom à l’objectif.');
    if (monthly == null || monthly < 0 || initial == null || initial < 0 || (tv && (target == null || target <= 0))) return setErr('Montants invalides.');
    const g = form.id ? state.goals.find(x => x.id === form.id) : null;
    const ok = await commit(() => {
      if (g) { g.name = name; g.target = target; g.initial = initial; E.setGoalMonthly(g, curYm(), monthly); }
      else { const sm = val('f-start') || curYm(); if (!/^\d{4}-\d{2}$/.test(sm)) throw new Error('Mois invalide'); E.addGoal(state, { name, target, initial, monthly, startMonth: sm }); }
    });
    if (ok) { closeSheet(); toast('Objectif enregistré'); }
  }

  function categorySheet(id) {
    const c = id ? state.categories.find(x => x.id === id) : null, ym = curYm();
    const lv = c ? E.valueAt(c.limits, ym) : null;
    form = { id, icon: c ? c.icon : EMOJIS[0], color: c ? c.color : COLORS[0] };
    openSheet(`<h3>${c ? esc(c.name) : 'Nouvelle catégorie'}</h3>
      ${c && c.builtin ? '' : `<div class="field"><label>Nom</label><input class="in" id="f-name" maxlength="30" value="${esc(c ? c.name : '')}" autofocus></div>
      <div class="field"><label>Icône</label><div class="chips" id="emo">${EMOJIS.map(e => `<button type="button" class="chip ${e === form.icon ? 'on' : ''}" data-act="pickEmoji" data-id="${e}">${e}</button>`).join('')}</div></div>`}
      <div class="field"><label>Limite mensuelle (${esc(cur())}) — vide = aucune</label><input class="in num" id="f-limit" inputmode="decimal" placeholder="Ex. 250" value="${lv && lv.amount ? E.formatMoney(lv.amount).replace(/’/g, '') : ''}" ${c && c.builtin ? 'autofocus' : ''}></div>
      <div class="note">S’applique à partir de ${E.monthLabel(ym)} ; les mois précédents gardent leur limite. Avertissement à 80 %, alerte à 100 %.</div>
      <div class="err"></div><div class="actions"><button class="btn" data-act="saveCategory">Enregistrer</button>${c && !c.builtin ? `<button class="btn danger" data-act="delCategory" data-id="${c.id}">Supprimer</button>` : ''}</div>`);
  }
  async function saveCategory() {
    const lim = val('f-limit'), cents = lim ? E.parseMoney(lim) : null;
    if (lim && (cents == null || cents <= 0)) return setErr('Limite invalide.');
    const c = form.id ? state.categories.find(x => x.id === form.id) : null;
    const nameEl = document.getElementById('f-name'), name = nameEl ? nameEl.value.trim() : null;
    if (nameEl && !name) return setErr('Donne un nom à la catégorie.');
    const ok = await commit(() => {
      const cat = c || E.addCategory(state, { name, icon: form.icon });
      if (c && nameEl) { c.name = name; c.icon = form.icon; }
      E.setCategoryLimit(cat, curYm(), cents);
    });
    if (ok) { closeSheet(); toast('Catégorie enregistrée'); }
  }

  // ---------- Verrouillage ----------
  function pinPad(el, { title, sub, onDone, face, cancel }) {
    let pin = '';
    const draw = () => {
      el.innerHTML = `<h1>${esc(title)}</h1><div style="color:var(--muted);font-size:14px;min-height:18px" id="pin-sub">${esc(sub || '')}</div>
        <div class="dots" id="dots">${Array.from({ length: 6 }, (_, i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
        <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="face" style="background:none;box-shadow:none;font-size:15px;color:var(--accent)">${face ? 'Face ID' : (cancel ? 'Annuler' : '')}</button><button data-k="0">0</button><button data-k="del" style="background:none;box-shadow:none;font-size:22px">⌫</button></div>`;
    };
    draw();
    el.onclick = async e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'del') pin = pin.slice(0, -1);
      else if (k === 'face') { if (face) return face(); if (cancel) return cancel(); }
      else if (pin.length < 6) pin += k;
      draw();
      if (pin.length === 6) { const p = pin; pin = ''; const bad = await onDone(p); if (bad) { const d = $('#dots', el); d.classList.add('shake'); setTimeout(() => draw(), 420); } else draw(); }
    };
  }
  let locked = false;
  async function showUnlock() {
    const el = $('#lock'); locked = true; el.classList.remove('hidden'); el.style.visibility = 'visible';
    const hasFace = await Lock.hasFace();
    const tryFace = async () => { if (await Lock.checkFace()) hideLock(); };
    pinPad(el, { title: 'Budget', sub: 'Entre ton code', face: hasFace ? tryFace : null, onDone: async p => { if (await Lock.checkPin(p)) { hideLock(); return false; } return true; } });
    if (hasFace) setTimeout(tryFace, 350);
  }
  function hideLock() { locked = false; $('#lock').classList.add('hidden'); $('#lock').innerHTML = ''; }
  function setPinFlow(next) {
    let first = null;
    const el = $('#lock'); el.classList.remove('hidden'); el.style.visibility = 'visible';
    const close = () => { el.classList.add('hidden'); el.innerHTML = ''; };
    const step = () => pinPad(el, {
      title: first ? 'Confirme le code' : 'Choisis un code', sub: first ? '' : '6 chiffres', cancel: close,
      onDone: async p => {
        if (!first) { first = p; step(); return false; }
        if (p !== first) { first = null; toast('Les codes ne correspondent pas'); step(); return true; }
        await Lock.setPin(p); close(); toast('Verrouillage activé'); if (next) next(); else render(); return false;
      },
    });
    step();
  }

  // ---------- Données ----------
  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => {});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const counts = d => `${d.expenses.length} dépenses, ${d.bills.length} factures, ${d.incomes.length} revenus, ${d.goals.length} objectifs`;
  async function replaceState(data, label) {
    await Store.snapshot(state, label);
    state = data; await persist(); ui.page = null; ui.tab = 'home'; ui.viewMonth = curYm(); ui.animate = true; closeSheet(); render();
  }

  // ---------- Actions ----------
  const A = {
    tab(el) { ui.viewMonth = curYm(); go(el.dataset.v); },
    closeSheet() { closeSheet(); },
    pending(el) { const f = pendingFns[+el.dataset.i]; closeSheet(); if (f) f(); },
    back() { go('archive'); },
    mprev() { ui.viewMonth = E.addMonths(ui.viewMonth, -1); render(); },
    mnext() { ui.viewMonth = E.addMonths(ui.viewMonth, 1); render(); },
    yprev() { ui.archiveYear--; render(); }, ynext() { ui.archiveYear++; render(); },
    openMonth(el) { ui.viewMonth = el.dataset.ym; ui.page = 'month'; ui.animate = true; render(); },
    goBills() { ui.viewMonth = curYm(); go('bills'); }, goExpenses() { ui.viewMonth = curYm(); go('expenses'); },
    billsTab(el) { ui.billsTab = el.dataset.v; render(); },
    goSubs() { ui.billsTab = 'subs'; ui.viewMonth = curYm(); go('bills'); },
    dashEdit() {
      const list = dashOrder();
      openSheet(`<h3>Personnaliser l’accueil</h3><p class="note" style="margin:-6px 2px 12px">Change l’ordre et masque les cartes que tu n’utilises pas. Les raccourcis restent en haut.</p><div class="reorder">${list.map((x, i) => `<div class="r ${x.on ? '' : 'off'}"><b>${esc(DASH.find(d => d[0] === x.id)[1])}</b>
        <button class="mv" data-act="dashMove" data-id="${x.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${ic('up')}</button><button class="mv" data-act="dashMove" data-id="${x.id}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">${ic('down')}</button>
        <input type="checkbox" ${x.on ? 'checked' : ''} data-act="dashToggle" data-id="${x.id}" style="width:26px;height:26px;accent-color:var(--accent)" aria-label="Afficher"></div>`).join('')}</div>
        <div class="actions"><button class="btn sec" data-act="dashReset">Réinitialiser</button><button class="btn" data-act="closeSheet">Terminer</button></div>`);
    },
    dashMove(el) { const l = dashOrder(), i = l.findIndex(x => x.id === el.dataset.id), j = i + Number(el.dataset.d); if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; state.settings.dashOrder = l; persist(); render(); A.dashEdit(); },
    dashToggle(el) { const l = dashOrder(); const x = l.find(y => y.id === el.dataset.id); x.on = !x.on; state.settings.dashOrder = l; persist(); render(); },
    dashReset() { state.settings.dashOrder = null; persist(); render(); A.dashEdit(); },
    openSettings() { go(ui.tab, 'settings'); }, closeSettings() { go(ui.tab, null); },
    openIncomes() { ui.viewMonth = curYm(); go(ui.tab, 'incomes'); }, openSavings() { go(ui.tab, 'savings'); }, openCategories() { go(ui.tab, 'categories'); },
    statsRange(el) { ui.statsRange = el.dataset.v; render(); },
    toggleHide() { state.settings.hideAmounts = !state.settings.hideAmounts; persist(); render(); },
    setTheme(el) { state.settings.theme = el.dataset.v; persist(); render(); },
    // dépenses
    addExpense() { expenseSheet(null); }, editExpense(el) { expenseSheet(el.dataset.id); },
    pickCat(el) { form.cat = el.dataset.id; $('#cat-chips').innerHTML = chips(state.categories, form.cat, 'pickCat'); },
    pickMethod(el) { form.method = form.method === el.dataset.id ? '' : el.dataset.id; $('#m-chips').innerHTML = chips(METHODS.map(x => ({ id: x, name: x })), form.method, 'pickMethod'); },
    saveExpense,
    delExpense(el) { closeSheet(); commit(() => E.deleteExpense(state, el.dataset.id), { msg: 'Dépense supprimée', undo: true }); },
    // factures
    addBill() { billSheet(null); },
    billType(el) {
      form.type = el.dataset.v; document.querySelectorAll('[data-act=billType]').forEach(b => b.classList.toggle('on', b === el));
      $('#g-freq').classList.toggle('hidden', form.type !== 'recurring'); $('#l-date').textContent = form.type === 'recurring' ? 'Première échéance' : 'Date d’échéance';
    },
    saveBill,
    billMenu(el) {
      const ym = ui.viewMonth, b = E.billOccurrences(state, ym, todayStr()).find(x => x.id === el.dataset.id); if (!b) return;
      const [cls, lbl] = STAT[b.status];
      openSheet(`<h3>${esc(b.name)}</h3><div class="card" style="margin-top:0"><div class="kpi"><div class="v">${mcur(b.amount)}</div><div class="k">Échéance ${E.fmtDate(b.dueDate)} · <span class="pill ${cls}">${lbl}</span>${b.paidDate ? ' le ' + E.fmtDate(b.paidDate) : ''}</div></div></div>
        <div class="menu">
          <button data-act="togglePaid" data-id="${b.id}">${b.status === 'paid' ? 'Marquer comme non payée' : '✓ Marquer comme payée'}</button>
          <button data-act="editBill" data-id="${b.id}">Modifier</button><button data-act="dupBill" data-id="${b.id}">Dupliquer</button>
          <button class="red" data-act="delBill" data-id="${b.id}">Supprimer</button></div>`);
    },
    togglePaid(el) {
      const b = state.bills.find(x => x.id === el.dataset.id), occ = E.billOccurrences(state, ui.viewMonth, todayStr()).find(x => x.id === b.id);
      closeSheet(); commit(() => E.setBillPaid(b, ui.viewMonth, occ.status === 'paid' ? null : todayStr()), { msg: occ.status === 'paid' ? 'Paiement annulé' : 'Facture marquée payée — budget inchangé' });
    },
    editBill(el) { billSheet(el.dataset.id); },
    dupBill(el) { closeSheet(); commit(() => E.duplicateBill(state, el.dataset.id), { msg: 'Facture dupliquée', undo: true }); },
    delBill(el) {
      const b = state.bills.find(x => x.id === el.dataset.id), ym = ui.viewMonth;
      if (b.type === 'oneoff') return confirmSheet('Supprimer cette facture ?', esc(b.name) + ' sera supprimée.', [{ label: 'Supprimer', cls: 'danger', fn: () => commit(() => E.removeItem(state, 'bills', b.id), { msg: 'Facture supprimée', undo: true }) }]);
      confirmSheet('Supprimer la facture récurrente ?', `« ${esc(b.name)} » : choisis ce qui est conservé.`, [
        { label: `Arrêter à partir de ${E.monthLabel(ym)} (garde l’historique)`, cls: '', fn: () => commit(() => E.stopRecurring(b, ym), { msg: 'Facture arrêtée', undo: true }) },
        { label: 'Supprimer toute la série (efface aussi le passé)', cls: 'danger', fn: () => commit(() => E.removeItem(state, 'bills', b.id), { msg: 'Série supprimée', undo: true }) }]);
    },
    // revenus
    addIncome() { incomeSheet(null); },
    incType(el) { form.type = el.dataset.v; document.querySelectorAll('[data-act=incType]').forEach(b => b.classList.toggle('on', b === el)); $('#l-date').textContent = form.type === 'recurring' ? 'Date de début' : 'Date'; },
    saveIncome,
    incomeMenu(el) {
      const ym = ui.viewMonth, i = state.incomes.find(x => x.id === el.dataset.id), occ = E.incomeOccurrences(state, ym).find(x => x.id === i.id);
      openSheet(`<h3>${esc(i.name)}</h3><div class="menu"><button data-act="editIncome" data-id="${i.id}">Modifier</button>
        ${occ && occ.overridden ? `<button data-act="clearOv" data-id="${i.id}">Rétablir le montant habituel pour ${E.monthLabel(ym)}</button>` : ''}
        <button class="red" data-act="delIncome" data-id="${i.id}">Supprimer</button></div>`);
    },
    editIncome(el) { incomeSheet(el.dataset.id); },
    clearOv(el) { closeSheet(); commit(() => E.clearOverride(state.incomes.find(x => x.id === el.dataset.id), ui.viewMonth), { msg: 'Montant rétabli' }); },
    delIncome(el) {
      const i = state.incomes.find(x => x.id === el.dataset.id), ym = ui.viewMonth;
      if (i.type === 'oneoff') return confirmSheet('Supprimer ce revenu ?', esc(i.name), [{ label: 'Supprimer', cls: 'danger', fn: () => commit(() => E.removeItem(state, 'incomes', i.id), { msg: 'Revenu supprimé', undo: true }) }]);
      confirmSheet('Supprimer le revenu récurrent ?', `« ${esc(i.name)} »`, [
        { label: `Arrêter à partir de ${E.monthLabel(ym)} (garde l’historique)`, cls: '', fn: () => commit(() => E.stopRecurring(i, ym), { msg: 'Revenu arrêté', undo: true }) },
        { label: 'Supprimer toute la série (efface aussi le passé)', cls: 'danger', fn: () => commit(() => E.removeItem(state, 'incomes', i.id), { msg: 'Série supprimée', undo: true }) }]);
    },
    // épargne
    addGoal() { goalSheet(null); }, editGoal(el) { goalSheet(el.dataset.id); }, saveGoal,
    delGoal(el) { closeSheet(); confirmSheet('Supprimer cet objectif ?', 'L’historique de cet objectif disparaît des archives.', [{ label: 'Supprimer', cls: 'danger', fn: () => commit(() => E.removeItem(state, 'goals', el.dataset.id), { msg: 'Objectif supprimé', undo: true }) }]); },
    // catégories
    addCategory() { categorySheet(null); }, editCategory(el) { categorySheet(el.dataset.id); }, saveCategory,
    pickEmoji(el) { form.icon = el.dataset.id; document.querySelectorAll('#emo .chip').forEach(b => b.classList.toggle('on', b === el)); },
    delCategory(el) { closeSheet(); confirmSheet('Supprimer la catégorie ?', 'Ses dépenses seront déplacées vers « Divers ».', [{ label: 'Supprimer', cls: 'danger', fn: () => commit(() => E.deleteCategory(state, el.dataset.id), { msg: 'Catégorie supprimée', undo: true }) }]); },
    // sécurité
    pinOn() { setPinFlow(); }, changePin() { setPinFlow(); },
    async pinOff() { await Lock.remove(); render(); toast('Verrouillage désactivé'); },
    lockNow() { showUnlock(); },
    async faceOn() { try { await Lock.enableFace(); toast('Face ID activé'); } catch (e) { toast('Face ID indisponible : ' + (e.message || e.name)); } render(); },
    async faceOff() { await Lock.disableFace(); render(); },
    // données
    exportData() { download(`budget-sauvegarde-${todayStr()}.json`, JSON.stringify(E.exportData(state), null, 1)); },
    importPick() { $('#import-file').click(); },
    async listBackups() {
      const l = await Store.listBackups();
      pendingFns = l.map(b => () => replaceState(JSON.parse(JSON.stringify(b.data)), 'avant-restauration').then(() => toast('Sauvegarde restaurée')));
      openSheet(`<h3>Sauvegardes sur l’appareil</h3>${l.length ? `<div class="menu">${l.map((b, i) => `<button data-act="pending" data-i="${i}"><span>${b.at.slice(0, 10).split('-').reverse().join('.')} ${b.at.slice(11, 16)} <small>${b.label}</small><br><small>${counts(b.data)}</small></span><span class="link">Restaurer</span></button>`).join('')}</div>` : empty('Aucune sauvegarde', 'Une sauvegarde est créée chaque jour à l’ouverture.')}
        <div class="note">Ces copies vivent dans l’application : exporte aussi un fichier régulièrement.</div>`);
    },
    resetAll() {
      openSheet(`<h3>Réinitialiser l’application</h3><p style="color:var(--muted)">Toutes tes données seront effacées. Une copie de sécurité reste disponible dans « Sauvegardes automatiques ». Tape <b>EFFACER</b> pour confirmer.</p>
        <div class="field"><input class="in" id="f-confirm" autocapitalize="characters" autocomplete="off" placeholder="EFFACER"></div><div class="err"></div>
        <div class="actions"><button class="btn danger" data-act="doReset">Tout effacer</button></div>`);
    },
    async doReset() { if (val('f-confirm').toUpperCase() !== 'EFFACER') return setErr('Tape EFFACER pour confirmer.'); const keep = state.settings; const d = E.defaultState(); d.settings = { ...d.settings, theme: keep.theme, currency: keep.currency }; await replaceState(d, 'avant-reinit'); toast('Application réinitialisée'); },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || (locked && !el.closest('#lock'))) return;
    const f = A[el.dataset.act]; if (f) f(el, e);
  });
  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.change;
    if (k === 'setCurrency') { state.settings.currency = e.target.value; persist(); render(); }
    if (k === 'toggleSmooth') { state.settings.smoothSubs = e.target.checked; persist(); render(); toast(e.target.checked ? 'Abonnements annuels lissés : provision mensuelle activée' : 'Lissage désactivé'); }
    if (k === 'toggleHideChk') { state.settings.hideAmounts = e.target.checked; persist(); render(); }
    if (e.target.id === 'import-file' && e.target.files[0]) {
      const f = e.target.files[0]; e.target.value = '';
      f.text().then(t => {
        let d; try { d = E.parseImport(t); } catch (err) { return toast('⚠️ ' + err.message); }
        pendingFns = [() => replaceState(d, 'avant-import').then(() => toast('Sauvegarde importée'))];
        openSheet(`<h3>Importer cette sauvegarde ?</h3><p style="color:var(--muted)">Contenu : ${counts(d)}.<br>Tes données actuelles seront remplacées (une copie de sécurité est conservée).</p><div class="actions"><button class="btn danger" data-act="pending" data-i="0">Remplacer mes données</button><button class="btn sec" data-act="closeSheet">Annuler</button></div>`);
      });
    }
  });

  // ---------- Démarrage ----------
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (!state) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      if (await Lock.enabled()) { const el = $('#lock'); if (!locked) { el.classList.remove('hidden'); el.innerHTML = '<h1>Budget</h1>'; } }
    } else {
      if (await Lock.enabled()) { if (Date.now() - hiddenAt > 60000 || locked) showUnlock(); else if (!locked) hideLock(); }
      checkDayChange();
    }
  });
  function checkDayChange() {
    const t = todayStr();
    if (t !== ui.lastDay) { const wasCur = ui.viewMonth === ui.lastDay.slice(0, 7); ui.lastDay = t; if (wasCur) ui.viewMonth = curYm(); render(); }
  }
  setInterval(checkDayChange, 30000);

  async function start() {
    try {
      state = await Store.load();
      if (!state) { state = E.defaultState(); await Store.save(state); }
      else E.migrate(state);
      Store.persist();
      await Store.autoBackup(state, todayStr());
    } catch (e) {
      $('#app').innerHTML = `<div class="card"><h2>Erreur de stockage</h2>${esc(e.message)}</div>`; return;
    }
    if (await Lock.enabled()) await showUnlock();
    render();
    if (App.notifyReminders) App.notifyReminders();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  Object.assign(App, { A, ui, esc, ic, P, money, mcur, bar, barCls, empty, monthNav, backBtn, catOf, month, todayStr, curYm, cur, commit, persist, toast, openSheet, closeSheet, confirmSheet, val, setErr,
    render, go, chips, dateLabel, BILL_EMOJI, expenseRow, billRow, catBars, STAT, WD, WDL, MS, METHODS, wdOf });
  Object.defineProperty(App, 'state', { get() { return state; }, set(v) { state = v; }, enumerable: true });
  window.__app = { get state() { return state; }, ui, render, go }; // utile pour les tests manuels
  start();
})();
