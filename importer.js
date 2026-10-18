/* Importation de relevés bancaires : lecture des lignes, classement, rapprochements, application.
   Logique pure (sans DOM, sans PDF) : l'extraction PDF/OCR fournit des « lignes de cellules » positionnées.
   IMPORTANT : aucun format de banque n'est considéré comme validé sans exemples réels ; l'analyseur est générique
   (colonnes Débit/Crédit/Solde, ou montant + solde, ou montant signé) et chaque ligne douteuse est signalée. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Importer = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const deacc = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => deacc(s).toLowerCase();
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);

  // ---------- Construction des lignes ----------
  // Texte brut (collé, ou jeux de test) : les colonnes sont séparées par au moins 2 espaces.
  function textToLines(text) {
    const lines = [];
    String(text).split(/\r?\n|\f/).forEach((raw, i) => {
      if (!raw.trim()) return;
      const cells = []; const re = /\S+(?: \S+)*/g; let m;
      while ((m = re.exec(raw))) cells.push({ x: m.index, x2: m.index + m[0].length, text: m[0] });
      lines.push({ y: -i, page: 1, cells });
    });
    return lines;
  }
  // Éléments de texte positionnés (pdf.js ou OCR) → lignes de cellules.
  function itemsToLines(items, page) {
    const rows = [];
    for (const it of items.filter(i => i.str && i.str.trim() !== '' || i.str === ' ')) {
      const tol = Math.max(2, (it.h || 8) * 0.45);
      let row = rows.find(r => Math.abs(r.y - it.y) <= tol);
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => {
      const its = r.items.sort((a, b) => a.x - b.x), cells = [];
      for (const it of its) {
        const str = it.str.replace(/\s+/g, ' '); if (!str.trim()) continue;
        const prev = cells[cells.length - 1], cw = (it.w || 5 * str.length) / Math.max(1, str.length);
        if (prev && it.x - prev.x2 < cw * 1.6) { prev.text += (it.x - prev.x2 > cw * 0.25 ? ' ' : '') + str.trim(); prev.x2 = it.x + (it.w || cw * str.length); }
        else cells.push({ x: it.x, x2: it.x + (it.w || cw * str.length), text: str.trim() });
      }
      return { y: r.y, page, cells };
    }).filter(l => l.cells.length);
  }

  // ---------- Dates et montants ----------
  const DATE_RE = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4})?)?$/;
  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function toIso(d, m, y, defYear) {
    let year = y ? (+y < 100 ? 2000 + +y : +y) : defYear;
    if (!year) return null;
    const iso = `${year}-${E.pad(+m)}-${E.pad(+d)}`;
    return E.isValidDate(iso) ? iso : null;
  }
  function parseDateCell(t, defYear) {
    t = t.trim();
    let m = ISO_RE.exec(t); if (m) return E.isValidDate(t) ? { iso: t, hasYear: true } : null;
    m = DATE_RE.exec(t); if (!m) return null;
    const iso = toIso(m[1], m[2], m[3], defYear);
    return iso ? { iso, hasYear: !!m[3], d: +m[1], m: +m[2] } : (m[3] ? null : { iso: null, hasYear: false, d: +m[1], m: +m[2] });
  }
  const AMT_RE = /^([+-])?\s*((?:\d{1,3}(?:[’'`´   ]\d{3})+|\d+)[.,]\d{2})\s*([+-]|CR|DB|H|S)?$/i;
  function parseAmountCell(t) {
    let cur = null;
    t = t.trim().replace(/^(CHF|EUR|USD|GBP|Fr\.?)\s*/i, (x, c) => { cur = c.toUpperCase().replace(/^FR\.?$/, 'CHF'); return ''; }).replace(/\s*(CHF|EUR|USD|GBP)$/i, (x, c) => { cur = c.toUpperCase(); return ''; });
    const m = AMT_RE.exec(t.trim()); if (!m) return null;
    const cents = E.parseMoney(m[2].replace(/[’'`´   ]/g, ''));
    if (cents == null) return null;
    let sign = 0;
    if (m[1] === '-' || m[3] === '-' || /^db$/i.test(m[3] || '') || /^s$/i.test(m[3] || '')) sign = -1;
    else if (m[1] === '+' || m[3] === '+' || /^cr$/i.test(m[3] || '') || /^h$/i.test(m[3] || '')) sign = 1;
    return { cents, sign, cur };
  }
  const CUR_RE = /\b(EUR|USD|GBP|JPY|CAD|AUD|SEK|NOK|DKK|CHF)\b/;

  // ---------- Analyse d'un relevé ----------
  const HDR_DEBIT = /^(d[eé]bits?|belastung(?:en)?|soll|sorties?|retraits?)\b/i;
  const HDR_CREDIT = /^(cr[eé]dits?|gutschrift(?:en)?|haben|entr[eé]es?|d[eé]p[oô]ts?)\b/i;
  const HDR_BAL = /^(solde|saldo|balance|kontostand)\b/i;
  const TYPE_DEBIT = /^(d[eé]bit|belastung|db|d|soll|sortie)$/i, TYPE_CREDIT = /^(cr[eé]dit|gutschrift|cr|c|haben|entr[eé]e)$/i;
  const CREDIT_WORDS = /\b(salaire|lohn|gehalt|cr[eé]dit(?! ?card)|gutschrift|versement|einzahlung|encaissement|virement re[cç]u|d[eé]p[oô]t|remboursement|r[uü]ckerstattung|int[eé]r[eê]ts?|zins(?:en)?|rente|avs|allocation)\b/i;
  const SKIP_RE = /^(page|seite)\s*\d|^\d+\s*\/\s*\d+$/i;
  const BAL_LABEL = /^(solde|saldo|report|[uü]bertrag|ancien solde|nouveau solde|total|summe|kontostand|balance|ending balance|opening balance)/i;

  function detectBank(headText) {
    const t = norm(headText);
    if (/postfinance|post finance/.test(t)) return 'PostFinance';
    if (/raiffeisen/.test(t)) return 'Raiffeisen';
    if (/banque cantonale vaudoise|\bbcv\b/.test(t)) return 'BCV';
    if (/z[uü]rcher kantonalbank|\bzkb\b/.test(t)) return 'ZKB';
    if (/\bubs\b/.test(t)) return 'UBS';
    return 'Autre';
  }
  function maskIban(iban) { const c = iban.replace(/\s/g, ''); return `${c.slice(0, 4)} •••• ${c.slice(-4)}`; }

  function splitLeadingDate(cells) {
    const c0 = cells[0]; if (!c0) return cells;
    const m = /^(\d{1,2}\.\d{1,2}\.(?:\d{2,4})?|\d{4}-\d{2}-\d{2})\s+(\S.*)$/.exec(c0.text);
    if (!m) return cells;
    const w = (c0.x2 - c0.x) / c0.text.length, dl = m[1].length;
    return [{ x: c0.x, x2: c0.x + w * dl, text: m[1] }, { x: c0.x + w * (dl + 1), x2: c0.x2, text: m[2] }, ...cells.slice(1)];
  }

  function parseStatement(lines, opts = {}) {
    const warnings = [];
    const flat = lines.map(l => l.cells.map(c => c.text).join(' '));
    const head = flat.slice(0, 40).join('\n'), full = flat.join('\n');
    const bank = detectBank(head);
    const ib = /\bCH\d{2}(?:\s?[0-9A-Z]{4}){4}\s?[0-9A-Z]{1,4}\b/.exec(full);
    const account = ib ? maskIban(ib[0]) : null, accountRaw = ib ? ib[0].replace(/\s/g, '') : null;
    let period = null;
    const pm = /(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:-|–|au|bis|to|à)\s*(\d{1,2}\.\d{1,2}\.\d{4})/i.exec(full);
    if (pm) { const a = parseDateCell(pm[1]), b = parseDateCell(pm[2]); if (a && b && a.iso && b.iso) period = { from: a.iso, to: b.iso }; }
    let defYear = period ? +period.from.slice(0, 4) : (opts.defaultYear || null);
    if (!defYear) { const ym = /\b(20\d{2})\b/.exec(full); if (ym) defYear = +ym[1]; }
    const stCur = (/(?:monnaie|devise|w[aä]hrung|currency)\s*:?\s*([A-Z]{3})/i.exec(full) || [])[1] || 'CHF';

    const txs = []; let cur = null, columns = null, prevBalance = null, openingBalance = null, closingBalance = null;
    const assignYear = p => {
      if (p.iso) return p.iso;
      if (!p.d) return null;
      if (period) { for (const y of new Set([+period.from.slice(0, 4), +period.to.slice(0, 4)])) { const iso = toIso(p.d, p.m, null, y); if (iso && iso >= period.from && iso <= period.to) return iso; } }
      return toIso(p.d, p.m, null, defYear);
    };
    const flush = () => {
      if (!cur) return;
      const t = cur; cur = null;
      const label = t.label.join(' ').replace(/\s+/g, ' ').trim();
      let amount = null, balance = null, how = '';
      const flags = [];
      const amts = t.amts;
      if (columns && columns.count >= 2 && amts.length) {
        for (const a of amts) {
          let best = null, bd = Infinity;
          for (const k of ['debit', 'credit', 'balance']) if (columns[k] != null) { const d = Math.abs(a.cx - columns[k]); if (d < bd) { bd = d; best = k; } }
          if (best === 'debit') amount = -a.cents; else if (best === 'credit') amount = a.cents; else if (best === 'balance') balance = a.sign < 0 ? -a.cents : a.cents;
        }
        if (amount != null) how = 'colonnes';
      }
      if (amount == null && amts.length) {
        const list = amts.slice();
        if (list.length >= 2) { const b = list.pop(); balance = b.sign < 0 ? -b.cents : b.cents; }
        const a = list[0];
        if (t.typeSign) { amount = t.typeSign * a.cents; how = 'type'; }
        else if (a.sign) { amount = a.sign * a.cents; how = 'signe'; }
        else if (balance != null && prevBalance != null && Math.abs(balance - prevBalance) === a.cents) { amount = (balance - prevBalance) > 0 ? a.cents : -a.cents; how = 'solde'; }
        else {
          // Sans colonne, signe ni solde : indice par les mots du libellé, toujours signalé « à vérifier ».
          amount = CREDIT_WORDS.test(label) ? a.cents : -a.cents;
          flags.push('sign-unknown'); how = 'inconnu';
        }
      }
      if (amount == null) { warnings.push(`Ligne sans montant ignorée : « ${label.slice(0, 60)} »`); return; }
      if (balance != null && prevBalance != null && how !== 'solde') {
        if (prevBalance + amount !== balance) {
          if (prevBalance - amount === balance && how !== 'colonnes') { amount = -amount; flags.push('sign-fixed'); }
          else flags.push('balance-mismatch');
        }
      }
      if (balance != null) prevBalance = balance; else if (prevBalance != null) prevBalance += amount;
      const d1 = assignYear(t.dates[0]), d2 = t.dates[1] ? assignYear(t.dates[1]) : null;
      if (!d1) { warnings.push(`Date illisible ignorée : « ${label.slice(0, 60)} »`); return; }
      if (!t.dates[0].hasYear) flags.push('year-inferred');
      const cm = CUR_RE.exec(label);
      const currency = (t.amts.find(a => a.cur) || {}).cur || (cm && cm[1]) || stCur;
      if (currency !== 'CHF') flags.push('foreign-currency');
      const rm = /(?:r[eé]f(?:[eé]rence)?\.?|ref\.?-?nr\.?)[:\s]*([A-Z0-9][A-Z0-9 -]{5,})/i.exec(label);
      txs.push({ idx: txs.length, date: d1, dateBooked: d2, label, amount, balance, currency, ref: rm ? rm[1].trim() : null, page: t.page, flags, how });
    };
    const bump = (a, x) => ({ ...a, cx: x });

    for (const line of lines) {
      let cells = splitLeadingDate(line.cells);
      const lineText = cells.map(c => c.text).join(' ');
      // en-tête de colonnes
      const hd = cells.find(c => HDR_DEBIT.test(c.text)), hc = cells.find(c => HDR_CREDIT.test(c.text)), hb = cells.find(c => HDR_BAL.test(c.text));
      if ((hd && hc) || (hd && hb) || (hc && hb)) {
        flush();
        columns = { debit: hd ? (hd.x + hd.x2) / 2 : null, credit: hc ? (hc.x + hc.x2) / 2 : null, balance: hb ? (hb.x + hb.x2) / 2 : null };
        columns.count = ['debit', 'credit', 'balance'].filter(k => columns[k] != null).length;
        continue;
      }
      if (SKIP_RE.test(lineText.trim())) { flush(); continue; }
      // dates en tête
      const dates = [];
      for (const c of cells) { if (dates.length < 2) { const p = parseDateCell(c.text); if (p) { dates.push(p); continue; } } break; }
      const rest = cells.slice(dates.length);
      const amtCells = [], labelCells = []; let typeSign = 0;
      for (const c of rest) {
        const a = parseAmountCell(c.text);
        if (a && (dates.length || cur)) amtCells.push({ ...a, cx: (c.x + c.x2) / 2 });
        else if ((dates.length || cur) && TYPE_DEBIT.test(c.text.trim()) && c.text.trim().length > 1) typeSign = -1;
        else if ((dates.length || cur) && TYPE_CREDIT.test(c.text.trim()) && c.text.trim().length > 1) typeSign = 1;
        else labelCells.push(c.text);
      }
      if (dates.length && !amtCells.length && labelCells.length) {
        const last = labelCells[labelCells.length - 1], m = /^(.*?)\s+((?:CHF|EUR|USD|GBP)?\s*[-+]?\d[\d'’ ]*[.,]\d{2}[-+]?(?:\s*(?:CHF|EUR|USD|GBP))?)$/.exec(last);
        const a = m && parseAmountCell(m[2]); if (a) { labelCells[labelCells.length - 1] = m[1]; amtCells.push({ ...a, cx: 1e9 }); }
      }
      if (dates.length && dates[0]) {
        const lab = labelCells.join(' ');
        if (BAL_LABEL.test(lab.trim()) || BAL_LABEL.test(norm(lab).trim())) {
          flush();
          if (amtCells.length) { const a = amtCells[amtCells.length - 1], v = a.sign < 0 ? -a.cents : a.cents; prevBalance = v; if (/nouveau|final|fin|ende|schluss|closing|ending/i.test(lab)) closingBalance = v; else if (openingBalance == null) openingBalance = v; }
          continue;
        }
        flush();
        cur = { dates, label: labelCells, amts: amtCells, page: line.page, cur: '', typeSign };
      } else if (cur) {
        const lab = labelCells.join(' ');
        if (BAL_LABEL.test(lab.trim()) || BAL_LABEL.test(norm(lab).trim())) {
          flush();
          if (amtCells.length) { const a = amtCells[amtCells.length - 1], v = a.sign < 0 ? -a.cents : a.cents; prevBalance = v; if (/nouveau|final|fin|ende|schluss|closing|ending/i.test(lab)) closingBalance = v; }
          continue;
        }
        cur.label.push(...labelCells);
        if (typeSign && !cur.typeSign) cur.typeSign = typeSign;
        if (!cur.amts.length && amtCells.length) cur.amts.push(...amtCells);
      } else {
        const lab = labelCells.join(' ');
        if (/(ancien solde|solde (?:pr[eé]c[eé]dent|report[eé]|initial|d['’]ouverture)|saldo vortrag|opening balance|solde au)/i.test(lab) && rest.length) {
          const a = rest.map(c => parseAmountCell(c.text)).filter(Boolean).pop();
          if (a) { prevBalance = a.sign < 0 ? -a.cents : a.cents; openingBalance = prevBalance; }
        }
      }
    }
    flush();
    if (!txs.length) warnings.push('Aucune transaction reconnue dans ce document.');
    if (openingBalance != null && closingBalance != null && txs.length) {
      const calc = openingBalance + sum(txs, t => t.amount);
      if (calc !== closingBalance) warnings.push(`Le total des lignes ne correspond pas au solde du relevé (écart ${E.formatMoney(closingBalance - calc)} ${stCur}) : vérifie les lignes signalées.`);
    }
    if (!period && txs.length) { const ds = txs.map(t => t.date).sort(); period = { from: ds[0], to: ds[ds.length - 1], inferred: true }; }
    return { bank, account, accountRaw, currency: stCur, period, openingBalance, closingBalance, txs, warnings, ocr: !!opts.ocr };
  }

  // ---------- Libellés, commerçants, catégories ----------
  const PREFIXES = [/^paiement (?:par )?carte(?: de d[eé]bit| de cr[eé]dit)?/i, /^achat\/service/i, /^achat/i, /^paiement (?:maestro|v ?pay|twint|qr(?:-facture)?|e-?banking|sepa)/i,
    /^d[eé]bit(?: direct)?(?: \(?lsv\+?\)?)?/i, /^(?:postfinance|debit) card/i, /^kartenzahlung/i, /^zahlung/i, /^twint/i, /^ordre (?:permanent|e-?banking)/i,
    /^e-?banking/i, /^lsv\+?/i, /^pos\b/i, /^carte(?: de d[eé]bit)?/i];
  const STOP = new Set(['ab', 'sa', 'ag', 'gmbh', 'sarl', 'sàrl', 'ltd', 'inc', 'co', 'the', 'de', 'du', 'la', 'le', 'les', 'des', 'et', 'carte', 'no', 'nr', 'num', 'ref', 'suisse', 'switzerland', 'ch', 'chf']);
  function cleanLabel(label) {
    let s = String(label || '').replace(/\s+/g, ' ').trim();
    for (const p of PREFIXES) s = s.replace(p, '').trim();
    s = s.replace(/\b\d{2}\.\d{2}(?:\.\d{2,4})?\b/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ').replace(/[xX*]{2,}\s?\d*/g, ' ')
      .replace(/(?:r[eé]f(?:[eé]rence)?\.?|ref\.?-?nr\.?)[:\s]*[A-Z0-9 -]{4,}/gi, ' ').replace(/\b(?:CHF|EUR|USD)\s*\d[\d.'’]*/gi, ' ')
      .replace(/^[\s,;:\-–]+/, '').replace(/\s+/g, ' ').trim().replace(/^(?:du|le|au|vom|am|à|a)\s+/i, '');
    return s;
  }
  function merchantKey(label) {
    const known = SUB_NAMES.exec(norm(label)); if (known) return known[0].replace(/[^a-z0-9]+/g, ' ').trim();
    const toks = norm(cleanLabel(label)).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2 && !STOP.has(t));
    return toks.slice(0, 2).join(' ');
  }
  const CITIES = /\b(lausanne|gen[eè]ve|geneve|z[uü]rich|zurich|bern[e]?|fribourg|neuch[aâ]tel|lutry|sion|lugano|basel|b[aâ]le|winterthur|luzern|lucerne|morges|vevey|montreux|yverdon|nyon|renens|pully|prilly|carouge|lancy|vernier|meyrin|ecublens|crissier|bulle|martigny|sierre|monthey|aigle|biel|bienne|olten|aarau|st\.? ?gallen|chur|thun|zug|schaffhausen|locarno|bellinzona)\b/gi;
  function merchantName(label) {
    let t = cleanLabel(label);
    t = t.split(/\s[-–|\/]\s|[,;]\s?|\s(?:carte|card|ref|r[eé]f(?:[eé]rence)?|iban|bic|n°|no\.?|nr\.?|date|montant|cours|taux)\b/i)[0];
    t = t.replace(/\b\d{4}\s+[A-ZÀ-Ý][\p{L}'-]+/gu, ' ').replace(/\b(?:rue|av\.?|avenue|chemin|ch\.|route|rte|strasse|str\.|gasse|weg|place|pl\.|quai|bd|boulevard)\b.*$/i, ' ')
      .replace(/\b(?:CH|FR|DE|IT|AT|LU|GB|US)\b$/, ' ').replace(/\b\d+\b/g, ' ').replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim();
    const words = t.split(' ').filter(w => /[\p{L}]/u.test(w));
    const noCity = words.filter(w => !(new RegExp('^' + CITIES.source + '$', 'i')).test(w));
    let out = (noCity.length ? noCity : words).slice(0, 3).join(' ');
    if (out.length > 26) out = out.slice(0, 25).replace(/\s\S*$/, '') || out.slice(0, 25);
    return out ? out.replace(/\b([A-ZÀ-Ý]{3,})\b/g, w => w[0] + w.slice(1).toLowerCase()) : 'Opération';
  }
  const KW = [
    { re: /\bcoop\b|migros|denner|aldi|lidl|volg\b|\bspar\b|carrefour|manor food|globus (?:delicatessa|food)|epicerie|boulangerie|b[aä]ckerei|boucherie|metzgerei|primeur|pronto|\bavec\b|k ?kiosk|valora|supermarch|hofl|prix garantie|satellite|landi/, cat: 'courses' },
    { re: /\bshell\b|\bbp\b|avia\b|migrol|agip|\besso\b|tamoil|socar|agrola|station[- ]service|tankstelle|\beni\b|carburant|petrol|\bcoop pronto.*(?:oil|petrol)|\boil\b|total ?energies|ruedi r[uü]sch/, cat: 'essence' },
    { re: /restaurant|mcdonald|burger king|starbucks|pizz|\bcaf[eé]\b|bistro|kebab|subway|uber ?eats|eat\.ch|just ?eat|smood|brasserie|sushi|snack|take ?away|domino|tea ?room|boulangerie caf|kfc|five guys|wienerberger|auberge|trattoria|osteria|gasthof|pub\b|brewery|tavern|food ?truck/, cat: 'restaurants' },
    { re: /\bsbb\b|\bcff\b|\bffs\b|\btpg\b|\btl\b|\btpf\b|\bvbz\b|\bzvv\b|\bbls\b|parking|swiss ?pass|mobility|\buber\b|\bbolt\b|taxi|\blime\b|flixbus|vignette|easyride|transports? publics?|tpn|mbc\b|postauto|car postal|autoroute|p\+r/, cat: 'transport' },
    { re: /pharmac|apotheke|amavita|sunstore|toppharm|m[eé]decin|docteur|\bdr\.? |clinique|h[oô]pital|spital|hirslanden|chuv|dentiste|zahnarzt|physio|optique|optic|laboratoire|medbase|cabinet m[eé]dical|sant[eé]/, cat: 'sante' },
    { re: /zara|h&m|\bh ?& ?m\b|amazon|zalando|ikea|digitec|galaxus|mediamarkt|media markt|fnac|decathlon|\bmanor\b|globus|pkz|ochsner|aliexpress|temu|jumbo|hornbach|bauhaus|do it|orell|exlibris|ex libris|brack|microspot|interdiscount|conforama|c&a|vero moda|shein|vinted|ricardo|\bpost\b.*colis|nespresso/, cat: 'shopping' },
    { re: /cinema|cin[eé]ma|kino|path[eé]|fitness|basic-?fit|update fitness|ticketcorner|ticketing|eventfrog|steam|playstation|nintendo|xbox|th[eé][aâ]tre|concert|mus[eé]e|bowling|\bzoo\b|europa-?park|loisir|\bski\b|bains|piscine|golf|escape game|casino|lotterie|loterie|swisslos/, cat: 'loisirs' },
  ];
  const SUB_NAMES = /spotify|netflix|youtube|disney|apple\.com\/bill|apple services|icloud|chatgpt|openai|anthropic|claude\.ai|amazon prime|prime video|adobe|microsoft 365|office 365|google (?:one|storage)|dropbox|deezer|canal\+|dazn|blick\+?|nzz|le temps|tamedia|swisscom blue|sky ?show|paramount|crunchyroll|audible|notion|github|1password|nordvpn/;
  const BILL_HINTS = [
    { re: /css |helsana|swica|groupe mutuel|sanitas|concordia|visana|assura|kpt|sympany|egk|mutuel/, bc: 'Assurance maladie' },
    { re: /mobili[eè]re|axa |zurich assurance|allianz|generali|baloise|b[aâ]loise|vaudoise|helvetia|tcs |assurance auto|autoversicherung|car insurance/, bc: 'Assurance auto' },
    { re: /loyer|miete|r[eé]gie|g[eé]rance|immobili/, bc: 'Loyer' },
    { re: /swisscom|sunrise|\bsalt\b|wingo|yallo|lebara|quickline/, bc: 'Téléphone' },
    { re: /impots|steuer|administration fiscale|contributions/, bc: 'Impôts' },
    { re: /leasing|amag leasing|multilease/, bc: 'Leasing' },
  ];
  const WORDS = {
    transfer: /(virement (?:entre|vers|de) (?:mes|vos|votre|propres?) comptes?|eigene[nr]? konto|umbuchung|transfert interne|virement interne|compte [eé]pargne|sparkonto|own account|transfer to savings)/i,
    card: /(viseca|corn[eè]r ?card|swisscard|cembra|mastercard|visa)\b.*(d[eé]compte|facture|abrechnung|paiement|zahlung|rechnung)|(d[eé]compte|facture|abrechnung|paiement|zahlung|rechnung).*(carte de cr[eé]dit|kreditkarte|viseca|corn[eè]r|swisscard|cembra)|^(?:viseca|corn[eè]r ?card|swisscard|cembra)/i,
    cash: /(retrait|bancomat|geldautomat|geldbezug|atm|cash withdrawal|bargeld)/i,
    salary: /(salaire|lohn|gehalt|salary|paie\b|r[eé]mun[eé]ration)/i,
    refund: /(remboursement|rembours|r[uü]ckerstattung|retour|refund|storno|gutschrift (?:r[uü]ck)|annulation|credit note)/i,
  };

  function ruleFor(state, mk) { return mk && state.rules ? state.rules[mk] || null : null; }
  const tokens = s => new Set(norm(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !STOP.has(t)));
  const overlap = (a, b) => { const A = tokens(a), B = tokens(b); for (const t of A) if (B.has(t)) return true; return false; };

  // ---------- Prévisualisation ----------
  function buildPreview(state, parsed, opts = {}) {
    const today = opts.today || E.localDateStr();
    const dateMode = opts.dateMode || (state.settings && state.settings.importDateMode) || 'tx';
    const own = ((state.settings && state.settings.ownAccounts) || []).map(x => x.replace(/\s/g, '').toUpperCase()).filter(Boolean);
    const knownKeys = new Set(state.importKeys || []);
    const priorK2 = new Map();
    for (const imp of state.imports || []) for (const t of imp.txs || []) priorK2.set(t.k2, imp);
    const accKey = parsed.accountRaw ? parsed.accountRaw.slice(-4) : 'na';
    const seen = new Map(), usedOcc = new Set(), usedExp = new Set();
    const rows = [];

    // occurrences planifiées (mois de la date ± 1)
    const occCache = new Map();
    const occsFor = date => {
      const ym = date.slice(0, 7);
      if (!occCache.has(ym)) {
        const list = [];
        for (const d of [E.addMonths(ym, -1), ym, E.addMonths(ym, 1)]) {
          for (const b of E.billOccurrences(state, d, today)) if (!b.paidDate) list.push({ ...b, type: 'bill', ym: d, due: b.dueDate });
          for (const b of E.subOccurrences(state, d, today)) if (!b.paidDate) list.push({ ...b, type: 'sub', ym: d, due: b.dueDate });
        }
        occCache.set(ym, list);
      }
      return occCache.get(ym).filter(o => !usedOcc.has(o.type + o.id + o.due));
    };

    parsed.txs.forEach(tx => {
      const date = dateMode === 'booked' && tx.dateBooked ? tx.dateBooked : tx.date;
      const mk = merchantKey(tx.label), name = merchantName(tx.label), lab = norm(tx.label);
      const debit = tx.amount < 0, abs = Math.abs(tx.amount);
      const k0 = `${accKey}|${tx.date}|${tx.amount}|${norm(tx.label).replace(/\s+/g, ' ').slice(0, 40)}`;
      const n = (seen.get(k0) || 0) + 1; seen.set(k0, n);
      const key = `${k0}|${n}`, k2 = `${tx.date}|${tx.amount}|${mk}|${n}`;
      const row = { id: 'r' + tx.idx, idx: tx.idx, date, dateTx: tx.date, dateBooked: tx.dateBooked, label: tx.label, amount: tx.amount, abs, direction: debit ? 'debit' : 'credit',
        merchant: name, mk, kind: debit ? 'expense' : 'income', category: 'divers', billCategory: null, confidence: 0.4, reasons: [], flags: tx.flags.slice(), include: true,
        link: null, candidates: [], key, k2, dupOf: null, currency: tx.currency, ref: tx.ref, balance: tx.balance, method: '' };
      if (parsed.ocr) row.flags.push('ocr');

      // doublons (déjà importé)
      if (knownKeys.has(key)) { row.dupOf = 'importé'; row.include = false; row.reasons.push('Déjà importé (même transaction)'); }
      else if (priorK2.has(k2)) { const imp = priorK2.get(k2); row.dupOf = imp.id; row.include = false; row.reasons.push(`Probable doublon du relevé importé le ${E.fmtDate(imp.at.slice(0, 10))}`); }

      const rule = ruleFor(state, mk);
      // virement interne
      const ibanIn = (tx.label.replace(/\s/g, '').match(/CH\d{2}[0-9A-Z]{17}/g) || []);
      if (WORDS.transfer.test(lab) || ibanIn.some(i => own.includes(i) || i === parsed.accountRaw)) {
        row.kind = 'transfer'; row.confidence = 0.85; row.reasons.push('Virement entre tes comptes : non compté comme dépense'); rows.push(row); return;
      }
      if (rule && rule.kind === 'transfer') { row.kind = 'transfer'; row.confidence = 0.9; row.reasons.push('Règle mémorisée : virement interne'); rows.push(row); return; }

      if (debit) {
        // paiement de carte de crédit
        if (WORDS.card.test(lab)) {
          row.kind = 'cardPayment'; row.confidence = 0.7; row.category = (rule && rule.cat) || 'divers';
          const settled = sum(state.expenses.filter(e => e.method === 'Carte de crédit' && !e.cardSettled && e.date <= date && E.diffDays(e.date, date) <= 60), e => e.amount);
          if (settled > 0 && Math.abs(settled - abs) <= 100) { row.link = { type: 'cardSettle' }; row.reasons.push('Les achats par carte de crédit déjà saisis totalisent ce montant : non compté une 2ᵉ fois'); }
          else { row.reasons.push('Règlement de carte de crédit : compté comme dépense tant que le détail des achats n’est pas saisi'); row.flags.push('card'); }
          rows.push(row); return;
        }
        // facture / abonnement planifié
        const cands = occsFor(date).map(o => {
          const dd = Math.abs(E.diffDays(o.due, date)); const exact = o.amount === abs; const close = Math.abs(o.amount - abs) <= Math.max(100, Math.round(o.amount * 0.01));
          const nameHit = overlap(tx.label, o.name);
          const near = o.type === 'sub' ? dd <= 7 : dd <= 12;
          let score = 0;
          if (exact && near) score = 0.8 + (nameHit ? 0.2 : 0); else if (close && near) score = 0.55 + (nameHit ? 0.2 : 0); else if (nameHit && o.type === 'sub' && abs <= o.amount * 1.3 && abs >= o.amount * 0.7 && dd <= 10) score = 0.6;
          return { o, score, exact, nameHit };
        }).filter(c => c.score >= 0.55).sort((a, b) => b.score - a.score);
        if (cands.length) {
          const top = cands[0], second = cands[1];
          row.candidates = cands.slice(0, 4).map(c => ({ type: c.o.type, id: c.o.id, due: c.o.due, name: c.o.name, amount: c.o.amount, ym: c.o.ym }));
          if (!second || top.score - second.score >= 0.15 || top.o.id === second.o.id) {
            const o = top.o;
            row.kind = o.type === 'sub' ? 'subPayment' : 'billPayment'; row.link = { type: o.type, id: o.id, due: o.due, ym: o.ym, name: o.name, amount: o.amount };
            row.confidence = top.score >= 0.95 ? 0.95 : 0.75; usedOcc.add(o.type + o.id + o.due);
            row.reasons.push(`${o.type === 'sub' ? 'Abonnement' : 'Facture'} prévu${o.type === 'sub' ? '' : 'e'} « ${o.name} » du ${E.fmtDate(o.due)} : marqué payé${o.type === 'sub' ? '' : 'e'}, non déduit une 2ᵉ fois`);
            if (o.amount !== abs) { row.flags.push('price-change'); row.reasons.push(`Montant différent (${E.formatMoney(o.amount)} prévu) : changement de prix ?`); }
            rows.push(row); return;
          } else { row.flags.push('ambiguous'); row.reasons.push('Plusieurs factures/abonnements possibles : choisis lequel'); }
        }
        // retrait d'espèces
        if (WORDS.cash.test(lab)) { row.kind = 'cash'; row.category = 'divers'; row.confidence = 0.8; row.reasons.push('Retrait d’espèces : compté comme dépense (ne saisis pas aussi les achats en espèces)'); rows.push(row); return; }
        // dépense saisie à la main → fusion
        const man = state.expenses.filter(e => !e.bankKey && e.amount > 0 && !usedExp.has(e.id) && e.amount === abs && Math.abs(E.diffDays(e.date, date)) <= 4);
        if (man.length) {
          const ranked = man.map(e => ({ e, s: 1 - Math.abs(E.diffDays(e.date, date)) * 0.1 + (overlap(tx.label, e.desc || '') ? 0.2 : 0) })).sort((a, b) => b.s - a.s);
          row.candidates = ranked.slice(0, 3).map(r => ({ type: 'expense', id: r.e.id, date: r.e.date, amount: r.e.amount, name: r.e.desc || (state.categories.find(c => c.id === r.e.category) || {}).name || '' }));
          if (ranked.length === 1 || ranked[0].s - ranked[1].s >= 0.15) {
            row.kind = 'merge'; row.link = { type: 'expense', id: ranked[0].e.id }; row.category = ranked[0].e.category; row.confidence = 0.85; usedExp.add(ranked[0].e.id);
            row.reasons.push(`Correspond à ta dépense saisie le ${E.fmtDate(ranked[0].e.date)} : fusionnée, pas comptée deux fois`);
            rows.push(row); return;
          }
          row.flags.push('ambiguous'); row.reasons.push('Plusieurs dépenses saisies correspondent : choisis laquelle fusionner');
        }
        // règles et dictionnaires
        if (rule && rule.kind === 'bill') { row.kind = 'bill'; row.billCategory = rule.billCategory || 'Autre'; row.confidence = 0.9; row.reasons.push('Règle mémorisée'); }
        else if (rule && rule.cat) { row.category = rule.cat; row.confidence = 0.9; row.reasons.push('Règle mémorisée pour ce commerçant'); }
        else if (mk && state.expenses.some(e => e.mk === mk && e.category && e.category !== 'divers')) {
          const prev = state.expenses.filter(e => e.mk === mk && e.category !== 'divers'); row.category = prev[prev.length - 1].category; row.confidence = 0.8; row.reasons.push('Même commerçant déjà catégorisé');
        } else {
          const bh = BILL_HINTS.find(h => h.re.test(lab));
          if (bh) { row.kind = 'bill'; row.billCategory = bh.bc; row.confidence = 0.65; row.reasons.push(`Ressemble à une facture (${bh.bc}) : sera ajoutée comme facture payée`); }
          else if (SUB_NAMES.test(lab)) { row.category = 'abonnements'; row.confidence = 0.7; row.flags.push('sub-hint'); row.reasons.push('Service d’abonnement connu'); }
          else {
            const kw = KW.find(k => k.re.test(lab));
            if (kw) { row.category = kw.cat; row.confidence = 0.7; row.reasons.push('Catégorie déduite du libellé'); }
            else { row.category = 'divers'; row.confidence = 0.35; row.reasons.push('Catégorie inconnue'); }
          }
        }
      } else {
        // crédit
        const prior = state.expenses.filter(e => e.amount > 0 && E.diffDays(e.date, date) >= 0 && E.diffDays(e.date, date) <= 120 && ((e.mk && e.mk === mk) || (mk && overlap(tx.label, e.desc || ''))) && abs <= e.amount);
        if (WORDS.salary.test(lab) || (rule && rule.kind === 'income' && rule.salary)) { row.kind = 'income'; row.merchant = 'Salaire'; row.confidence = 0.9; row.reasons.push('Salaire reconnu'); }
        else if (prior.length && (WORDS.refund.test(lab) || prior.length === 1)) {
          const p = prior.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
          row.kind = 'refund'; row.category = p.category; row.link = { type: 'refund', id: p.id }; row.confidence = WORDS.refund.test(lab) ? 0.85 : 0.6;
          row.reasons.push(`Remboursement probable de ta dépense du ${E.fmtDate(p.date)} (${E.formatMoney(p.amount)})`);
          if (prior.length > 1) { row.flags.push('ambiguous'); row.candidates = prior.slice(0, 4).map(e => ({ type: 'refund', id: e.id, date: e.date, amount: e.amount, name: e.desc || '' })); }
        } else if (WORDS.refund.test(lab)) { row.kind = 'refund'; row.category = (rule && rule.cat) || 'divers'; row.confidence = 0.55; row.reasons.push('Remboursement ou retour : à rattacher à une dépense'); }
        else { row.kind = 'income'; row.confidence = 0.6; row.reasons.push('Crédit : compté comme revenu'); }
      }
      rows.push(row);
    });

    for (const r of rows) { if (r.kind === 'transfer') r.merchant = 'Virement interne'; else if (r.kind === 'cash') r.merchant = 'Retrait d’espèces'; else if (r.kind === 'cardPayment') r.merchant = 'Carte de crédit'; }
    // virements croisés (même montant, sens inverse, autre compte déjà importé)
    for (const r of rows) {
      if (r.kind !== 'income' && r.kind !== 'expense') continue;
      for (const imp of state.imports || []) {
        if (imp.account === parsed.account) continue;
        const hit = (imp.txs || []).find(t => t.a === -r.amount && Math.abs(E.diffDays(t.d, r.dateTx)) <= 3 && (t.t === 'expense' || t.t === 'income'));
        if (hit) { r.flags.push('maybe-transfer'); r.reasons.push(`Même montant en sens inverse le ${E.fmtDate(hit.d)} sur un autre compte importé : virement interne ?`); r.transferWith = hit.k; break; }
      }
    }
    // détection de paiements récurrents
    const recurring = detectRecurring(state, rows);
    for (const r of rows) if (recurring.some(x => x.mk === r.mk) && r.kind === 'expense') r.flags.push('recurring');
    for (const r of rows) if (r.flags.includes('sub-hint') && !recurring.some(x => x.mk === r.mk)) r.reasons.push('Un seul paiement : pas encore une preuve d’abonnement');
    for (const r of rows) r.uncertain = r.include && (r.confidence < 0.6 || r.flags.some(f => ['sign-unknown', 'balance-mismatch', 'foreign-currency', 'ocr', 'ambiguous', 'maybe-transfer', 'year-inferred'].includes(f)));
    return { rows, recurring, summary: summarize(rows), bank: parsed.bank, account: parsed.account, period: parsed.period, warnings: parsed.warnings, ocr: parsed.ocr };
  }

  function summarize(rows) {
    const inc = rows.filter(r => r.include);
    return {
      total: rows.length, included: inc.length,
      debits: sum(rows.filter(r => r.amount < 0), r => -r.amount), credits: sum(rows.filter(r => r.amount > 0), r => r.amount),
      uncertain: rows.filter(r => r.uncertain).length, duplicates: rows.filter(r => r.dupOf).length,
      merges: rows.filter(r => r.kind === 'merge').length, transfers: rows.filter(r => r.kind === 'transfer').length,
    };
  }

  // ---------- Détection de paiements récurrents ----------
  function median(a) { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
  function classifyInterval(days) {
    if (days >= 6 && days <= 8) return 'weekly'; if (days >= 26 && days <= 35) return 'monthly'; if (days >= 84 && days <= 98) return 'quarterly';
    if (days >= 170 && days <= 200) return 'semiannual'; if (days >= 350 && days <= 380) return 'annual'; return null;
  }
  function detectRecurring(state, rows) {
    const groups = new Map();
    const add = (mk, date, amount, name) => { if (!mk) return; if (!groups.has(mk)) groups.set(mk, { mk, name, occ: [] }); groups.get(mk).occ.push({ date, amount }); };
    for (const e of state.expenses) if (e.mk && e.amount > 0) add(e.mk, e.date, e.amount, e.desc);
    for (const r of rows) if (r.include && (r.kind === 'expense') && r.direction === 'debit') add(r.mk, r.date, r.abs, r.merchant);
    const out = [];
    for (const g of groups.values()) {
      const rule = state.rules && state.rules[g.mk]; if (rule && rule.noSub) continue;
      // Courses, essence, restaurants… reviennent régulièrement sans être des abonnements.
      if (!SUB_NAMES.test(g.mk) && KW.some(k => k.re.test(g.mk) && ['courses', 'essence', 'restaurants', 'transport', 'sante', 'shopping'].includes(k.cat))) continue;
      if ((state.subs || []).some(s => s.status !== 'cancelled' && (norm(s.name).includes(g.mk) || (g.mk && norm(g.mk).split(' ')[0] && norm(s.name).includes(norm(g.mk).split(' ')[0]))))) continue;
      const seenD = new Set(); const occ = g.occ.filter(o => !seenD.has(o.date + o.amount) && seenD.add(o.date + o.amount)).sort((a, b) => (a.date < b.date ? -1 : 1));
      const months = new Set(occ.map(o => o.date.slice(0, 7)));
      if (occ.length < 2 || (months.size < 2 && occ.length < 3)) continue;
      const med = median(occ.map(o => o.amount));
      if (!occ.every(o => Math.abs(o.amount - med) <= Math.max(100, med * 0.1))) continue;
      const gaps = occ.slice(1).map((o, i) => E.diffDays(occ[i].date, o.date)), f = classifyInterval(median(gaps));
      if (!f || !gaps.every(x => classifyInterval(x) === f || (f === 'monthly' && x >= 24 && x <= 38))) continue;
      if (f === 'weekly' && occ.length < 3) continue;
      const last = occ[occ.length - 1], spec = E.SUB_FREQ[f];
      const day = Math.max(...occ.map(o => +o.date.slice(8, 10)));
      const next = spec.days ? E.addDays(last.date, spec.days) : E.addMonthsClamp(last.date, spec.months, day);
      out.push({ mk: g.mk, name: g.name || g.mk, amount: last.amount, freq: f, occurrences: occ, count: occ.length, confidence: occ.length >= 3 ? 'probable' : 'possible', lastPaid: last.date, firstDate: occ[0].date, nextDue: next });
    }
    return out.sort((a, b) => b.count - a.count);
  }
  // Création d'un abonnement à partir d'une détection : confirmation requise (appelée par l'interface).
  // L'historique reste en dépenses ; l'abonnement ne génère que les échéances FUTURES (pas de double comptage).
  function subFromDetection(state, d, today) {
    const spec = E.SUB_FREQ[d.freq], day = +d.lastPaid.slice(8, 10);
    let next = d.nextDue;
    for (let k = 0; next < today && k < 1000; k++) next = spec.days ? E.addDays(next, spec.days) : E.addMonthsClamp(next, spec.months, day);
    return E.addSub(state, { name: d.name, amount: d.amount, freq: d.freq, startDate: d.firstDate, nextDue: next, category: 'Abonnement', notes: `Détecté depuis ${d.count} paiements (${E.fmtDate(d.firstDate)} → ${E.fmtDate(d.lastPaid)}).` });
  }

  // ---------- Application ----------
  const monthsOf = (state, rows) => [...new Set(rows.filter(r => r.include).map(r => E.periodOf(state, r.date)))].sort();
  function applyPreview(state, preview, ctx = {}) {
    const today = ctx.today || E.localDateStr();
    const res = { created: { expenses: 0, incomes: 0, bills: 0, refunds: 0 }, paid: { bills: 0, subs: 0 }, merged: 0, transfers: 0, ignored: 0, duplicates: 0, errors: [], byCategory: {}, expenseTotal: 0, incomeTotal: 0, months: [] };
    const compact = [], keys = [];
    for (const r of preview.rows) {
      if (r.dupOf && !r.forceInclude) { res.duplicates++; continue; }
      if (!r.include) { res.ignored++; continue; }
      let t = 'ignored', entity = null;
      try {
        const amt = Math.abs(r.amount);
        switch (r.kind) {
          case 'expense': case 'cash': case 'cardPayment': {
            if (r.link && r.link.type === 'cardSettle') { t = 'transfer'; res.transfers++; break; }
            const e = E.addExpense(state, { amount: amt, category: r.category, date: r.date, desc: r.merchant, method: r.method || (r.kind === 'cash' ? 'Espèces' : 'Carte') });
            Object.assign(e, { bankKey: r.key, mk: r.mk, src: 'import', bankLabel: r.label, bankDate: r.dateTx }); entity = e.id; t = 'expense';
            res.created.expenses++; res.expenseTotal += amt; res.byCategory[r.category] = (res.byCategory[r.category] || 0) + amt; break;
          }
          case 'income': {
            const i = E.addIncome(state, { type: 'oneoff', name: r.merchant || 'Revenu', amount: amt, date: r.date, desc: r.label });
            i.bankKey = r.key; entity = i.id; t = 'income'; res.created.incomes++; res.incomeTotal += amt; break;
          }
          case 'refund': {
            const ex = r.link && r.link.id ? state.expenses.find(e => e.id === r.link.id) : null;
            const e = E.addRefund(state, { amount: amt, category: ex ? ex.category : r.category, date: r.date, desc: 'Remboursement · ' + r.merchant, refundOf: ex ? ex.id : null });
            Object.assign(e, { bankKey: r.key, mk: r.mk, src: 'import', bankLabel: r.label }); entity = e.id; t = 'refund';
            res.created.refunds++; res.expenseTotal -= amt; res.byCategory[e.category] = (res.byCategory[e.category] || 0) - amt; break;
          }
          case 'bill': {
            const b = E.addBill(state, { type: 'oneoff', name: r.merchant, category: r.billCategory || 'Autre', amount: amt, date: r.date });
            b.paidDate = r.date; b.bankKey = r.key; entity = b.id; t = 'bill'; res.created.bills++; res.expenseTotal += amt; res.byCategory['_bills'] = (res.byCategory['_bills'] || 0) + amt; break;
          }
          case 'billPayment': {
            const b = state.bills.find(x => x.id === r.link.id); if (!b) throw new Error('Facture introuvable');
            E.setBillPaid(b, r.link.ym, r.date); (b.paidRef = b.paidRef || {})[r.link.ym] = r.key; entity = b.id; t = 'bill'; res.paid.bills++; break;
          }
          case 'subPayment': {
            const s = state.subs.find(x => x.id === r.link.id); if (!s) throw new Error('Abonnement introuvable');
            E.setSubPaid(s, r.link.due, r.date); (s.paidRef = s.paidRef || {})[r.link.due] = r.key;
            if (r.link.amount !== amt && r.acceptPriceChange) E.changeSubPrice(s, r.link.due, amt);
            entity = s.id; t = 'sub'; res.paid.subs++; break;
          }
          case 'merge': {
            const e = state.expenses.find(x => x.id === r.link.id); if (!e) throw new Error('Dépense introuvable');
            Object.assign(e, { bankKey: r.key, mk: r.mk, bankLabel: r.label, bankDate: r.dateTx, src: e.src || 'manual+bank' }); entity = e.id; t = 'merge'; res.merged++; break;
          }
          case 'transfer': t = 'transfer'; res.transfers++; break;
          default: res.ignored++; continue;
        }
      } catch (err) { res.errors.push(`${r.label.slice(0, 40)} : ${err.message}`); continue; }
      keys.push(r.key);
      compact.push({ k: r.key, k2: r.k2, d: r.dateTx, a: r.amount, t, e: entity, mk: r.mk });
      // règles mémorisées (catégorie validée)
      if (r.mk && ['expense', 'cash', 'income', 'bill'].includes(r.kind) && !ctx.noLearn) {
        const prev = state.rules[r.mk] || {};
        if (r.kind === 'bill') state.rules[r.mk] = { ...prev, kind: 'bill', billCategory: r.billCategory, name: r.merchant };
        else if (r.kind === 'income') state.rules[r.mk] = { ...prev, kind: 'income', name: r.merchant };
        else if (r.kind === 'expense' && r.category !== 'divers' || (prev.cat && r.kind === 'expense')) state.rules[r.mk] = { ...prev, cat: r.category, kind: 'expense', name: r.merchant };
      }
    }
    res.months = monthsOf(state, preview.rows);
    const rec = { id: E.uid(), at: ctx.at || new Date().toISOString(), fileName: ctx.fileName || '', bank: preview.bank, account: preview.account, period: preview.period, ocr: !!preview.ocr,
      counts: { imported: compact.length, expenses: res.created.expenses, incomes: res.created.incomes, merged: res.merged, paid: res.paid.bills + res.paid.subs, duplicates: res.duplicates, ignored: res.ignored },
      errors: res.errors.concat(preview.warnings || []), txs: compact, hash: ctx.hash || null, hasPdf: !!ctx.hasPdf };
    state.imports.push(rec); state.importKeys.push(...keys);
    res.record = rec;
    return res;
  }
  // Impact sur le budget des mois touchés (avant/après).
  function importImpact(before, after, months, today) {
    return months.map(ym => ({ ym, before: E.computeMonth(before, ym, today), after: E.computeMonth(after, ym, today) }));
  }
  function deleteImportHistory(state, { keepKeys = true } = {}) {
    if (!keepKeys) state.importKeys = [];
    state.imports = [];
  }
  // Annule une importation : retire ce qu'elle a créé et rouvre les paiements rapprochés.
  function undoImport(state, importId) {
    const rec = state.imports.find(i => i.id === importId); if (!rec) throw new Error('Import introuvable');
    for (const t of rec.txs) {
      if (t.t === 'expense' || t.t === 'refund') state.expenses = state.expenses.filter(e => e.id !== t.e);
      else if (t.t === 'income') state.incomes = state.incomes.filter(e => e.id !== t.e);
      else if (t.t === 'bill') { const b = state.bills.find(x => x.id === t.e); if (b) { if (b.type === 'oneoff' && b.bankKey === t.k) state.bills = state.bills.filter(x => x !== b); else for (const [ym, k] of Object.entries(b.paidRef || {})) if (k === t.k) { E.setBillPaid(b, ym, null); delete b.paidRef[ym]; } } }
      else if (t.t === 'sub') { const s = state.subs.find(x => x.id === t.e); if (s) for (const [due, k] of Object.entries(s.paidRef || {})) if (k === t.k) { E.setSubPaid(s, due, null); delete s.paidRef[due]; } }
      else if (t.t === 'merge') { const e = state.expenses.find(x => x.id === t.e); if (e) { delete e.bankKey; delete e.bankLabel; delete e.bankDate; } }
    }
    const ks = new Set(rec.txs.map(t => t.k));
    state.importKeys = state.importKeys.filter(k => !ks.has(k));
    state.imports = state.imports.filter(i => i.id !== importId);
  }
  // Empreinte simple du texte d'un relevé (détection de réimportation du même fichier).
  function hashText(s) { let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); }

  return { textToLines, itemsToLines, parseStatement, parseAmountCell, parseDateCell, merchantKey, merchantName, cleanLabel, detectBank, buildPreview, summarize, detectRecurring, subFromDetection,
    applyPreview, importImpact, deleteImportHistory, undoImport, hashText, KW, WORDS };
});
