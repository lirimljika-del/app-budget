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
    { id: 'essence', name: 'Essence', icon: '⛽', color: '#FF9F0A' },
    { id: 'courses', name: 'Alimentation / courses', icon: '🛒', color: '#30D158' },
    { id: 'restaurants', name: 'Restaurants', icon: '🍽️', color: '#FF453A' },
    { id: 'loisirs', name: 'Loisirs', icon: '🎬', color: '#BF5AF2' },
    { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#FF375F' },
    { id: 'sante', name: 'Santé', icon: '💊', color: '#64D2FF' },
    { id: 'transport', name: 'Transport', icon: '🚆', color: '#5E5CE6' },
    { id: 'divers', name: 'Divers', icon: '✨', color: '#8E8E93' },
  ];
  const BILL_CATEGORIES = ['Loyer', 'Assurance maladie', 'Assurance auto', 'Autre assurance', 'Téléphone', 'Internet', 'Abonnement', 'Leasing', 'Impôts', 'Autre'];
  const STEP = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  const FREQ_LABEL = { monthly: 'Mensuelle', quarterly: 'Trimestrielle', semiannual: 'Semestrielle', annual: 'Annuelle' };

  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function defaultState() {
    return {
      schema: 1,
      settings: { currency: 'CHF', theme: 'auto', hideAmounts: false },
      categories: DEFAULT_CATEGORIES.map(c => ({ ...c, builtin: true, limits: [] })),
      incomes: [], bills: [], expenses: [], goals: [],
    };
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

  // ---------- Occurrences mensuelles ----------
  function incomeOccurrences(state, ym) {
    const out = [];
    for (const inc of state.incomes) {
      if (inc.type === 'oneoff') {
        if (inc.date.slice(0, 7) === ym) out.push({ id: inc.id, name: inc.name, amount: inc.amount, date: inc.date, recurring: false, desc: inc.desc || '' });
      } else {
        if (inc.stopFrom && ym >= inc.stopFrom) continue;
        const v = valueAt(inc.versions, ym);
        if (!v) continue;
        const ov = inc.overrides && inc.overrides[ym];
        out.push({
          id: inc.id, name: inc.name, amount: ov !== undefined ? ov : v.amount, baseAmount: v.amount,
          date: `${ym}-${pad(clampDay(ym, v.day))}`, recurring: true, overridden: ov !== undefined, desc: inc.desc || '',
        });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  function billOccurrences(state, ym, today) {
    const out = [];
    const push = (bill, amount, dueDate, paidDate, extra) => {
      const status = paidDate ? 'paid' : (today && dueDate < today ? 'overdue' : 'pending');
      out.push({ id: bill.id, name: bill.name, category: bill.category, amount, dueDate, paidDate: paidDate || null, status, desc: bill.desc || '', ...extra });
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
    const dim = dimOf(ym);
    const cur = today.slice(0, 7);
    const rel = ym < cur ? 'past' : ym > cur ? 'future' : 'current';
    const dayNum = rel === 'current' ? Number(today.slice(8, 10)) : rel === 'past' ? dim : 0;
    const daysLeft = rel === 'current' ? dim - dayNum + 1 : rel === 'future' ? dim : 0;

    const incomes = incomeOccurrences(state, ym);
    const bills = billOccurrences(state, ym, today);
    const expenses = state.expenses.filter(e => e.date.slice(0, 7) === ym)
      .sort((a, b) => (a.date === b.date ? (a.ts || 0) - (b.ts || 0) : a.date < b.date ? -1 : 1));
    const savings = savingsPlan(state, ym);

    const income = sum(incomes, i => i.amount);
    const billsTotal = sum(bills, b => b.amount);           // payées ET impayées : comptées UNE seule fois
    const billsPaid = sum(bills.filter(b => b.status === 'paid'), b => b.amount);
    const billsUnpaid = billsTotal - billsPaid;
    const spent = sum(expenses, e => e.amount);
    const reserved = savings.total;
    const remaining = income - billsTotal - spent - reserved;

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
      const projectedEnd = income - billsTotal - reserved - projectedSpent;
      forecast = {
        available: true, avgDaily: Math.round(spent / dayNum), projectedSpent, projectedEnd,
        overBudget: projectedEnd < 0 ? -projectedEnd : 0, lowConfidence: dayNum < 5,
      };
    }

    const committed = billsTotal + spent + reserved;
    return {
      ym, rel, dim, dayNum, daysLeft, income, incomes, bills, billsTotal, billsPaid, billsUnpaid,
      billsOverdue: bills.filter(b => b.status === 'overdue'), spent, expenses, reserved, savings, remaining,
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
    const income = sum(months, m => m.income), billsTotal = sum(months, m => m.billsTotal);
    const spent = sum(months, m => m.spent), reserved = sum(months, m => m.reserved);
    // Mois en cours : on le compare au mois précédent jusqu'au même jour (comparaison équitable).
    const lastM = months[months.length - 1];
    const prevSpent = sum(prev, (m, i) => (i === prev.length - 1 && lastM.rel === 'current')
      ? sum(m.expenses.filter(e => Number(e.date.slice(8, 10)) <= lastM.dayNum), e => e.amount) : m.spent);
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
      months, income, billsTotal, spent, reserved, remaining: income - billsTotal - spent - reserved,
      categories, topCategory: categories[0] || null, biggest,
      avgDaily: daysCounted ? Math.round(spent / daysCounted) : 0,
      pctIncomeSpent: income > 0 ? Math.round((billsTotal + spent) * 100 / income) : null,
      prevSpent, deltaPct: prevSpent > 0 ? Math.round((spent - prevSpent) * 100 / prevSpent) : null,
      savedSeries: months.map(m => ({ ym: m.ym, saved: savedTotal(state, m.ym) })),
    };
  }
  function dailySeries(state, ym, today) {
    const m = computeMonth(state, ym, today);
    const last = m.rel === 'current' ? m.dayNum : m.rel === 'past' ? m.dim : 0;
    const perDay = Array.from({ length: m.dim }, () => 0);
    for (const e of m.expenses) perDay[Number(e.date.slice(8, 10)) - 1] += e.amount;
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
    if ('amount' in ch) { mustCents(ch.amount); if (ch.amount <= 0) throw new Error('Le montant doit être positif'); }
    if ('date' in ch && !isValidDate(ch.date)) throw new Error('Date invalide');
    Object.assign(e, ch); return e;
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
    data.settings = { ...defaultState().settings, ...(data.settings || {}) };
    return data;
  }

  return {
    pad, isLeap, daysInMonth, dimOf, ymParts, addMonths, monthsDiff, localDateStr, isValidDate, fmtDate, monthLabel, MONTHS, clampDay,
    parseMoney, formatMoney, DEFAULT_CATEGORIES, BILL_CATEGORIES, STEP, FREQ_LABEL, uid, defaultState, valueAt, setVersion,
    incomeOccurrences, billOccurrences, goalSchedule, goalSummary, savingsPlan, savedTotal, computeMonth, rangeStats, dailySeries,
    addExpense, updateExpense, deleteExpense, addIncome, addBill, editRecurring, updateOneoff, clearOverride, stopRecurring,
    removeItem, setBillPaid, duplicateBill, addGoal, setGoalMonthly, setCategoryLimit, addCategory, deleteCategory,
    validateState, exportData, parseImport,
  };
});
