/* Module Abonnements : liste, échéances, calendrier des paiements, rappels. */
(function () {
  'use strict';
  const App = window.App, E = App.E, A = App.A, ui = App.ui;
  const { esc, ic, money, mcur, empty, openSheet, closeSheet, confirmSheet, val, setErr, commit, toast, chips, todayStr, curYm, cur } = App;
  const st = () => App.state;
  const SUB_CATS = [['Streaming', '🎬'], ['Musique', '🎵'], ['Cloud', '☁️'], ['Logiciel', '💻'], ['Téléphonie', '📱'], ['Presse', '📰'], ['Sport', '🏋️'], ['Assurance', '🛡️'], ['Autre', '🔁']];
  const EMO = Object.fromEntries(SUB_CATS);
  const REM = [7, 3, 1];
  let f = {};
  ui.calDay = null;

  const subRow = (s, today) => {
    const nd = E.nextDue(s, today), lp = E.lastPaidOf(s), v = E.subVersionAt(s, today) || s.versions[0];
    const dim = s.status !== 'active';
    const sub = s.status === 'cancelled' ? `Résilié le ${E.fmtDate(s.cancelDate || (lp && lp.paidDate))}` : s.status === 'paused' ? 'Suspendu' : nd ? `Prochaine : ${E.fmtDate(nd.due)}${nd.estimated ? ' (estimée)' : ''} · ${E.SUB_FREQ[v.freq || 'monthly'].label}` : 'Aucune échéance';
    const eq = !['monthly'].includes(v.freq) ? `<small>≈ ${E.formatMoney(E.monthlyEquivalent(v.amount, v.freq))} / mois</small>` : '';
    return `<button class="item" data-act="subMenu" data-id="${s.id}" style="${dim ? 'opacity:.6' : ''}"><span class="ico" style="background:var(--track)">${EMO[s.category] || '🔁'}</span>
      <span class="m"><div class="t">${esc(s.name)}</div><div class="s">${sub}</div></span><span class="a">${money(v.amount)}${eq}</span></button>`;
  };
  const occRow = o => `<button class="item" data-act="subMenu" data-id="${o.id}"><span class="ico" style="background:var(--track)">🔁</span><span class="m"><div class="t">${esc(o.name)}</div><div class="s">${E.fmtDate(o.dueDate)} · ${E.SUB_FREQ[o.freq].label}${o.estimated ? ' · estimée' : ''}</div></span>
    <span class="a">${money(o.amount)}<small class="pill ${App.STAT[o.status][0]}" style="margin-top:3px">${App.STAT[o.status][1]}</small></span></button>`;

  function calendar(ym, m) {
    const today = todayStr(), first = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).getDay(), lead = (first + 6) % 7, dim = E.dimOf(ym);
    const by = {};
    for (const o of m.subsOcc) (by[o.dueDate] = by[o.dueDate] || []).push({ t: 's', paid: o.status === 'paid' });
    for (const b of m.bills) (by[b.dueDate] = by[b.dueDate] || []).push({ t: 'b', paid: b.status === 'paid' });
    let h = `<div class="cal">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<div class="dow">${d}</div>`).join('')}${'<div class="blank"></div>'.repeat(lead)}`;
    for (let d = 1; d <= dim; d++) {
      const iso = `${ym}-${E.pad(d)}`, items = (by[iso] || []).slice(0, 3);
      h += `<button data-act="calDay" data-d="${iso}" class="${iso === today ? 'today' : ''} ${ui.calDay === iso ? 'sel' : ''}" aria-label="${E.fmtDate(iso)}">${d}<span class="dots">${items.map(i => `<i class="${i.t === 'b' ? 'b' : ''} ${i.paid ? 'p' : ''}"></i>`).join('')}</span></button>`;
    }
    h += '</div><div class="legend" style="margin-top:8px"><span><i style="background:var(--accent)"></i>Abonnement</span><span><i style="background:var(--c-bill)"></i>Facture</span><span>Points pâles = payé</span></div>';
    if (ui.calDay && ui.calDay.slice(0, 7) === ym) {
      const occ = m.subsOcc.filter(o => o.dueDate === ui.calDay), bl = m.bills.filter(b => b.dueDate === ui.calDay);
      h += `<div class="group-h" style="margin-top:12px"><span>${App.dateLabel(ui.calDay)}</span></div>` + (occ.length || bl.length ? `<div class="list">${occ.map(occRow).join('')}${bl.map(App.billRow).join('')}</div>` : '<div class="note">Aucun paiement ce jour-là.</div>');
    }
    return h;
  }

  App.views.subs = function (m) {
    const today = todayStr(), ym = ui.viewMonth, sm = E.subsSummary(st(), today), subs = st().subs;
    const groups = [['active', 'Actifs'], ['paused', 'Suspendus'], ['cancelled', 'Résiliés']];
    let h = `<div class="grid2" style="margin-top:12px"><div class="card kpi"><div class="k">Coût mensuel moyen</div><div class="v">${mcur(sm.monthly, { auto: true })}</div><div class="d" style="color:var(--muted)">à titre informatif</div></div>
      <div class="card kpi"><div class="k">Coût annuel estimé</div><div class="v">${mcur(sm.annual, { auto: true })}</div><div class="d" style="color:var(--muted)">${sm.count} actif${sm.count > 1 ? 's' : ''}</div></div>
      <div class="card kpi"><div class="k">Prochaine échéance</div><div class="v" style="font-size:17px">${sm.next ? esc(sm.next.sub.name) : '—'}</div><div class="d" style="color:var(--muted)">${sm.next ? E.fmtDate(sm.next.due) + ' · ' + E.formatMoney(sm.next.amount) + (sm.next.estimated ? ' (estimée)' : '') : 'Aucune'}</div></div>
      <div class="card kpi"><div class="k">Prévu ce mois</div><div class="v">${mcur(m.subsActual, { auto: true })}</div><div class="d" style="color:var(--muted)">${m.subsSmoothed ? 'compté (lissé) : ' + E.formatMoney(m.subsTotal, { auto: true }) : 'compté dans le budget'}</div></div></div>`;
    if (m.subsOverdue.length) h += `<div class="alert bad"><span>⚠️</span><span><b>${m.subsOverdue.length} abonnement${m.subsOverdue.length > 1 ? 's' : ''} sans paiement enregistré</b> après l’échéance. Marque-les payés ou importe ton relevé.</span></div>`;
    h += `<div class="card"><h2>Calendrier des paiements</h2>${calendar(ym, m)}</div>`;
    h += `<div class="card"><h2>Échéances de ${E.monthLabel(ym)}</h2>${m.subsOcc.length ? `<div class="list">${m.subsOcc.map(occRow).join('')}</div>` : empty('Aucune échéance ce mois-ci')}
      <div class="note">Un abonnement annuel est compté en entier dans le mois de son prélèvement${m.subsSmoothed ? ' — sauf lissage activé : une provision mensuelle le remplace' : ''}. Les dates marquées « estimée » sont calculées, pas confirmées.</div></div>`;
    if (!subs.length) return h + `<div class="card">${empty('Aucun abonnement', 'Spotify, Netflix, iCloud, téléphone…')}<button class="btn" data-act="addSub">Ajouter un abonnement</button></div>`;
    for (const [k, lbl] of groups) {
      const l = subs.filter(s => s.status === k); if (!l.length) continue;
      h += `<div class="group-h"><span>${lbl}</span><span>${l.length}</span></div><div class="card" style="margin-top:4px;padding:6px 16px"><div class="list">${l.map(s => subRow(s, today)).join('')}</div></div>`;
    }
    h += `<div class="actions" style="margin-top:14px"><button class="btn sec" data-act="subsIcs">${ic('cal')} Exporter vers Calendrier (rappels inclus)</button><button class="btn sec" data-act="subsNotif">Activer les notifications d’échéance</button></div>
      <div class="note" style="text-align:center">Sur iPhone, une app web ne peut pas envoyer de notification quand elle est fermée : les rappels fiables passent par l’export Calendrier ; l’app te prévient aussi à l’ouverture.</div>`;
    return h;
  };

  // Bandeau de rappels (7 / 3 / 1 jours) pour l'accueil.
  App.remindersHtml = function () {
    const r = E.upcomingReminders(st(), todayStr());
    if (!r.length) return '';
    return `<div class="alert warn" style="margin:10px 0"><span>🔔</span><span>${r.map(x => `<b>${esc(x.sub.name)}</b> ${x.daysLeft === 1 ? 'demain' : 'dans ' + x.daysLeft + ' jours'} (${E.formatMoney(x.amount)} ${esc(cur())})`).join(' · ')}</span></div>`;
  };
  App.notifyReminders = async function () {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const seen = JSON.parse(localStorage.getItem('bp:notified') || '{}'), today = todayStr();
      for (const r of E.upcomingReminders(st(), today)) {
        const k = r.sub.id + r.due + r.daysLeft; if (seen[k]) continue; seen[k] = today;
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        const opts = { body: `${E.formatMoney(r.amount)} ${cur()} · ${E.fmtDate(r.due)}`, tag: k };
        if (reg) reg.showNotification(`${r.sub.name} : échéance ${r.daysLeft === 1 ? 'demain' : 'dans ' + r.daysLeft + ' jours'}`, opts); else new Notification(r.sub.name, opts);
      }
      localStorage.setItem('bp:notified', JSON.stringify(seen));
    } catch { /* notifications indisponibles */ }
  };

  // ----- Formulaires -----
  function subSheet(id) {
    const s = id ? st().subs.find(x => x.id === id) : null, today = todayStr();
    f = { id, cat: s ? s.category : 'Streaming', method: s ? s.method : '', rem: s ? (s.reminders || []).slice() : [], freq: 'monthly' };
    openSheet(`<h3>${s ? 'Modifier l’abonnement' : 'Nouvel abonnement'}</h3>
      <div class="field"><label>Nom du service</label><input class="in" id="f-name" maxlength="60" value="${esc(s ? s.name : '')}" placeholder="Ex. Spotify" autofocus></div>
      ${s ? '' : `<div class="field"><label>Montant (${esc(cur())})</label><input class="in num" id="f-amt" inputmode="decimal" placeholder="0.00"></div>
      <div class="field"><label>Fréquence de facturation</label><select class="in" id="f-freq">${Object.entries(E.SUB_FREQ).map(([k, v]) => `<option value="${k}" ${k === 'monthly' ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label>Date de début</label><input class="in" type="date" id="f-start" value="${today}"></div>
      <div class="field"><label>Dernier paiement (facultatif)</label><input class="in" type="date" id="f-last"></div>
      <div class="field"><label>Prochaine échéance (facultatif — sinon calculée)</label><input class="in" type="date" id="f-next"></div>`}
      <div class="field"><label>Catégorie</label><div class="chips" id="sc-chips">${SUB_CATS.map(([c, e]) => `<button type="button" class="chip ${c === f.cat ? 'on' : ''}" data-act="subCat" data-id="${c}">${e} ${c}</button>`).join('')}</div></div>
      <div class="field"><label>Moyen de paiement (facultatif)</label><div class="chips" id="sm-chips">${chips(App.METHODS.map(x => ({ id: x, name: x })), f.method, 'subMethod')}</div></div>
      <div class="field"><label>Rappels avant l’échéance (facultatif)</label><div class="chips" id="sr-chips">${REM.map(d => `<button type="button" class="chip ${f.rem.includes(d) ? 'on' : ''}" data-act="subRem" data-id="${d}">${d} jour${d > 1 ? 's' : ''}</button>`).join('')}</div></div>
      ${s ? `<div class="field"><label>Statut</label><select class="in" id="f-status">${Object.entries(E.SUB_STATUS).map(([k, l]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Date de résiliation (si résilié)</label><input class="in" type="date" id="f-cancel" value="${s.cancelDate || ''}"></div>` : ''}
      <div class="field"><label>Notes (facultatif)</label><input class="in" id="f-notes" maxlength="200" value="${esc(s ? s.notes : '')}"></div>
      <div class="err"></div><div class="actions"><button class="btn" data-act="saveSub">Enregistrer</button></div>
      ${s ? '<div class="note">Pour changer le prix ou la fréquence sans toucher à l’historique : menu de l’abonnement → « Changer le prix ».</div>' : ''}`);
  }
  async function saveSub() {
    const name = val('f-name'); if (!name) return setErr('Donne un nom au service.');
    const s = f.id ? st().subs.find(x => x.id === f.id) : null, today = todayStr();
    if (s) {
      const status = val('f-status') || s.status, cancel = val('f-cancel');
      if (cancel && !E.isValidDate(cancel)) return setErr('Date de résiliation invalide.');
      const ok = await commit(() => {
        Object.assign(s, { name, category: f.cat, method: f.method, notes: val('f-notes'), reminders: f.rem.slice() });
        E.setSubStatus(s, status, today);
        if (status === 'cancelled' && cancel) s.cancelDate = cancel;
      });
      if (ok) { closeSheet(); toast('Abonnement modifié'); } return;
    }
    const cents = E.parseMoney(val('f-amt')); if (cents == null || cents <= 0) return setErr('Montant invalide.');
    const start = val('f-start'), last = val('f-last'), next = val('f-next'), freq = val('f-freq');
    for (const d of [start, last, next]) if (d && !E.isValidDate(d)) return setErr('Date invalide.');
    if (!start) return setErr('Indique la date de début.');
    if (last && last < start) return setErr('Le dernier paiement ne peut pas précéder le début.');
    if (next && last && next <= last) return setErr('La prochaine échéance doit suivre le dernier paiement.');
    let created = null;
    const ok = await commit(() => {
      created = E.addSub(st(), { name, amount: cents, freq, startDate: start, lastPaid: last || null, nextDue: next || null, category: f.cat, method: f.method, notes: val('f-notes'), reminders: f.rem.slice(),
        provisionFrom: next && freq !== 'monthly' && freq !== 'weekly' ? curYm() : null });
    });
    if (!ok) return;
    closeSheet();
    const dup = st().bills.find(b => b.type === 'recurring' && b.stopFrom == null && (b.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(b.name.toLowerCase())));
    const nd = E.nextDue(created, today);
    toast(dup ? `⚠️ Une facture « ${dup.name} » existe déjà : vérifie qu’elle n’est pas comptée deux fois.` : `Abonnement ajouté${nd ? ' · prochaine échéance ' + E.fmtDate(nd.due) + (nd.estimated ? ' (estimée)' : '') : ''}`);
  }

  function priceSheet(id) {
    const s = st().subs.find(x => x.id === id), today = todayStr(), nd = E.nextDue(s, today), v = E.subVersionAt(s, nd ? nd.due : today) || s.versions[0];
    f = { id };
    openSheet(`<h3>Changer le prix · ${esc(s.name)}</h3>
      <div class="field"><label>Nouveau montant (${esc(cur())})</label><input class="in num" id="f-amt" inputmode="decimal" value="${E.formatMoney(v.amount).replace(/’/g, '')}" autofocus></div>
      <div class="field"><label>Fréquence</label><select class="in" id="f-freq">${Object.entries(E.SUB_FREQ).map(([k, x]) => `<option value="${k}" ${k === (v.freq || 'monthly') ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
      <div class="field"><label>À partir de l’échéance du</label><input class="in" type="date" id="f-from" value="${nd ? nd.due : today}"></div>
      <div class="note">Les paiements passés et les mois archivés ne changent pas.</div><div class="err"></div><div class="actions"><button class="btn" data-act="savePrice">Enregistrer</button></div>`);
  }

  Object.assign(A, {
    addSub() { subSheet(null); }, editSub(el) { subSheet(el.dataset.id); }, saveSub,
    subCat(el) { f.cat = el.dataset.id; document.querySelectorAll('#sc-chips .chip').forEach(b => b.classList.toggle('on', b === el)); },
    subMethod(el) { f.method = f.method === el.dataset.id ? '' : el.dataset.id; document.getElementById('sm-chips').innerHTML = chips(App.METHODS.map(x => ({ id: x, name: x })), f.method, 'subMethod'); },
    subRem(el) { const d = +el.dataset.id; f.rem = f.rem.includes(d) ? f.rem.filter(x => x !== d) : [...f.rem, d].sort((a, b) => b - a); el.classList.toggle('on'); },
    calDay(el) { ui.calDay = ui.calDay === el.dataset.d ? null : el.dataset.d; App.render(); },
    subMenu(el) {
      const s = st().subs.find(x => x.id === el.dataset.id); if (!s) return;
      const today = todayStr(), ym = ui.viewMonth, occ = E.subOccurrences(st(), ym, today).find(o => o.id === s.id), nd = E.nextDue(s, today), lp = E.lastPaidOf(s), v = E.subVersionAt(s, today) || s.versions[0];
      const target = occ || (nd && { dueDate: nd.due, status: 'pending', amount: nd.amount });
      openSheet(`<h3>${esc(s.name)}</h3><div class="card" style="margin-top:0"><div class="kpi"><div class="v">${mcur(v.amount)} <small style="font-size:14px;color:var(--muted)">/ ${E.SUB_FREQ[v.freq || 'monthly'].label.toLowerCase()}</small></div>
        <div class="k">${E.SUB_STATUS[s.status]} · début ${E.fmtDate(s.startDate)}${lp ? ' · dernier paiement ' + E.fmtDate(lp.paidDate) : ''}</div>
        <div class="k">${nd ? 'Prochaine échéance ' + E.fmtDate(nd.due) + (nd.estimated ? ' — estimée (calculée, non confirmée)' : '') : 'Pas d’échéance à venir'}</div>
        ${v.freq !== 'monthly' ? `<div class="k">Coût mensuel moyen : ${E.formatMoney(E.monthlyEquivalent(v.amount, v.freq))} ${esc(cur())}</div>` : ''}${s.notes ? `<div class="k">${esc(s.notes)}</div>` : ''}</div></div>
        <div class="menu">${target ? `<button data-act="subPaid" data-id="${s.id}" data-due="${target.dueDate}">${target.status === 'paid' ? 'Marquer comme non payé' : '✓ Marquer payé (échéance ' + E.fmtDate(target.dueDate) + ')'}</button>` : ''}
        <button data-act="editSub" data-id="${s.id}">Modifier</button><button data-act="priceSub" data-id="${s.id}">Changer le prix ou la fréquence</button>
        ${s.status === 'active' ? `<button data-act="subStatus" data-id="${s.id}" data-v="paused">Suspendre</button>` : `<button data-act="subStatus" data-id="${s.id}" data-v="active">Reprendre</button>`}
        ${s.status !== 'cancelled' ? `<button data-act="subStatus" data-id="${s.id}" data-v="cancelled">Résilier</button>` : ''}<button class="red" data-act="delSub" data-id="${s.id}">Supprimer</button></div>`);
    },
    subPaid(el) {
      const s = st().subs.find(x => x.id === el.dataset.id), due = el.dataset.due, paid = s.paid && s.paid[due];
      closeSheet(); commit(() => E.setSubPaid(s, due, paid ? null : todayStr()), { msg: paid ? 'Paiement annulé' : 'Abonnement marqué payé — budget inchangé' });
    },
    priceSub(el) { priceSheet(el.dataset.id); },
    async savePrice() {
      const s = st().subs.find(x => x.id === f.id), cents = E.parseMoney(val('f-amt')), from = val('f-from');
      if (cents == null || cents <= 0) return setErr('Montant invalide.'); if (!E.isValidDate(from)) return setErr('Date invalide.');
      if (await commit(() => E.changeSubPrice(s, from, cents, val('f-freq')))) { closeSheet(); toast('Prix mis à jour à partir du ' + E.fmtDate(from)); }
    },
    subStatus(el) {
      const s = st().subs.find(x => x.id === el.dataset.id), v = el.dataset.v; closeSheet();
      commit(() => E.setSubStatus(s, v, todayStr()), { msg: v === 'cancelled' ? 'Abonnement résilié : plus d’échéance, historique conservé' : v === 'paused' ? 'Abonnement suspendu' : 'Abonnement repris', undo: true });
    },
    delSub(el) {
      const s = st().subs.find(x => x.id === el.dataset.id); closeSheet();
      confirmSheet('Supprimer cet abonnement ?', `« ${esc(s.name)} » disparaît aussi des mois passés. Pour garder l’historique, utilise plutôt « Résilier ».`, [
        { label: 'Supprimer définitivement', cls: 'danger', fn: () => commit(() => E.removeItem(st(), 'subs', s.id), { msg: 'Abonnement supprimé', undo: true }) }]);
    },
    subsIcs() {
      const ics = E.subsToIcs(st(), todayStr(), 12), blob = new Blob([ics], { type: 'text/calendar' }), file = new File([blob], 'abonnements.ics', { type: 'text/calendar' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'Abonnements' }).catch(() => {});
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'abonnements.ics'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    },
    async subsNotif() {
      if (!('Notification' in window)) return toast('Notifications indisponibles ici : installe l’app sur l’écran d’accueil (iOS 16.4+).');
      const r = await Notification.requestPermission();
      toast(r === 'granted' ? 'Notifications activées : rappels affichés à l’ouverture de l’app' : 'Notifications refusées'); if (r === 'granted') App.notifyReminders();
    },
  });
})();
