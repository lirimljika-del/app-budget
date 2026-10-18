/* Moteur financier — logique pure, sans DOM. Montants en centimes entiers.
   Dates = chaînes 'AAAA-MM-JJ' (jamais de toISOString → aucun décalage de fuseau). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Dates ----------
  const pad = n => String(n).padStart(2, '0');
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const ymParts = ym => { const [y, m] = ym.split('-').map(Number); return { y, m }; };
  const dimOf = ym => { const { y, m } = ymParts(ym); return daysInMonth(y, m); };
  const addMonths = (ym, n) => {
    const { y, m } = ymParts(ym);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
  };
  const monthsDiff = (a, b) => { const A = ymParts(a), B = ymParts(b); return (B.y * 12 + B.m) - (A.y * 12 + A.m); };
  const localDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isValidDate = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
  };
  const fmtDate = iso => (iso && isValidDate(iso)) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const monthLabel = ym => { const { y, m } = ymParts(ym); return `${MONTHS[m - 1]} ${y}`; };
  const clampDay = (ym, day) => Math.min(Math.max(1, day || 1), dimOf(ym));
  // Arithmétique de dates en UTC sur des entiers de jours : insensible aux fuseaux et à l'heure d'été.
  const dayNum = iso => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
  const fromDayNum = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const addDays = (iso, n) => fromDayNum(dayNum(iso) + n);
  const diffDays = (a, b) => dayNum(b) - dayNum(a);
  const addMonthsClamp = (iso, n, anchorDay) => { const ym = addMonths(iso.slice(0, 7), n); return `${ym}-${pad(Math.min(anchorDay || +iso.slice(8, 10), dimOf(ym)))}`; };

  // ---------- Argent (centimes entiers) ----------
  function parseMoney(input) {
    let s = String(input == null ? '' : input).trim().replace(/[\s'’‘`]/g, '').replace(',', '.');
    if (!/^[+-]?\d*\.?\d*$/.test(s) || !/\d/.test(s)) return null;
    let neg = false;
    if (s[0] === '-') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    const [i, f = ''] = s.split('.');
    if (f.length > 2 || i.length > 10) return null;
    const cents = parseInt(i || '0', 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
    return neg ? -cents : cents;
  }
  function formatMoney(cents, opts = {}) {
    const { auto = false, sign = false } = opts;
    const neg = cents < 0, abs = Math.abs(cents);
    const whole = Math.floor(abs / 100), frac = abs % 100;
    const w = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '’');
    let s = (auto && frac === 0) ? w : `${w}.${pad(frac)}`;
    if (neg) s = '−' + s; else if (sign && cents > 0) s = '+' + s;
    return s;
  }
  const sum = (arr, f) => arr.reduce((a, x, i) => a + f(x, i), 0);

  // ---------- Données ----------
  const DEFAULT_CATEGORIES = [
    { id: 'essence', name: 'Essence', icon: '⛽', color: '#c07a2c' },
    { id: 'courses', name: 'Alimentation / courses', icon: '🛒', color: '#4f8a6a' },
    { id: 'restaurants', name: 'Restaurants', icon: '🍽️', color: '#b5453a' },
    { id: 'loisirs', name: 'Loisirs', icon: '🎬', color: '#7b5ea7' },
    { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#b0577a' },
    { id: 'sante', name: 'Santé', icon: '💊', color: '#4a8fa8' },
    { id: 'transport', name: 'Transport', icon: '🚆', color: '#4a5fa0' },
    { id: 'abonnements', name: 'Abonnements', icon: '🔁', color: '#3d7f95' },
    { id: 'divers', name: 'Divers', icon: '✨', color: '#8a8681' },
  ];
  const SUB_FREQ = {
    weekly: { days: 7, perYear: 52, label: 'Hebdomadaire' }, monthly: { months: 1, perYear: 12, label: 'Mensuelle' },
    quarterly: { months: 3, perYear: 4, label: 'Trimestrielle' }, semiannual: { months: 6, perYear: 2, label: 'Semestrielle' },
    annual: { months: 12, perYear: 1, label: 'Annuelle' },
  };
  const SUB_STATUS = { active: 'Actif', paused: 'Suspendu', cancelled: 'Résilié' };
  const BILL_CATEGORIES = ['Loyer', 'Assurance maladie', 'Assurance auto', 'Autre assurance', 'Téléphone', 'Internet', 'Abonnement', 'Leasing', 'Impôts', 'Autre'];
  const STEP = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  const FREQ_LABEL = { monthly: 'Mensuelle', quarterly: 'Trimestrielle', semiannual: 'Semestrielle', annual: 'Annuelle' };

  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function defaultState() {
    return {
      schema: 1,
      settings: { payday: { on: false, day: 25, adjust: true, fromYm: null, asked: false }, currency: 'CHF', theme: 'auto', hideAmounts: false, smoothSubs: false, importDateMode: 'tx', dashOrder: null, ownAccounts: [], keepPdf: false },
      categories: DEFAULT_CATEGORIES.map(c => ({ ...c, builtin: true, limits: [] })),
      incomes: [], bills: [], expenses: [], goals: [], subs: [], imports: [], importKeys: [], rules: {},
    };
  }
  // Met à niveau un état plus ancien (idempotent) : aucune donnée existante n'est modifiée.
  function migrate(st) {
    const d = defaultState();
    st.settings = { ...d.settings, ...(st.settings || {}) };
    for (const k of ['subs', 'imports', 'importKeys']) if (!Array.isArray(st[k])) st[k] = [];
    if (!st.rules || typeof st.rules !== 'object') st.rules = {};
    // Teintes plus sobres (cosmétique) pour les catégories d'origine.
    const OLD = { essence: '#FF9F0A', courses: '#30D158', restaurants: '#FF453A', loisirs: '#BF5AF2', shopping: '#FF375F', sante: '#64D2FF', transport: '#5E5CE6', divers: '#8E8E93' };
    for (const c of st.categories) { const n = DEFAULT_CATEGORIES.find(x => x.id === c.id); if (n && c.builtin && OLD[c.id] === c.color) c.color = n.color; }
    if (!st.categories.some(c => c.id === 'abonnements')) {
      const i = st.categories.findIndex(c => c.id === 'divers');
      const c = { ...DEFAULT_CATEGORIES.find(x => x.id === 'abonnements'), builtin: true, limits: [] };
      if (i >= 0) st.categories.splice(i, 0, c); else st.categories.push(c);
    }
    return st;
  }

  function valueAt(versions, ym) {
    let r = null;
    for (const v of versions || []) if (v.from <= ym && (!r || v.from >= r.from)) r = v;
    return r;
  }
  function setVersion(versions, v) {
    const i = versions.findIndex(x => x.from === v.from);
    if (i >= 0) versions[i] = v; else versions.push(v);
    versions.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  }
  function mustCents(n, label = 'montant') {
    if (!Number.isInteger(n)) throw new Error(`${label} invalide (centimes entiers requis)`);
    return n;
  }

  // ---------- Début de mois = jour de salaire (option) ----------
  // Une « période » porte le nom du mois où commence le salaire. Sans réglage : mois civil.
  // Règle jours ouvrés : samedi → vendredi (la veille), dimanche → lundi (le lendemain).
  const payCfg = st => { const p = st && st.settings && st.settings.payday; return p && p.on ? p : null; };
  function paydayDate(state, ym) {
    const p = (state.settings && state.settings.payday) || { day: 1, adjust: false };
    let d = `${ym}-${pad(clampDay(ym, p.day))}`;
    if (p.adjust) { const dow = new Date(dayNum(d) * 86400000).getUTCDay(); if (dow === 6) d = addDays(d, -1); else if (dow === 0) d = addDays(d, 1); }
    return d;
  }
  const calRange = ym => ({ from: `${ym}-01`, to: `${ym}-${pad(dimOf(ym))}` });
  // Nom de la période : salaire tôt dans le mois (jour ≤ 15) → mois de début ; salaire tardif (≥ 16) → mois de fin
  // (le salaire du 25 octobre ouvre la période « novembre »).
  const byEnd = p => p.day >= 16;
  function payRange(state, ym, p) {
    const a = byEnd(p) ? addMonths(ym, -1) : ym;
    return { from: paydayDate(state, a), to: addDays(paydayDate(state, addMonths(a, 1)), -1) };
  }
  function periodRange(state, ym) {
    const p = payCfg(state); if (!p) return calRange(ym);
    const f = p.fromYm || '0000-00';
    if (ym < addMonths(f, -1)) return calRange(ym);
    if (ym === addMonths(f, -1)) { const from = `${ym}-01`, to = addDays(payRange(state, f, p).from, -1); return { from, to: to < from ? from : to }; }   // transition : mois civil raccourci/allongé une seule fois
    return payRange(state, ym, p);
  }
  function periodOf(state, iso) {
    const m = iso.slice(0, 7);
    for (const ym of [m, addMonths(m, -1), addMonths(m, 1)]) { const r = periodRange(state, ym); if (iso >= r.from && iso <= r.to) return ym; }
    return m;
  }
  const monthsAround = (from, to) => { const out = []; for (let m = addMonths(from.slice(0, 7), -1), end = addMonths(to.slice(0, 7), 1); m <= end; m = addMonths(m, 1)) out.push(m); return out; };
  function setPayday(state, cfg, today) {
    const day = Math.round(+cfg.day);
    if (!(day >= 1 && day <= 31)) throw new Error('Jour invalide (1 à 31)');
    if (!cfg.on) { state.settings.payday = { ...state.settings.payday, on: false, asked: true }; return; }
    // La période en cours démarre au dernier salaire reçu ; seule la fin du mois civil précédent est raccourcie
    // (les mois plus anciens ne sont jamais redécoupés).
    const conf = { on: true, day, adjust: !!cfg.adjust }, tmp = { settings: { payday: conf } }, cm = today.slice(0, 7);
    let F = cfg.fromYm || null;
    for (let i = -1; !F && i <= 2; i++) { const lab = addMonths(cm, i), r = payRange(tmp, lab, conf); if (today >= r.from && today <= r.to) F = lab; }
    state.settings.payday = { ...conf, fromYm: F || cm, asked: true };
  }

  // ---------- Occurrences mensuelles ----------
  function incomeOccurrences(state, ym) {
    const out = [];
    for (const inc of state.incomes) {
      if (inc.type === 'oneoff') {
        if (inc.date.slice(0, 7) === ym) out.push({ id: inc.id, name: inc.name, amount: inc.amount, date: inc.date, ym, recurring: false, desc: inc.desc || '' });
      } else {
        if (inc.stopFrom && ym >= inc.stopFrom) continue;
        const v = valueAt(inc.versions, ym);
        if (!v) continue;
        const ov = inc.overrides && inc.overrides[ym];
        const p = payCfg(state), base = `${ym}-${pad(clampDay(ym, v.day))}`;
        const isSalary = p && inc.salary !== false && (inc.salary === true || v.day === p.day);
        out.push({
          id: inc.id, name: inc.name, amount: ov !== undefined ? ov : v.amount, baseAmount: v.amount, ym,
          date: isSalary ? paydayDate(state, ym) : base, recurring: true, overridden: ov !== undefined, desc: inc.desc || '',
        });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  const incomeOccurrencesRange = (state, from, to) => monthsAround(from, to).flatMap(m => incomeOccurrences(state, m)).filter(o => o.date >= from && o.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const billOccurrencesRange = (state, from, to, today) => monthsAround(from, to).flatMap(m => billOccurrences(state, m, today)).filter(o => o.dueDate >= from && o.dueDate <= to).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  function billOccurrences(state, ym, today) {
    const out = [];
    const push = (bill, amount, dueDate, paidDate, extra) => {
      const status = paidDate ? 'paid' : (today && dueDate < today ? 'overdue' : 'pending');
      out.push({ id: bill.id, name: bill.name, category: bill.category, amount, dueDate, paidDate: paidDate || null, status, desc: bill.desc || '', ym, ...extra });
    };
    for (const b of state.bills) {
      if (b.type === 'oneoff') {
        if (b.date.slice(0, 7) === ym) push(b, b.amount, b.date, b.paidDate, { recurring: false });
      } else {
        if (b.stopFrom && ym >= b.stopFrom) continue;
        const v = valueAt(b.versions, ym);
        if (!v) continue;
        const diff = monthsDiff(b.anchor, ym);
        if (diff < 0 || diff % STEP[v.freq || 'monthly'] !== 0) continue;
        const ov = b.overrides && b.overrides[ym];
        push(b, ov !== undefined ? ov : v.amount, `${ym}-${pad(clampDay(ym, v.day))}`, b.paid && b.paid[ym],
          { recurring: true, freq: v.freq || 'monthly', overridden: ov !== undefined, baseAmount: v.amount });
      }
    }
    return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  }

  // Épargne : un objectif = versements mensuels planifiés (plafonnés à la cible).
  function goalSchedule(goal, uptoYm) {
    const res = [];
    let acc = goal.initial || 0;
    let ym = goal.startMonth;
    const cap = goal.target == null ? null : goal.target;
    while (ym <= uptoYm) {
      if (goal.stopFrom && ym >= goal.stopFrom) break;
      const v = valueAt(goal.versions, ym);
      const planned = v ? v.monthly : 0;
      const amount = cap != null ? Math.max(0, Math.min(planned, cap - acc)) : planned;
      res.push({ ym, amount, planned });
      acc += amount;
      ym = addMonths(ym, 1);
    }
    return res;
  }
  function goalSummary(goal, ym) {
    const sched = goalSchedule(goal, ym);
    const thisMonth = (sched.find(s => s.ym === ym) || { amount: 0 }).amount;
    const saved = (goal.initial || 0) + sum(sched, s => s.amount);
    const reached = goal.target != null && saved >= goal.target;
    return { goal, saved, thisMonth, reached, target: goal.target, pct: goal.target ? Math.min(100, Math.floor(saved * 100 / goal.target)) : null };
  }
  function savingsPlan(state, ym) {
    const items = state.goals.map(g => goalSummary(g, ym)).filter(s => s.thisMonth > 0);
    return { items, total: sum(items, s => s.thisMonth) };
  }
  function savedTotal(state, ym) { return sum(state.goals, g => goalSummary(g, ym).saved); }

  // ---------- Abonnements ----------
  // Échéances = dates générées depuis l'ancre de chaque « version » (changement de prix / renouvellement),
  // avec ramené en fin de mois (31 → 30/28/29) tout en gardant le jour d'origine.
  function subCancelDate(sub) {
    if (sub.cancelDate) return sub.cancelDate;
    if (sub.status !== 'cancelled') return null;
    const keys = Object.keys(sub.paid || {}).sort();
    return keys.length ? addDays(keys[keys.length - 1], 1) : (sub.versions[0] ? sub.versions[0].from : '0000-01-01');
  }
  const inGap = (sub, due) => (sub.gaps || []).some(g => due >= g.from && (!g.to || due < g.to));
  function subDueDates(sub, from, to) {
    const vs = (sub.versions || []).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
    const cancel = subCancelDate(sub), out = [];
    vs.forEach((v, i) => {
      const segEnd = i + 1 < vs.length ? vs[i + 1].from : null, f = SUB_FREQ[v.freq || 'monthly'], day = +v.from.slice(8, 10);
      for (let k = 0; k < 5000; k++) {
        const due = f.days ? addDays(v.from, f.days * k) : addMonthsClamp(v.from, f.months * k, day);
        if (due > to || (segEnd && due >= segEnd) || (cancel && due >= cancel)) break;
        if (due < from || inGap(sub, due)) continue;
        out.push({ due, amount: v.amount, freq: v.freq || 'monthly', first: due === v.from, estimated: due !== v.from && !(sub.paid && sub.paid[due]) });
      }
    });
    return out.sort((a, b) => (a.due < b.due ? -1 : 1));
  }
  function subOccurrences(state, ym, today) { return subOccurrencesRange(state, `${ym}-01`, `${ym}-${pad(dimOf(ym))}`, today); }
  function subOccurrencesRange(state, from, to, today) {
    const out = [];
    for (const s of state.subs || []) {
      for (const d of subDueDates(s, from, to)) {
        const paidDate = (s.paid && s.paid[d.due]) || null;
        out.push({ id: s.id, name: s.name, category: s.category, amount: d.amount, dueDate: d.due, paidDate, freq: d.freq, estimated: d.estimated, sub: true,
          status: paidDate ? 'paid' : (today && d.due < today ? 'overdue' : 'pending') });
      }
    }
    return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  }
  const subVersionAt = (sub, iso) => { let r = null; for (const v of sub.versions || []) if (v.from <= iso && (!r || v.from >= r.from)) r = v; return r || (sub.versions || [])[0] || null; };
  const monthlyEquivalent = (amount, freq) => Math.round(amount * SUB_FREQ[freq || 'monthly'].perYear / 12);
  const annualCost = (amount, freq) => amount * SUB_FREQ[freq || 'monthly'].perYear;
  // Provision mensuelle (option) pour les abonnements trimestriels / semestriels / annuels :
  // dès le mois suivant le 1er prélèvement (ou `provisionFrom`), on réserve le coût mensuel moyen et les
  // prélèvements eux-mêmes ne sont plus déduits (ils sont couverts par la provision) → aucune double comptabilisation.
  function subProvision(state, ym) {
    const res = { on: !!(state.settings && state.settings.smoothSubs), total: 0, items: [], smoothed: new Set() };
    if (!res.on) return res;
    const { from: mStart, to: mEnd } = periodRange(state, ym);
    for (const s of state.subs || []) {
      const v = subVersionAt(s, mEnd);
      if (!v || !['quarterly', 'semiannual', 'annual'].includes(v.freq)) continue;
      const cancel = subCancelDate(s);
      const startsAt = s.provisionFrom || addMonths(s.versions[0].from.slice(0, 7), 1);
      if (ym < startsAt || (cancel && cancel.slice(0, 7) <= ym)) continue;
      if ((s.gaps || []).some(g => g.from <= mStart && (!g.to || g.to > mEnd))) continue;
      const amount = monthlyEquivalent(v.amount, v.freq);
      res.items.push({ id: s.id, name: s.name, amount }); res.total += amount; res.smoothed.add(s.id);
    }
    return res;
  }
  function nextDue(sub, today) {
    const d = subDueDates(sub, today, addDays(today, 3 * 366));
    return d.length ? d[0] : null;
  }
  function lastPaidOf(sub) { const k = Object.keys(sub.paid || {}).sort(); return k.length ? { due: k[k.length - 1], paidDate: sub.paid[k[k.length - 1]] } : null; }
  function subsSummary(state, today) {
    const act = (state.subs || []).filter(s => s.status === 'active' && !(subCancelDate(s) && subCancelDate(s) <= today));
    let monthly = 0, annual = 0, next = null;
    const upcoming = [];
    for (const s of act) {
      const v = subVersionAt(s, today); if (!v) continue;
      monthly += monthlyEquivalent(v.amount, v.freq); annual += annualCost(v.amount, v.freq);
      for (const d of subDueDates(s, today, addDays(today, 60))) upcoming.push({ sub: s, ...d, daysLeft: diffDays(today, d.due) });
    }
    upcoming.sort((a, b) => (a.due < b.due ? -1 : 1));
    if (upcoming.length) next = upcoming[0];
    const m = computeMonth(state, periodOf(state, today), today);
    return { count: act.length, monthly, annual, next, upcoming, plannedThisMonth: m.subsActual, countedThisMonth: m.subsTotal };
  }
  function upcomingReminders(state, today) {
    const out = [];
    for (const s of state.subs || []) {
      if (s.status !== 'active' || !(s.reminders || []).length) continue;
      for (const d of subDueDates(s, today, addDays(today, 8))) {
        const left = diffDays(today, d.due);
        if (s.reminders.includes(left) && !(s.paid && s.paid[d.due])) out.push({ sub: s, ...d, daysLeft: left });
      }
    }
    return out;
  }
  function subsToIcs(state, today, months = 12) {
    const esc = t => String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const to = addDays(today, months * 31), L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget perso//FR', 'CALSCALE:GREGORIAN'];
    for (const s of state.subs || []) {
      if (s.status === 'cancelled') continue;
      for (const d of subDueDates(s, today, to)) {
        L.push('BEGIN:VEVENT', `UID:${s.id}-${d.due}@budget-perso`, `DTSTAMP:${today.replace(/-/g, '')}T000000Z`, `DTSTART;VALUE=DATE:${d.due.replace(/-/g, '')}`,
          `SUMMARY:${esc(s.name + ' — ' + formatMoney(d.amount) + ' ' + (state.settings.currency || 'CHF'))}`, `DESCRIPTION:${esc('Prélèvement' + (d.estimated ? ' (date estimée)' : ''))}`);
        for (const r of s.reminders || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(s.name)}`, `TRIGGER:-P${r}D`, 'END:VALARM');
        L.push('END:VEVENT');
      }
    }
    L.push('END:VCALENDAR');
    return L.join('\r\n');
  }
  function addSub(state, f) {
    mustCents(f.amount, 'montant');
    const start = f.startDate, last = f.lastPaid || null;
    const anchor = f.nextDue || (last ? last : start);
    if (![start, anchor].every(isValidDate) || (last && !isValidDate(last))) throw new Error('Date invalide');
    const sub = { id: uid(), name: f.name, category: f.category || 'Abonnement', method: f.method || '', notes: f.notes || '', status: f.status || 'active', provisionFrom: f.provisionFrom || null,
      startDate: start, cancelDate: f.cancelDate || null, reminders: f.reminders || [], gaps: [], paid: {},
      versions: [{ from: anchor, amount: f.amount, freq: f.freq || 'monthly' }] };
    if (last && !f.nextDue) sub.paid[last] = last;     // le dernier paiement est l'ancre de la série
    state.subs.push(sub);
    return sub;
  }
  function setSubPaid(sub, due, paidDateOrNull) { sub.paid = sub.paid || {}; if (paidDateOrNull) sub.paid[due] = paidDateOrNull; else delete sub.paid[due]; }
  // Changement de prix (ou de fréquence) à partir d'une échéance : le passé ne bouge pas.
  function changeSubPrice(sub, fromDue, amount, freq) {
    mustCents(amount);
    const base = subVersionAt(sub, fromDue);
    setVersion(sub.versions, { from: fromDue, amount, freq: freq || (base && base.freq) || 'monthly' });
  }
  function setSubStatus(sub, status, today) {
    if (status === sub.status) return sub;
    const open = (sub.gaps || []).find(g => !g.to);
    if (status === 'paused') { sub.gaps = sub.gaps || []; if (!open) sub.gaps.push({ from: today, to: null }); sub.cancelDate = null; }
    else if (status === 'cancelled') { if (open) open.to = today; sub.cancelDate = today; }
    else if (status === 'active') { if (open) open.to = today; sub.cancelDate = null; }
    sub.status = status; return sub;
  }

  // ---------- Calcul du mois ----------
  function categorySummary(state, ym, expenses) {
    const rows = state.categories.map(c => {
      const spent = sum(expenses.filter(e => e.category === c.id), e => e.amount);
      const lv = valueAt(c.limits, ym);
      const limit = lv && lv.amount > 0 ? lv.amount : null;
      let status = 'none', pct = null;
      if (limit != null) {
        pct = Math.floor(spent * 100 / limit);
        status = spent > limit ? 'over' : spent === limit ? 'alert' : spent * 100 >= limit * 80 ? 'warn' : 'ok';
      }
      return { cat: c, spent, limit, remaining: limit != null ? limit - spent : null, pct, status, over: limit != null && spent > limit ? spent - limit : 0 };
    });
    const known = new Set(state.categories.map(c => c.id));
    const orphan = expenses.filter(e => !known.has(e.category));
    if (orphan.length) rows.push({ cat: { id: '?', name: 'Catégorie supprimée', icon: '❔', color: '#8E8E93' }, spent: sum(orphan, e => e.amount), limit: null, remaining: null, pct: null, status: 'none', over: 0 });
    return rows;
  }

  function computeMonth(state, ym, today) {
    const { from, to } = periodRange(state, ym);
    const dim = diffDays(from, to) + 1;
    const rel = today < from ? 'future' : today > to ? 'past' : 'current';
    const dayNum = rel === 'current' ? diffDays(from, today) + 1 : rel === 'past' ? dim : 0;
    const daysLeft = rel === 'current' ? dim - dayNum + 1 : rel === 'future' ? dim : 0;

    const incomes = incomeOccurrencesRange(state, from, to);
    const bills = billOccurrencesRange(state, from, to, today);
    const expenses = state.expenses.filter(e => e.date >= from && e.date <= to)
      .sort((a, b) => (a.date === b.date ? (a.ts || 0) - (b.ts || 0) : a.date < b.date ? -1 : 1));
    const savings = savingsPlan(state, ym);
    const subsOcc = subOccurrencesRange(state, from, to, today);
    const prov = subProvision(state, ym);

    const income = sum(incomes, i => i.amount);
    const billsTotal = sum(bills, b => b.amount);           // payées ET impayées : comptées UNE seule fois
    const billsPaid = sum(bills.filter(b => b.status === 'paid'), b => b.amount);
    const billsUnpaid = billsTotal - billsPaid;
    const spent = sum(expenses, e => e.amount);
    const reserved = savings.total;
    const subsActual = sum(subsOcc, b => b.amount);
    const subsPaid = sum(subsOcc.filter(b => b.status === 'paid'), b => b.amount);
    // Lissage facultatif : les abonnements non mensuels sont provisionnés chaque mois (jamais comptés deux fois).
    const subsTotal = prov.on ? sum(subsOcc.filter(o => !prov.smoothed.has(o.id)), b => b.amount) + prov.total : subsActual;
    const remaining = income - billsTotal - subsTotal - spent - reserved;

    const spentToday = rel === 'current' ? sum(expenses.filter(e => e.date === today), e => e.amount) : 0;
    const daily = { mode: 'ok', perDay: null, deficit: 0, todayAllowance: null, todayLeft: null, spentToday };
    if (rel === 'past') daily.mode = 'past';
    else if (remaining < 0) { daily.mode = 'deficit'; daily.deficit = -remaining; }
    else if (remaining === 0) { daily.mode = 'exhausted'; daily.perDay = 0; }
    else daily.perDay = Math.floor(remaining / daysLeft);
    if (rel === 'current') {
      const base = remaining + spentToday;
      daily.todayAllowance = base > 0 ? Math.floor(base / daysLeft) : 0;
      daily.todayLeft = daily.todayAllowance - spentToday;
    }

    const cats = categorySummary(state, ym, expenses);

    let forecast = { available: false };
    if (rel === 'current') {
      const projectedSpent = Math.round(spent * dim / dayNum);
      const projectedEnd = income - billsTotal - subsTotal - reserved - projectedSpent;
      forecast = {
        available: true, avgDaily: Math.round(spent / dayNum), projectedSpent, projectedEnd,
        overBudget: projectedEnd < 0 ? -projectedEnd : 0, lowConfidence: dayNum < 5,
      };
    }

    const committed = billsTotal + subsTotal + spent + reserved;
    return {
      ym, from, to, rel, dim, dayNum, daysLeft, income, incomes, bills, billsTotal, billsPaid, billsUnpaid,
      billsOverdue: bills.filter(b => b.status === 'overdue'), subsOcc, subsActual, subsPaid, subsUnpaid: subsActual - subsPaid,
      subsTotal, subsProvision: prov.on ? prov.total : 0, subsSmoothed: prov.on,
      subsOverdue: subsOcc.filter(b => b.status === 'overdue'), spent, expenses, reserved, savings, remaining,
      daily, cats, forecast,
      pctMonth: rel === 'current' ? Math.round(dayNum * 100 / dim) : rel === 'past' ? 100 : 0,
      pctBudget: income > 0 ? Math.round(committed * 100 / income) : null,
      hasIncome: income > 0,
    };
  }

  // ---------- Statistiques ----------
  function rangeStats(state, endYm, n, today) {
    const months = [];
    for (let i = n - 1; i >= 0; i--) months.push(computeMonth(state, addMonths(endYm, -i), today));
    const prev = [];
    for (let i = 2 * n - 1; i >= n; i--) prev.push(computeMonth(state, addMonths(endYm, -i), today));
    const income = sum(months, m => m.income), billsTotal = sum(months, m => m.billsTotal), subsTotal = sum(months, m => m.subsTotal);
    const spent = sum(months, m => m.spent), reserved = sum(months, m => m.reserved);
    // Mois en cours : on le compare au mois précédent jusqu'au même jour (comparaison équitable).
    const lastM = months[months.length - 1];
    const prevSpent = sum(prev, (m, i) => (i === prev.length - 1 && lastM.rel === 'current')
      ? sum(m.expenses.filter(e => diffDays(m.from, e.date) + 1 <= lastM.dayNum), e => e.amount) : m.spent);
    const byCat = new Map();
    for (const m of months) for (const r of m.cats) if (r.spent) {
      const cur = byCat.get(r.cat.id) || { cat: r.cat, spent: 0 };
      cur.spent += r.spent; byCat.set(r.cat.id, cur);
    }
    const categories = [...byCat.values()].sort((a, b) => b.spent - a.spent);
    const all = months.flatMap(m => m.expenses);
    const biggest = all.reduce((b, e) => (!b || e.amount > b.amount ? e : b), null);
    const daysCounted = sum(months, m => m.rel === 'current' ? m.dayNum : m.rel === 'past' ? m.dim : 0);
    return {
      months, income, billsTotal, subsTotal, spent, reserved, remaining: income - billsTotal - subsTotal - spent - reserved,
      categories, topCategory: categories[0] || null, biggest,
      avgDaily: daysCounted ? Math.round(spent / daysCounted) : 0,
      pctIncomeSpent: income > 0 ? Math.round((billsTotal + subsTotal + spent) * 100 / income) : null,
      prevSpent, deltaPct: prevSpent > 0 ? Math.round((spent - prevSpent) * 100 / prevSpent) : null,
      savedSeries: months.map(m => ({ ym: m.ym, saved: savedTotal(state, m.ym) })),
    };
  }
  function dailySeries(state, ym, today) {
    const m = computeMonth(state, ym, today);
    const last = m.rel === 'current' ? m.dayNum : m.rel === 'past' ? m.dim : 0;
    const perDay = Array.from({ length: m.dim }, () => 0);
    for (const e of m.expenses) perDay[diffDays(m.from, e.date)] += e.amount;
    let acc = 0;
    const cumul = perDay.map((v, i) => (i < last ? (acc += v) : null));
    return { dim: m.dim, last, perDay, cumul, month: m };
  }

  // ---------- Mutations (opèrent sur l'état en place) ----------
  function addExpense(state, { amount, category, date, desc = '', method = '' }) {
    mustCents(amount); if (amount <= 0) throw new Error('Le montant doit être positif');
    if (!isValidDate(date)) throw new Error('Date invalide');
    const e = { id: uid(), amount, category, date, desc, method, ts: Date.now() };
    state.expenses.push(e); return e;
  }
  function updateExpense(state, id, ch) {
    const e = state.expenses.find(x => x.id === id); if (!e) throw new Error('Dépense introuvable');
    if ('amount' in ch) { mustCents(ch.amount); if (e.amount < 0 ? ch.amount >= 0 : ch.amount <= 0) throw new Error(e.amount < 0 ? 'Montant négatif requis pour un remboursement' : 'Le montant doit être positif'); }
    if ('date' in ch && !isValidDate(ch.date)) throw new Error('Date invalide');
    Object.assign(e, ch); return e;
  }
  // Remboursement / retour de paiement : dépense négative, rattachée à la dépense d'origine si connue.
  function addRefund(state, { amount, category, date, desc = '', refundOf = null }) {
    mustCents(amount); if (amount <= 0) throw new Error('Montant de remboursement positif requis');
    if (!isValidDate(date)) throw new Error('Date invalide');
    const e = { id: uid(), amount: -amount, category, date, desc, method: '', refundOf, ts: Date.now() };
    state.expenses.push(e); return e;
  }
  function deleteExpense(state, id) { state.expenses = state.expenses.filter(e => e.id !== id); }

  function addIncome(state, f) {
    mustCents(f.amount);
    if (f.type === 'oneoff') {
      if (!isValidDate(f.date)) throw new Error('Date invalide');
      const i = { id: uid(), type: 'oneoff', name: f.name, amount: f.amount, date: f.date, desc: f.desc || '' };
      state.incomes.push(i); return i;
    }
    const i = { id: uid(), type: 'recurring', name: f.name, desc: f.desc || '', versions: [{ from: f.from, amount: f.amount, day: f.day || 1 }], overrides: {}, stopFrom: null };
    state.incomes.push(i); return i;
  }
  function addBill(state, f) {
    mustCents(f.amount);
    if (f.type === 'oneoff') {
      if (!isValidDate(f.date)) throw new Error('Date invalide');
      const b = { id: uid(), type: 'oneoff', name: f.name, category: f.category, amount: f.amount, date: f.date, desc: f.desc || '', paidDate: null };
      state.bills.push(b); return b;
    }
    const b = { id: uid(), type: 'recurring', name: f.name, category: f.category, desc: f.desc || '', anchor: f.from,
      versions: [{ from: f.from, amount: f.amount, day: f.day || 1, freq: f.freq || 'monthly' }], overrides: {}, paid: {}, stopFrom: null };
    state.bills.push(b); return b;
  }
  // Modification d'un élément récurrent : jamais rétroactive (nouvelle version à partir du mois ym).
  function editRecurring(item, ym, ch, onlyThisMonth) {
    for (const k of ['name', 'desc', 'category']) if (k in ch && ch[k] !== undefined) item[k] = ch[k];
    if (onlyThisMonth) {
      if ('amount' in ch) { mustCents(ch.amount); item.overrides = item.overrides || {}; item.overrides[ym] = ch.amount; }
      return item;
    }
    const base = valueAt(item.versions, ym) || item.versions[0];
    const next = { ...base, from: ym < item.versions[0].from ? item.versions[0].from : ym };
    if ('amount' in ch) next.amount = mustCents(ch.amount);
    if ('day' in ch) next.day = ch.day;
    if ('freq' in ch && ch.freq) next.freq = ch.freq;
    setVersion(item.versions, next);
    if (item.overrides && 'amount' in ch) delete item.overrides[ym];
    return item;
  }
  function updateOneoff(item, ch) {
    if ('amount' in ch) mustCents(ch.amount);
    if ('date' in ch && !isValidDate(ch.date)) throw new Error('Date invalide');
    return Object.assign(item, ch);
  }
  function clearOverride(item, ym) { if (item.overrides) delete item.overrides[ym]; }
  function stopRecurring(item, ym) { item.stopFrom = ym; }
  function removeItem(state, kind, id) { state[kind] = state[kind].filter(x => x.id !== id); }
  function setBillPaid(bill, ym, dateOrNull) {
    if (bill.type === 'oneoff') bill.paidDate = dateOrNull;
    else { bill.paid = bill.paid || {}; if (dateOrNull) bill.paid[ym] = dateOrNull; else delete bill.paid[ym]; }
  }
  function duplicateBill(state, id) {
    const src = state.bills.find(b => b.id === id); if (!src) throw new Error('Facture introuvable');
    const c = JSON.parse(JSON.stringify(src));
    c.id = uid(); c.name = src.name + ' (copie)';
    if (c.type === 'oneoff') c.paidDate = null; else { c.paid = {}; c.overrides = {}; c.stopFrom = null; }
    state.bills.push(c); return c;
  }

  function addGoal(state, f) {
    const g = { id: uid(), name: f.name, target: f.target == null ? null : f.target, initial: f.initial || 0,
      startMonth: f.startMonth, versions: [{ from: f.startMonth, monthly: f.monthly || 0 }], stopFrom: null };
    state.goals.push(g); return g;
  }
  function setGoalMonthly(goal, ym, monthly) {
    const from = ym < goal.startMonth ? goal.startMonth : ym;
    setVersion(goal.versions, { from, monthly: mustCents(monthly) });
  }
  function setCategoryLimit(cat, ym, amountOrNull) {
    cat.limits = cat.limits || [];
    setVersion(cat.limits, { from: ym, amount: amountOrNull == null ? null : mustCents(amountOrNull) });
  }
  function addCategory(state, { name, icon, color }) {
    const c = { id: uid(), name, icon: icon || '🏷️', color: color || '#0A84FF', builtin: false, limits: [] };
    state.categories.push(c); return c;
  }
  function deleteCategory(state, id) {
    // Les dépenses existantes sont réaffectées à « Divers » pour ne rien perdre.
    for (const e of state.expenses) if (e.category === id) e.category = 'divers';
    state.categories = state.categories.filter(c => c.id !== id);
  }

  // ---------- Sauvegarde / validation ----------
  function validateState(s) {
    const errs = [];
    if (!s || typeof s !== 'object') return ['Format invalide'];
    for (const k of ['categories', 'incomes', 'bills', 'expenses', 'goals']) if (!Array.isArray(s[k])) errs.push(`« ${k} » manquant`);
    if (errs.length) return errs;
    s.expenses.forEach((e, i) => {
      if (!Number.isInteger(e.amount)) errs.push(`Dépense ${i + 1} : montant invalide`);
      if (!isValidDate(e.date)) errs.push(`Dépense ${i + 1} : date invalide`);
    });
    s.bills.forEach((b, i) => {
      if (b.type === 'oneoff') { if (!Number.isInteger(b.amount) || !isValidDate(b.date)) errs.push(`Facture ${i + 1} invalide`); }
      else if (!b.versions || !b.versions.length || !b.versions.every(v => Number.isInteger(v.amount)) || !/^\d{4}-\d{2}$/.test(b.anchor || '')) errs.push(`Facture récurrente ${i + 1} invalide`);
    });
    s.incomes.forEach((x, i) => {
      if (x.type === 'oneoff') { if (!Number.isInteger(x.amount) || !isValidDate(x.date)) errs.push(`Revenu ${i + 1} invalide`); }
      else if (!x.versions || !x.versions.length || !x.versions.every(v => Number.isInteger(v.amount))) errs.push(`Revenu récurrent ${i + 1} invalide`);
    });
    (s.subs || []).forEach((x, i) => {
      if (!x.versions || !x.versions.length || !x.versions.every(v => Number.isInteger(v.amount) && isValidDate(v.from) && SUB_FREQ[v.freq || 'monthly'])) errs.push(`Abonnement ${i + 1} invalide`);
    });
    s.goals.forEach((g, i) => { if (!/^\d{4}-\d{2}$/.test(g.startMonth || '') || !g.versions) errs.push(`Objectif ${i + 1} invalide`); });
    return errs;
  }
  function exportData(state) { return { app: 'budget-perso', schema: 1, exportedAt: new Date().toISOString(), data: state }; }
  function parseImport(text) {
    let o; try { o = JSON.parse(text); } catch { throw new Error('Fichier illisible (JSON invalide)'); }
    const data = o && o.app === 'budget-perso' ? o.data : null;
    if (!data) throw new Error('Ce fichier n’est pas une sauvegarde de cette application');
    const errs = validateState(data);
    if (errs.length) throw new Error('Sauvegarde invalide : ' + errs.slice(0, 3).join(' ; '));
    return migrate(data);
  }

  return {
    pad, isLeap, daysInMonth, dimOf, ymParts, addMonths, monthsDiff, localDateStr, isValidDate, fmtDate, monthLabel, MONTHS, clampDay,
    parseMoney, formatMoney, DEFAULT_CATEGORIES, BILL_CATEGORIES, STEP, FREQ_LABEL, uid, defaultState, valueAt, setVersion,
    incomeOccurrences, billOccurrences, goalSchedule, goalSummary, savingsPlan, savedTotal, computeMonth, rangeStats, dailySeries,
    addExpense, updateExpense, deleteExpense, addIncome, addBill, editRecurring, updateOneoff, clearOverride, stopRecurring,
    removeItem, setBillPaid, duplicateBill, addGoal, setGoalMonthly, setCategoryLimit, addCategory, deleteCategory,
    validateState, exportData, parseImport, migrate,
    paydayDate, periodRange, periodOf, setPayday, incomeOccurrencesRange, billOccurrencesRange, subOccurrencesRange,
    dayNum, fromDayNum, addDays, diffDays, addMonthsClamp, SUB_FREQ, SUB_STATUS, subDueDates, subOccurrences, subProvision, subVersionAt,
    monthlyEquivalent, annualCost, nextDue, lastPaidOf, subsSummary, upcomingReminders, subsToIcs, addSub, setSubPaid, changeSubPrice,
    setSubStatus, subCancelDate, addRefund,
  };
});
