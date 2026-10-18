/* Extraction locale de texte depuis un PDF (pdf.js) avec repli OCR (tesseract.js) pour les scans.
   Rien n'est envoyé hors de l'appareil : bibliothèques et données de langue sont embarquées dans /vendor. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./importer.js'));
  else root.PdfExtract = factory(root.Importer);
})(typeof self !== 'undefined' ? self : this, function (Importer) {
  'use strict';

  class PdfError extends Error { constructor(code, message) { super(message); this.code = code; } }

  // Sépare les longues suites d'espaces à l'intérieur d'un élément (colonnes rendues dans une même chaîne).
  function splitWide(items) {
    const out = [];
    for (const it of items) {
      if (!/\s{3,}/.test(it.str)) { out.push(it); continue; }
      const cw = (it.w || 5 * it.str.length) / it.str.length; const re = /\S+(?: ?\S+)*/g; let m;
      while ((m = re.exec(it.str))) out.push({ ...it, str: m[0], x: it.x + m.index * cw, w: m[0].length * cw });
    }
    return out;
  }

  async function openDocument(bytes, pdfjs, onPassword) {
    const task = pdfjs.getDocument({ data: bytes.slice(0), isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
    let tries = 0, aborted = null;
    task.onPassword = async (update, reason) => {
      let pw = null;
      if (++tries > 3) { aborted = 'Mot de passe incorrect.'; task.destroy().catch(() => {}); return; }
      try { pw = await (onPassword ? onPassword(reason === 2) : null); } catch { pw = null; }
      if (pw == null) { aborted = 'Mot de passe non fourni.'; task.destroy().catch(() => {}); return; }
      update(pw);                       // le mot de passe n'est ni stocké ni réutilisé
    };
    try { const doc = await task.promise; doc._task = task; return doc; }
    catch (e) {
      if (aborted) throw new PdfError('password', aborted);
      if (e && e.name === 'PasswordException') throw new PdfError('password', e.code === 2 ? 'Mot de passe incorrect.' : 'Ce PDF est protégé par un mot de passe.');
      if (e && /Invalid PDF|InvalidPDF|Missing PDF|format/i.test(String(e.name + e.message))) throw new PdfError('invalid', 'Fichier illisible : ce n’est pas un PDF valide.');
      if (e && /destroyed/i.test(String(e.message))) throw new PdfError('password', 'Mot de passe non fourni.');
      throw new PdfError('read', 'Lecture du PDF impossible : ' + (e && e.message || e));
    }
  }

  async function extractText(doc) {
    const pages = []; let chars = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p), tc = await page.getTextContent();
      const items = tc.items.filter(i => typeof i.str === 'string').map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) }));
      chars += items.reduce((a, i) => a + i.str.replace(/\s/g, '').length, 0);
      pages.push(Importer.itemsToLines(splitWide(items), p));
    }
    return { lines: pages.flat(), chars };
  }

  // opts : { pdfjs, onPassword(wrong)->Promise<string|null>, ocr: async (doc, onProgress)->lines, onProgress(msg) }
  async function extractPdf(bytes, opts) {
    const doc = await openDocument(bytes, opts.pdfjs, opts.onPassword);
    try {
      if (opts.onProgress) opts.onProgress('Lecture du texte…');
      const t = await extractText(doc);
      const looksEmpty = t.chars < 40 * doc.numPages || !t.lines.some(l => l.cells.some(c => Importer.parseAmountCell(c.text)));
      if (!looksEmpty) return { lines: t.lines, ocr: false, pages: doc.numPages };
      if (!opts.ocr) throw new PdfError('scan', 'Ce PDF ne contient pas de texte (scan). L’OCR n’est pas disponible.');
      if (opts.onProgress) opts.onProgress('PDF scanné : reconnaissance du texte (OCR)…');
      let lines;
      try { lines = await opts.ocr(doc, opts.onProgress); }
      catch (e) { throw new PdfError('ocr', 'La reconnaissance du texte (OCR) a échoué : ' + (e && e.message || e)); }
      if (!lines.length) throw new PdfError('ocr', 'Aucun texte reconnu : la qualité du scan est insuffisante.');
      return { lines, ocr: true, pages: doc.numPages };
    } finally { try { await (doc._task ? doc._task.destroy() : doc.cleanup()); } catch { /* ignore */ } }
  }

  // ---------- OCR (navigateur) ----------
  function wordsOf(data) {
    if (data.words && data.words.length) return data.words;
    const w = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const x of l.words || []) w.push(x);
    return w;
  }
  function makeBrowserOcr(base) {
    let worker = null;
    return async function ocr(doc, onProgress) {
      if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('bibliothèque OCR introuvable')); document.head.appendChild(s); });
      if (!worker) worker = await window.Tesseract.createWorker(['fra', 'eng'], 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true, workerBlobURL: false, cacheMethod: 'none' });
      const lines = [], SCALE = 2.4;
      for (let p = 1; p <= doc.numPages; p++) {
        if (onProgress) onProgress(`OCR : page ${p} / ${doc.numPages}…`);
        const page = await doc.getPage(p), vp = page.getViewport({ scale: SCALE });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
        const { data } = await worker.recognize(canvas, {}, { blocks: true });
        const items = wordsOf(data).filter(w => w.text && w.text.trim()).map(w => ({ str: w.text, x: w.bbox.x0 / SCALE, y: -((w.bbox.y0 + w.bbox.y1) / 2) / SCALE, w: (w.bbox.x1 - w.bbox.x0) / SCALE, h: (w.bbox.y1 - w.bbox.y0) / SCALE }));
        lines.push(...Importer.itemsToLines(items, p));
        canvas.width = canvas.height = 0;
      }
      return lines;
    };
  }
  async function loadPdfjs(base) {
    const lib = await import(new URL(base + 'pdf.min.mjs', document.baseURI).href);   // URL absolue : un chemin relatif nu serait pris pour un module npm
    lib.GlobalWorkerOptions.workerSrc = new URL(base + 'pdf.worker.min.mjs', document.baseURI).href;
    return lib;
  }
  return { PdfError, extractPdf, makeBrowserOcr, loadPdfjs, splitWide };
});
