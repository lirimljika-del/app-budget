/* Module Importation de relevés bancaires : sélection du PDF, lecture locale, prévisualisation, validation, rapport, historique. */
(function () {
  'use strict';
  const App = window.App, E = App.E, A = App.A, ui = App.ui, I = window.Importer, X = window.PdfExtract, Store = App.Store;
  const { esc, ic, money, mcur, bar, barCls, empty, backBtn, catOf, openSheet, closeSheet, confirmSheet, val, setErr, commit, persist, toast, todayStr, cur, render, go } = App;
  const st = () => App.state;
  const BASE = 'vendor/pdfjs/', OCR_BASE = 'vendor/tesseract/';
  const KIND = { expense: 'Dépense', income: 'Revenu', bill: 'Facture payée (nouvelle)', billPayment: 'Paiement de facture prévue', subPayment: 'Paiement d’abonnement', transfer: 'Virement interne · non compté',
    cardPayment: 'Règlement carte de crédit', cash: 'Retrait d’espèces', refund: 'Remboursement', merge: 'Fusion avec ta dépense' };
  const FLAG = { ocr: ['warn', 'OCR : à vérifier'], 'sign-unknown': ['bad', 'Sens incertain'], 'balance-mismatch': ['bad', 'Solde incohérent'], 'foreign-currency': ['warn', 'Devise ≠ CHF'], ambiguous: ['warn', 'Plusieurs correspondances'],
    'maybe-transfer': ['warn', 'Virement interne ?'], 'year-inferred': ['info', 'Année déduite'], 'price-change': ['warn', 'Prix différent'], recurring: ['info', 'Paiement récurrent'], card: ['info', 'Carte de crédit'], 'sub-hint': ['info', 'Service d’abonnement'], 'sign-fixed': ['info', 'Sens corrigé par le solde'] };
  const imp = { preview: null, report: null, busy: false, fileName: '', hash: null, pdfBytes: null, filter: 'check', openSure: false };
  let pwResolve = null;

  // ----- Étape 1 : choisir le fichier -----
  A.importOpen = function () {
    imp.filter = 'check';
    openSheet(`<h3>Importer un relevé bancaire</h3>
      <div class="alert info" style="margin:0 0 12px"><span>🔒</span><span>Le PDF est lu <b>sur cet iPhone</b>. Rien n’est envoyé à un serveur ni à une IA. Aucune connexion à ta banque, aucun identifiant demandé.</span></div>
      <div class="drop">Télécharge le relevé mensuel (PDF) depuis ta banque, puis choisis-le ici.<br><small>Les lignes ne seront enregistrées qu’après ta validation.</small></div>
      <div class="actions"><button class="btn" data-act="importPickFile">${ic('doc')} Choisir un PDF</button><button class="btn sec" data-act="importPaste">Coller le texte du relevé</button></div>
      <input type="file" id="imp-file" accept="application/pdf,.pdf,text/plain,.txt" class="hidden">
      <div class="note">Formats : PDF texte et PDF scannés (OCR local, plus lent). Le résultat dépend de la mise en page de ta banque : chaque ligne douteuse est signalée.</div>`);
  };
  A.importPickFile = () => document.getElementById('imp-file').click();
  A.importPaste = function () {
    openSheet(`<h3>Coller le texte du relevé</h3><p class="note" style="margin:-6px 2px 10px">Ouvre le PDF, sélectionne le texte du tableau des opérations, copie-le puis colle-le ici. Les colonnes doivent rester séparées par des espaces.</p>
      <textarea class="in" id="imp-text" placeholder="05.10.2026   Paiement Coop   45.30 …"></textarea><div class="err"></div><div class="actions"><button class="btn" data-act="importRunText">Analyser</button></div>`);
  };
  A.importRunText = function () {
    const t = val('imp-text'); if (t.length < 20) return setErr('Colle le texte du relevé.');
    runPipeline(async () => ({ lines: I.textToLines(t), ocr: false }), 'texte collé');
  };
  document.addEventListener('change', e => {
    if (e.target.id !== 'imp-file' || !e.target.files[0]) return;
    const file = e.target.files[0]; e.target.value = '';
    if (/\.txt$|text\/plain/i.test(file.name + file.type)) return file.text().then(t => runPipeline(async () => ({ lines: I.textToLines(t), ocr: false }), file.name));
    runPipeline(async setProgress => {
      const bytes = new Uint8Array(await file.arrayBuffer()); imp.pdfBytes = bytes;
      const pdfjs = await X.loadPdfjs(BASE);
      return X.extractPdf(bytes, { pdfjs, onProgress: setProgress, onPassword: askPassword, ocr: X.makeBrowserOcr(OCR_BASE) });
    }, file.name);
  });

  function askPassword(wrong) {
    return new Promise(res => {
      pwResolve = res;
      openSheet(`<h3>PDF protégé</h3><p class="note" style="margin:-6px 2px 10px">${wrong ? '<b class="neg">Mot de passe incorrect.</b> ' : ''}Saisis le mot de passe du document. Il sert uniquement à l’ouvrir : il n’est ni enregistré ni envoyé.</p>
        <div class="field"><input class="in" id="imp-pw" type="password" autocomplete="off" autocapitalize="off" autofocus></div>
        <div class="actions"><button class="btn" data-act="pwOk">Ouvrir</button><button class="btn sec" data-act="pwCancel">Annuler</button></div>`);
    });
  }
  A.pwOk = () => { const v = document.getElementById('imp-pw').value; const r = pwResolve; pwResolve = null; document.getElementById('imp-pw').value = ''; if (r) { progressSheet('Ouverture du PDF…'); r(v); } };
  A.pwCancel = () => { const r = pwResolve; pwResolve = null; closeSheet(); if (r) r(null); };

  function progressSheet(msg) {
    if (!document.getElementById('imp-prog')) openSheet(`<h3>Analyse du relevé</h3><div class="progress-ring"></div><div id="imp-prog" style="text-align:center;color:var(--muted)"></div><div class="note" style="text-align:center">Tout reste sur ton iPhone.</div>`);
    document.getElementById('imp-prog').textContent = msg;
  }
  async function runPipeline(extract, name) {
    if (imp.busy) return; imp.busy = true; imp.fileName = name;
    progressSheet('Préparation…');
    try {
      const r = await extract(progressSheet);
      progressSheet('Analyse des transactions…');
      const parsed = I.parseStatement(r.lines, { ocr: r.ocr, defaultYear: Number(todayStr().slice(0, 4)) });
      if (!parsed.txs.length) throw new X.PdfError('empty', 'Aucune transaction reconnue. ' + (parsed.warnings[0] || '') + ' Si ta banque propose un autre format de relevé (ex. « détail des écritures »), essaie-le, ou envoie-moi un exemple expurgé pour adapter la lecture.');
      imp.lines = r.lines;
      imp.hash = I.hashText(r.lines.map(l => l.cells.map(c => c.text).join(' ')).join('\n'));
      imp.preview = I.buildPreview(st(), parsed, { today: todayStr() });
      imp.preview.rows.forEach(x => { x.reviewed = false; });
      imp.sameFile = st().imports.find(i => i.hash === imp.hash) || null;
      closeSheet(); ui.page = 'importPreview'; ui.animate = true; render();
    } catch (e) {
      closeSheet();
      const msg = e && e.message || String(e);
      openSheet(`<h3>Import impossible</h3><div class="alert bad" style="margin:0 0 12px"><span>⚠️</span><span>${esc(msg)}</span></div>${e && e.code === 'scan' ? '<p class="note">Ce PDF est une image : l’OCR n’a pas pu démarrer.</p>' : ''}<div class="actions"><button class="btn" data-act="importOpen">Réessayer</button><button class="btn sec" data-act="closeSheet">Fermer</button></div>`);
    } finally { imp.busy = false; }
  }

  // ----- Étape 2 : prévisualisation -----
  const sgn = r => (r.amount < 0 ? '−' : '+') + money(r.abs);
  const rowTags = r => [...new Set(r.flags)].filter(f => FLAG[f]).map(f => `<span class="tag ${FLAG[f][0]}">${FLAG[f][1]}</span>`).join('') + (r.dupOf ? '<span class="tag bad">Doublon</span>' : '');
  function rowHtml(r) {
    const cat = ['expense', 'cash', 'cardPayment', 'refund', 'merge'].includes(r.kind) ? catOf(r.category) : null;
    return `<button class="imp-row ${r.include ? '' : 'off'}" data-act="impEdit" data-id="${r.id}"><span class="ico" style="background:${cat ? cat.color + '26' : 'var(--track)'}">${cat ? cat.icon : r.kind === 'income' ? '💰' : r.kind === 'transfer' ? '↔️' : r.kind.includes('Payment') || r.kind === 'bill' ? '🧾' : '•'}</span>
      <span class="m"><div class="t">${esc(r.merchant)}</div><div class="s">${E.fmtDate(r.date)} · ${KIND[r.kind]}${cat ? ' · ' + esc(cat.name) : ''}${r.kind === 'bill' ? ' · ' + esc(r.billCategory) : ''}</div>
      <div>${r.reviewed && r.include ? '<span class="tag good">Validé</span>' : ''}${!r.include ? '<span class="tag">Exclu</span>' : ''}${rowTags(r)}</div></span>
      <span class="a ${r.amount > 0 ? 'pos' : ''}">${sgn(r)}</span></button>`;
  }
  App.pages.importPreview = function () {
    const pv = imp.preview; if (!pv) { ui.page = null; return ''; }
    const sm = I.summarize(pv.rows), needRows = pv.rows.filter(r => r.include && !r.reviewed), unc = pv.rows.filter(r => r.uncertain && !r.dupOf), sure = pv.rows.filter(r => !r.uncertain && !r.dupOf);
    const pendingUnc = unc.filter(r => !r.reviewed || !r.include).length;
    let h = `<button class="back" data-act="impCancel">${ic('chevL')}Annuler l’import</button><div class="page-title">Vérification</div>
      <div class="note" style="margin:-8px 2px 10px">${esc(pv.bank)}${pv.account ? ' · ' + esc(pv.account) : ''}${pv.period ? ' · ' + E.fmtDate(pv.period.from) + ' → ' + E.fmtDate(pv.period.to) + (pv.period.inferred ? ' (déduite)' : '') : ''} · ${esc(imp.fileName)}</div>`;
    h += `<div style="margin:-2px 2px 8px"><button class="link" data-act="impShowText">Voir le texte lu dans le PDF (diagnostic)</button></div>`;
    if (imp.sameFile) h += `<div class="alert warn"><span>⚠️</span><span>Ce relevé a déjà été importé le ${E.fmtDate(imp.sameFile.at.slice(0, 10))}. Les transactions déjà enregistrées seront ignorées.</span></div>`;
    if (pv.ocr) h += `<div class="alert warn"><span>👁️</span><span><b>PDF scanné (OCR).</b> La lecture peut contenir des erreurs de chiffres : vérifie chaque ligne avant de valider.</span></div>`;
    for (const w of pv.warnings) h += `<div class="alert warn"><span>⚠️</span><span>${esc(w)}</span></div>`;
    h += `<div class="card" style="margin-top:12px"><div class="grid2" style="gap:14px"><div class="kpi"><div class="k">Transactions détectées</div><div class="v">${sm.total}</div></div><div class="kpi"><div class="k">À vérifier</div><div class="v ${sm.uncertain ? 'neg' : ''}">${sm.uncertain}</div></div>
      <div class="kpi"><div class="k">Total des débits</div><div class="v">−${mcur(sm.debits, { auto: true })}</div></div><div class="kpi"><div class="k">Total des crédits</div><div class="v pos">+${mcur(sm.credits, { auto: true })}</div></div></div>
      <div class="note">${sm.duplicates ? sm.duplicates + ' doublon(s) ignoré(s) · ' : ''}${sm.merges ? sm.merges + ' fusion(s) avec tes dépenses · ' : ''}${sm.transfers ? sm.transfers + ' virement(s) interne(s) non compté(s) · ' : ''}Rien n’est enregistré avant ta confirmation.</div></div>`;
    // répartition proposée
    const byCat = {}; for (const r of pv.rows) if (r.include && ['expense', 'cash'].includes(r.kind)) byCat[r.category] = (byCat[r.category] || 0) + r.abs;
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (cats.length) h += `<div class="card"><h2>Catégories proposées</h2>${cats.slice(0, 6).map(([c, v]) => { const k = catOf(c); return `<div class="cat-row"><div class="l"><span>${k.icon} ${esc(k.name)}</span><span class="num">${money(v)}</span></div></div>`; }).join('')}</div>`;
    // abonnements détectés
    for (const d of pv.recurring) {
      h += `<div class="card"><h2>Abonnement détecté</h2><div style="font-weight:600;font-size:17px">${esc(d.name)} · ${mcur(d.amount)} / ${E.SUB_FREQ[d.freq].label.toLowerCase()}</div>
        <div class="note">${d.count} paiements similaires (${d.occurrences.map(o => E.fmtDate(o.date).slice(0, 5)).join(', ')}) · ${d.confidence === 'probable' ? 'probable' : 'possible, à confirmer'} · prochaine échéance estimée ${E.fmtDate(d.nextDue)}.<br>Souhaites-tu l’ajouter à tes abonnements récurrents ?</div>
        <div style="display:flex;gap:8px;margin-top:10px">${d.accept ? '<span class="pill good">Sera ajouté après l’import</span> <button class="link" data-act="detUndo" data-mk="' + esc(d.mk) + '">Annuler</button>' : d.ignore ? '<span class="pill">Ignoré</span> <button class="link" data-act="detUndo" data-mk="' + esc(d.mk) + '">Annuler</button>' : `<button class="btn sm" data-act="detAccept" data-mk="${esc(d.mk)}">Ajouter aux abonnements</button><button class="btn sec sm" data-act="detIgnore" data-mk="${esc(d.mk)}">Pas un abonnement</button>`}</div></div>`;
    }
    // lignes à vérifier
    h += `<div class="group-h"><span>À vérifier (${unc.length})</span>${pendingUnc ? `<span class="neg">${pendingUnc} à traiter</span>` : '<span class="pos">tout traité</span>'}</div>`;
    h += unc.length ? `<div class="card" style="margin-top:4px;padding:4px 16px">${unc.map(rowHtml).join('')}</div>` : '<div class="note" style="margin:6px 4px">Aucune ligne douteuse.</div>';
    const unr = sure.filter(r => !r.reviewed).length;
    h += `<div class="group-h"><span>Lignes sûres (${sure.length})</span><button class="link" data-act="impToggleSure">${imp.openSure ? 'Masquer' : 'Afficher'}</button></div>`;
    h += `<div class="card" style="margin-top:4px">${unr ? `<button class="btn sm" style="width:100%;margin:0 0 4px" data-act="impValidateSure">✓ Valider ces ${unr} ligne${unr > 1 ? 's' : ''} sûre${unr > 1 ? 's' : ''}</button>` : '<span class="pill good">Toutes validées</span>'}
      ${imp.openSure ? `<div style="margin-top:6px">${sure.map(rowHtml).join('')}</div>` : ''}</div>`;
    const dups = pv.rows.filter(r => r.dupOf);
    if (dups.length) h += `<div class="group-h"><span>Doublons ignorés (${dups.length})</span></div><div class="card" style="margin-top:4px;padding:4px 16px">${dups.map(rowHtml).join('')}</div>`;
    const ready = needRows.length === 0 && pv.rows.some(r => r.include);
    h += `<div class="stepbar"><button class="btn" data-act="impApply" ${ready ? '' : 'disabled'}>${ready ? `Importer ${pv.rows.filter(r => r.include).length} ligne${pv.rows.filter(r => r.include).length > 1 ? 's' : ''}` : `Valide les lignes restantes (${needRows.length})`}</button></div>`;
    return h;
  };
  App.pageTab.importPreview = 'expenses';

  A.impShowText = function () {
    const txt = (imp.lines || []).map(l => l.cells.map(c => c.text).join('  |  ')).join('\n');
    openSheet(`<h3>Texte lu dans le PDF</h3><p class="note" style="margin:-6px 2px 10px">Utile si une ligne est mal comprise (revenu/dépense, description, catégorie). Masque les noms et numéros avant de partager.</p>
      <textarea class="in" id="imp-raw" readonly style="min-height:260px">${esc(txt)}</textarea><div class="actions"><button class="btn" data-act="impCopyText">Copier le texte</button></div>`);
  };
  A.impCopyText = async function () { const el = document.getElementById('imp-raw'); try { await navigator.clipboard.writeText(el.value); toast('Texte copié'); } catch { el.select(); toast('Sélectionne et copie le texte'); } };
  A.impToggleSure = () => { imp.openSure = !imp.openSure; render(); };
  A.impValidateSure = () => { imp.preview.rows.forEach(r => { if (!r.uncertain && !r.dupOf) r.reviewed = true; }); render(); };
  A.impCancel = () => confirmSheet('Annuler l’import ?', 'Rien n’a été enregistré. Le PDF est oublié.', [{ label: 'Abandonner l’import', cls: 'danger', fn: () => { imp.preview = null; imp.pdfBytes = null; ui.page = null; go('expenses'); } }]);
  A.detAccept = el => { const d = imp.preview.recurring.find(x => x.mk === el.dataset.mk); d.accept = true; d.ignore = false; render(); };
  A.detIgnore = el => { const d = imp.preview.recurring.find(x => x.mk === el.dataset.mk); d.ignore = true; d.accept = false; render(); };
  A.detUndo = el => { const d = imp.preview.recurring.find(x => x.mk === el.dataset.mk); d.ignore = d.accept = false; render(); };

  // ----- Édition d'une ligne -----
  let rf = null;
  A.impEdit = function (el) {
    const r = imp.preview.rows.find(x => x.id === el.dataset.id); rf = r;
    const cands = r.candidates || [];
    const kinds = r.direction === 'debit' ? ['expense', 'bill', 'cash', 'transfer'] : ['income', 'refund', 'transfer'];
    const linkVal = r.link ? `${r.link.type}:${r.link.id}${r.link.due ? ':' + r.link.due : ''}` : '';
    openSheet(`<h3>${esc(r.merchant)}</h3>
      <div class="card" style="margin-top:0"><div class="note" style="margin:0">Libellé d’origine</div><div style="font-size:13.5px;word-break:break-word">${esc(r.label)}</div>
        <div class="note">${E.fmtDate(r.dateTx)}${r.dateBooked ? ' · comptabilisé le ' + E.fmtDate(r.dateBooked) : ''}${r.ref ? ' · réf. ' + esc(r.ref) : ''}</div>
        <div>${rowTags(r)}</div>${r.reasons.map(t => `<div class="note" style="margin:4px 0 0">• ${esc(t)}</div>`).join('')}</div>
      <div class="switch"><span>Inclure cette ligne</span><input type="checkbox" id="e-inc" ${r.include ? 'checked' : ''}></div>
      <div class="field"><label>Montant (${esc(r.currency)}) — corrige-le si besoin</label><input class="in num" id="e-amt" inputmode="decimal" value="${E.formatMoney(r.abs).replace(/’/g, '')}"></div>
      <div class="field"><label>Date</label><input class="in" type="date" id="e-date" value="${r.date}"></div>
      <div class="field"><label>Nom du commerçant / bénéficiaire</label><input class="in" id="e-name" maxlength="60" value="${esc(r.merchant)}"></div>
      <div class="field"><label>Type d’opération</label><select class="in" id="e-kind">${[...new Set([r.kind, ...kinds])].filter(k => !['billPayment', 'subPayment', 'merge', 'cardPayment'].includes(k)).map(k => `<option value="${k}" ${k === r.kind ? 'selected' : ''}>${KIND[k]}</option>`).join('')}${['billPayment', 'subPayment', 'merge', 'cardPayment'].includes(r.kind) ? `<option value="${r.kind}" selected>${KIND[r.kind]}</option>` : ''}${r.kind === 'cardPayment' ? '<option value="expense">Compter comme dépense</option><option value="ignoreCard">Ne pas compter (achats déjà saisis)</option>' : ''}</select></div>
      ${cands.length ? `<div class="field"><label>Rapprocher avec</label><select class="in" id="e-link"><option value="">Aucun — traiter comme ${r.direction === 'debit' ? 'dépense' : 'revenu'}</option>${cands.map(c => { const v = `${c.type}:${c.id}${c.due ? ':' + c.due : ''}`; return `<option value="${esc(v)}" ${v === linkVal ? 'selected' : ''}>${c.type === 'expense' ? 'Ma dépense du ' + E.fmtDate(c.date) : c.type === 'refund' ? 'Remboursement de la dépense du ' + E.fmtDate(c.date) : (c.type === 'sub' ? 'Abonnement ' : 'Facture ') + esc(c.name) + ' du ' + E.fmtDate(c.due)} · ${E.formatMoney(c.amount)}</option>`; }).join('')}</select></div>` : ''}
      <div class="field" id="e-catwrap"><label>Catégorie</label><div class="chips" id="e-cats">${App.chips(st().categories, r.category, 'impCat')}</div></div>
      <div class="field" id="e-bcwrap" ${r.kind === 'bill' ? '' : 'class="hidden" style="display:none"'}><label>Catégorie de facture</label><select class="in" id="e-bc">${E.BILL_CATEGORIES.map(c => `<option ${c === r.billCategory ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      ${r.flags.includes('price-change') ? `<div class="switch"><span>Mettre à jour le prix de l’abonnement<br><small style="color:var(--muted)">à partir de cette échéance</small></span><input type="checkbox" id="e-price" ${r.acceptPriceChange ? 'checked' : ''}></div>` : ''}
      <div class="err"></div><div class="actions"><button class="btn" data-act="impSaveRow">Valider cette ligne</button><button class="btn danger" data-act="impExcludeRow">Exclure cette ligne</button></div>
      <div class="note">La catégorie choisie est mémorisée pour ce commerçant lors des prochains imports.</div>`);
  };
  A.impCat = el => { rf.category = el.dataset.id; document.getElementById('e-cats').innerHTML = App.chips(st().categories, rf.category, 'impCat'); };
  A.impSaveRow = function () {
    const r = rf, cents = E.parseMoney(val('e-amt')), date = val('e-date');
    if (cents == null || cents <= 0) return setErr('Montant invalide.'); if (!E.isValidDate(date)) return setErr('Date invalide.');
    r.abs = cents; r.amount = r.direction === 'debit' ? -cents : cents; r.date = date; r.merchant = val('e-name') || r.merchant; r.include = document.getElementById('e-inc').checked;
    let kind = val('e-kind'); const link = document.getElementById('e-link') ? val('e-link') : null;
    if (kind === 'ignoreCard') { r.kind = 'cardPayment'; r.link = { type: 'cardSettle' }; }
    else if (link) {
      const [type, id, due] = link.split(':'), c = r.candidates.find(x => x.id === id && (!due || x.due === due));
      r.kind = type === 'sub' ? 'subPayment' : type === 'bill' ? 'billPayment' : type === 'expense' ? 'merge' : 'refund'; r.link = { type, id, due, ym: c && c.ym, name: c && c.name, amount: c && c.amount };
    } else { r.kind = kind; if (r.link && r.link.type !== 'cardSettle' || ['billPayment', 'subPayment', 'merge'].includes(kind)) r.link = null; if (kind === 'billPayment' || kind === 'subPayment' || kind === 'merge') r.kind = r.direction === 'debit' ? 'expense' : 'income'; }
    if (r.kind === 'bill') r.billCategory = val('e-bc') || r.billCategory || 'Autre';
    const p = document.getElementById('e-price'); if (p) r.acceptPriceChange = p.checked;
    r.reviewed = true; closeSheet(); render();
  };
  A.impExcludeRow = () => { rf.include = false; rf.reviewed = true; closeSheet(); render(); };

  // ----- Étape 3 : application et rapport -----
  A.impApply = async function () {
    const pv = imp.preview; if (!pv) return;
    const before = JSON.parse(JSON.stringify(st())), today = todayStr();
    await Store.snapshot(before, 'avant-import');
    let res = null, added = 0;
    const ok = await commit(() => {
      res = I.applyPreview(st(), pv, { today, fileName: imp.fileName, hash: imp.hash, hasPdf: !!(st().settings.keepPdf && imp.pdfBytes) });
      for (const d of pv.recurring) {
        if (d.accept) { I.subFromDetection(st(), d, today); added++; }
        else if (d.ignore) st().rules[d.mk] = { ...(st().rules[d.mk] || {}), noSub: true };
      }
    });
    if (!ok) return;
    if (st().settings.keepPdf && imp.pdfBytes) { try { await Store.putPdf(res.record.id, imp.pdfBytes); } catch { toast('PDF original non conservé (stockage indisponible)'); } }
    imp.report = { res, added, detected: pv.recurring.length, pv, period: pv.period, bank: pv.bank, impact: I.importImpact(before, st(), res.months, today), importId: res.record.id };
    imp.preview = null; imp.pdfBytes = null; ui.page = 'importReport'; ui.animate = true; render();
  };
  App.pages.importReport = function () {
    const R = imp.report; if (!R) { ui.page = null; return ''; }
    const { res } = R, mt = R.res.months;
    const title = mt.length > 1 ? `Relevé de ${E.monthLabel(mt[0])} à ${E.monthLabel(mt[mt.length - 1])}` : `Relevé de ${mt[0] ? E.monthLabel(mt[0]).toLowerCase() : 'l’import'}`;
    const cats = Object.entries(res.byCategory).filter(([k, v]) => k !== '_bills' && v).sort((a, b) => b[1] - a[1]);
    let h = `<div class="page-title" style="margin-top:8px">${esc(title)}</div><div class="note" style="margin:-8px 2px 10px">${esc(R.bank)} · import terminé</div>
      <div class="card"><div class="grid2" style="gap:16px"><div class="kpi"><div class="k">Transactions importées</div><div class="v">${res.record.counts.imported}</div></div><div class="kpi"><div class="k">Doublons ignorés</div><div class="v">${res.duplicates}</div></div>
      <div class="kpi"><div class="k">Dépenses reconnues</div><div class="v">${mcur(res.expenseTotal, { auto: true })}</div></div><div class="kpi"><div class="k">Revenus reconnus</div><div class="v pos">${mcur(res.incomeTotal, { auto: true })}</div></div>
      <div class="kpi"><div class="k">Abonnements détectés</div><div class="v">${R.detected}</div><div class="d" style="color:var(--muted)">${R.added} ajouté${R.added > 1 ? 's' : ''}</div></div>
      <div class="kpi"><div class="k">Rapprochées</div><div class="v">${res.paid.bills + res.paid.subs + res.merged}</div><div class="d" style="color:var(--muted)">${res.paid.bills} fact. · ${res.paid.subs} abo. · ${res.merged} dép.</div></div></div>
      ${res.transfers ? `<div class="note">${res.transfers} virement(s) interne(s) / règlement(s) de carte non compté(s) comme dépense.</div>` : ''}${res.errors.length ? `<div class="alert warn"><span>⚠️</span><span>${res.errors.map(esc).join('<br>')}</span></div>` : ''}</div>`;
    if (cats.length) h += `<div class="card"><h2>Répartition par catégorie</h2>${cats.map(([c, v]) => { const k = catOf(c); return `<div class="cat-row"><div class="l"><span>${k.icon} ${esc(k.name)}</span><span class="num">${money(v)}</span></div>${bar(Math.round(v * 100 / Math.max(1, res.expenseTotal)))}</div>`; }).join('')}</div>`;
    h += `<div class="card"><h2>Impact sur le budget</h2>${R.impact.map(i => {
      const a = i.after, b = i.before, d = a.remaining - b.remaining;
      const warns = a.cats.filter(c => ['warn', 'alert', 'over'].includes(c.status));
      return `<div style="margin-bottom:14px"><div style="font-weight:600">${E.monthLabel(i.ym)}</div>
        <div><div class="rows" style="margin-top:6px"><div class="row"><span>Dépenses du mois</span><b>${money(b.spent)} → ${money(a.spent)}</b></div><div class="row"><span>Factures et abonnements restants</span><b>${money(b.billsUnpaid + b.subsUnpaid)} → ${money(a.billsUnpaid + a.subsUnpaid)}</b></div>
        <div class="row"><span>Budget restant</span><b class="${a.remaining < 0 ? 'neg' : ''}">${E.formatMoney(b.remaining)} → ${E.formatMoney(a.remaining)}</b></div>
        ${a.rel === 'current' && a.daily.mode === 'ok' ? `<div class="row"><span>Budget quotidien</span><b>${money(b.daily.perDay == null ? 0 : b.daily.perDay)} → ${money(a.daily.perDay)}</b></div>` : ''}</div></div>
        ${warns.map(c => `<div class="alert ${c.status === 'warn' ? 'warn' : 'bad'}" style="margin-top:8px"><span>${c.status === 'warn' ? '🟠' : '🔴'}</span><span><b>${esc(c.cat.name)}</b> : ${c.status === 'over' ? 'limite dépassée de ' + E.formatMoney(c.over) : c.status === 'alert' ? 'limite atteinte' : c.pct + ' % de la limite'}</span></div>`).join('')}</div>`;
    }).join('') || '<div class="note">Aucun mois modifié.</div>'}<div class="note">Statistiques et archives sont recalculées automatiquement à partir de ces opérations.</div></div>
      <div class="actions"><button class="btn" data-act="impDone">Terminer</button><button class="btn sec" data-act="impSeeExpenses">Voir les dépenses</button><button class="btn danger" data-act="impUndo">Annuler cet import</button></div>`;
    return h;
  };
  App.pageTab.importReport = 'expenses';
  A.impDone = () => { imp.report = null; ui.page = null; ui.viewMonth = App.curYm(); go('home'); };
  A.impSeeExpenses = () => { const m = imp.report && imp.report.res.months[0]; imp.report = null; ui.page = null; ui.viewMonth = m || App.curYm(); go('expenses'); };
  A.impUndo = () => confirmSheet('Annuler cet import ?', 'Toutes les opérations créées par cet import sont retirées et les factures/abonnements rapprochés redeviennent « à payer ».', [{ label: 'Annuler l’import', cls: 'danger', fn: async () => { const id = imp.report.importId; await commit(() => I.undoImport(st(), id), { msg: 'Import annulé' }); imp.report = null; ui.page = null; go('expenses'); } }]);

  // ----- Historique -----
  App.pages.importHistory = function () {
    const l = [...st().imports].reverse();
    let h = `${backBtn('Paramètres', 'openSettings')}<div class="page-title">Historique des importations</div>`;
    h += l.length ? `<div class="card" style="padding:4px 16px"><div class="list">${l.map(i => `<button class="item" data-act="impInfo" data-id="${i.id}"><span class="ico" style="background:var(--track)">${i.errors.length ? '⚠️' : '📄'}</span>
      <span class="m"><div class="t">${esc(i.bank)}${i.account ? ' · ' + esc(i.account) : ''}</div><div class="s">${i.period ? E.fmtDate(i.period.from) + ' → ' + E.fmtDate(i.period.to) : 'période inconnue'} · importé le ${E.fmtDate(i.at.slice(0, 10))}</div></span>
      <span class="a">${i.counts.imported}<small>ligne${i.counts.imported > 1 ? 's' : ''}</small></span></button>`).join('')}</div></div>` : `<div class="card">${empty('Aucun import', 'Les relevés importés apparaîtront ici.')}</div>`;
    h += `<div class="actions"><button class="btn sec" data-act="importOpen">${ic('doc')} Importer un relevé</button>${l.length ? '<button class="btn danger" data-act="impClearHistory">Supprimer l’historique</button>' : ''}</div>
      <div class="note">Supprimer l’historique ne supprime pas les opérations déjà enregistrées. L’empreinte anti-doublon est conservée pour ne pas réimporter deux fois la même transaction.</div>`;
    return h;
  };
  App.pageTab.importHistory = null;
  A.importHistory = () => go(ui.tab, 'importHistory');
  A.impInfo = function (el) {
    const i = st().imports.find(x => x.id === el.dataset.id);
    openSheet(`<h3>${esc(i.bank)} · ${i.period ? E.fmtDate(i.period.from) + ' → ' + E.fmtDate(i.period.to) : ''}</h3><div class="card" style="margin-top:0"><div class="note" style="margin:0">Fichier : ${esc(i.fileName || '—')}${i.ocr ? ' · OCR' : ''}<br>Importé le ${E.fmtDate(i.at.slice(0, 10))} à ${i.at.slice(11, 16)} (UTC)</div>
      <div class="grid2" style="gap:12px;margin-top:10px"><div class="kpi"><div class="k">Importées</div><div class="v">${i.counts.imported}</div></div><div class="kpi"><div class="k">Doublons ignorés</div><div class="v">${i.counts.duplicates}</div></div>
      <div class="kpi"><div class="k">Dépenses créées</div><div class="v">${i.counts.expenses}</div></div><div class="kpi"><div class="k">Revenus / fusions / payées</div><div class="v">${i.counts.incomes} / ${i.counts.merged} / ${i.counts.paid}</div></div></div>
      ${i.errors.length ? `<div class="alert warn"><span>⚠️</span><span>${i.errors.map(esc).join('<br>')}</span></div>` : '<div class="note">Aucune erreur de lecture.</div>'}</div>
      <div class="menu">${i.hasPdf ? `<button data-act="impDelPdf" data-id="${i.id}">Supprimer le PDF original conservé</button>` : ''}<button class="red" data-act="impUndoHist" data-id="${i.id}">Annuler cet import (retire ses opérations)</button></div>`);
  };
  A.impDelPdf = async function (el) { await Store.delPdf(el.dataset.id).catch(() => {}); const i = st().imports.find(x => x.id === el.dataset.id); i.hasPdf = false; await persist(); closeSheet(); toast('PDF supprimé'); render(); };
  A.impUndoHist = el => { closeSheet(); confirmSheet('Annuler cet import ?', 'Les opérations créées par cet import seront retirées.', [{ label: 'Annuler l’import', cls: 'danger', fn: async () => { Store.delPdf(el.dataset.id).catch(() => {}); await commit(() => I.undoImport(st(), el.dataset.id), { msg: 'Import annulé', undo: true }); } }]); };
  A.impClearHistory = () => confirmSheet('Supprimer l’historique ?', 'Les opérations restent. Choisis si l’anti-doublon est conservé.', [
    { label: 'Supprimer (garder l’anti-doublon)', cls: 'danger', fn: () => { Store.clearPdfs().catch(() => {}); commit(() => I.deleteImportHistory(st(), { keepKeys: true }), { msg: 'Historique supprimé', undo: true }); } },
    { label: 'Tout oublier (risque de doublons)', cls: 'danger', fn: () => { Store.clearPdfs().catch(() => {}); commit(() => I.deleteImportHistory(st(), { keepKeys: false }), { msg: 'Historique et anti-doublon supprimés', undo: true }); } }]);

  A.importPrefs = function () {
    const s = st().settings;
    openSheet(`<h3>Préférences d’import</h3>
      <div class="field"><label>Date retenue pour classer une opération dans un mois</label><div class="seg"><button class="${s.importDateMode !== 'booked' ? 'on' : ''}" data-act="impDateMode" data-v="tx">Date de transaction</button><button class="${s.importDateMode === 'booked' ? 'on' : ''}" data-act="impDateMode" data-v="booked">Date comptable</button></div></div>
      <div class="field"><label>Mes autres comptes (IBAN, séparés par des virgules) — pour reconnaître les virements internes</label><input class="in" id="f-own" value="${esc((s.ownAccounts || []).join(', '))}" placeholder="CH93 0076 …"></div>
      <div class="switch"><span>Conserver le PDF original sur l’appareil<br><small style="color:var(--muted)">Désactivé : seules les opérations extraites sont gardées</small></span><input type="checkbox" id="f-keep" ${s.keepPdf ? 'checked' : ''}></div>
      <div class="actions"><button class="btn" data-act="impPrefsSave">Enregistrer</button></div>`);
  };
  A.impDateMode = el => { st().settings.importDateMode = el.dataset.v; persist(); A.importPrefs(); };
  A.impPrefsSave = () => { const s = st().settings; s.ownAccounts = val('f-own').split(/[,;\n]/).map(x => x.trim()).filter(Boolean); s.keepPdf = document.getElementById('f-keep').checked; persist(); closeSheet(); toast('Préférences enregistrées'); };
})();
