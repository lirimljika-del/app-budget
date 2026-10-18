/* Persistance (IndexedDB), sauvegardes automatiques internes, verrouillage PIN / Face ID. */
(function () {
  'use strict';
  const DB_NAME = 'budget-perso', DB_VER = 2;
  let dbp = null;

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponible'));
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => { const db = r.result; for (const n of ['kv', 'backups', 'pdfs']) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const get = (store, key) => tx(store, 'readonly', s => s.get(key));
  const put = (store, key, val) => tx(store, 'readwrite', s => { s.put(val, key); });
  const del = (store, key) => tx(store, 'readwrite', s => { s.delete(key); });
  const keys = store => tx(store, 'readonly', s => s.getAllKeys());

  // Repli localStorage si IndexedDB est indisponible (navigation privée, etc.)
  let useLS = false;
  async function kvGet(k) {
    if (!useLS) { try { return await get('kv', k); } catch { useLS = true; } }
    try { return JSON.parse(localStorage.getItem('bp:' + k)); } catch { return undefined; }
  }
  async function kvPut(k, v) {
    if (!useLS) { try { return await put('kv', k, v); } catch { useLS = true; } }
    localStorage.setItem('bp:' + k, JSON.stringify(v));
  }

  const Store = {
    async load() { return (await kvGet('state')) || null; },
    async save(state) { await kvPut('state', JSON.parse(JSON.stringify(state))); },

    // Sauvegardes internes : 1 par jour (14 jours) + instantanés avant import / réinitialisation.
    async autoBackup(state, today) {
      if (useLS) return;
      try {
        const k = 'auto-' + today;
        if (await get('backups', k)) return;
        await put('backups', k, { at: new Date().toISOString(), data: JSON.parse(JSON.stringify(state)) });
        const autos = (await keys('backups')).filter(x => String(x).startsWith('auto-')).sort();
        for (const old of autos.slice(0, Math.max(0, autos.length - 14))) await del('backups', old);
      } catch (e) { console.warn('autoBackup', e); }
    },
    async snapshot(state, label) {
      if (useLS) return;
      try {
        const k = 'snap-' + Date.now() + '-' + label;
        await put('backups', k, { at: new Date().toISOString(), label, data: JSON.parse(JSON.stringify(state)) });
        const snaps = (await keys('backups')).filter(x => String(x).startsWith('snap-')).sort();
        for (const old of snaps.slice(0, Math.max(0, snaps.length - 10))) await del('backups', old);
      } catch (e) { console.warn('snapshot', e); }
    },
    async listBackups() {
      if (useLS) return [];
      const ks = (await keys('backups')).sort().reverse();
      const out = [];
      for (const k of ks) { const v = await get('backups', k); out.push({ key: k, at: v.at, label: v.label || 'auto', data: v.data }); }
      return out;
    },
    // PDF originaux (facultatif, désactivé par défaut) : jamais inclus dans l'export JSON.
    async putPdf(id, bytes) { await put('pdfs', id, bytes); },
    async getPdf(id) { return get('pdfs', id); },
    async delPdf(id) { await del('pdfs', id); },
    async clearPdfs() { const ks = await keys('pdfs'); for (const k of ks) await del('pdfs', k); },
    async persist() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; } },
    get usingFallback() { return useLS; },

    // ----- Verrouillage -----
    async getLock() { return (await kvGet('lock')) || null; },
    async setLock(l) { if (l) await kvPut('lock', l); else await kvPut('lock', null); },
  };

  const enc = new TextEncoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function hashPin(pin, saltB64) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 150000, hash: 'SHA-256' }, key, 256);
    return b64(bits);
  }
  const Lock = {
    async setPin(pin) {
      const prev = (await Store.getLock()) || {};
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      await Store.setLock({ ...prev, salt, hash: await hashPin(pin, salt) });
    },
    async checkPin(pin) {
      const l = await Store.getLock();
      return !!(l && l.hash && (await hashPin(pin, l.salt)) === l.hash);
    },
    async remove() { await Store.setLock(null); },
    async enabled() { const l = await Store.getLock(); return !!(l && l.hash); },
    faceSupported: async () => !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)),
    async hasFace() { const l = await Store.getLock(); return !!(l && l.credId); },
    // Face ID / Touch ID via WebAuthn (authentificateur de plateforme). Garde locale : voir README.
    async enableFace() {
      const l = await Store.getLock(); if (!l) throw new Error('Définis d’abord un code PIN');
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Budget' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'moi', displayName: 'Moi' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
      } });
      await Store.setLock({ ...l, credId: b64(cred.rawId) });
    },
    async disableFace() { const l = await Store.getLock(); if (l) { delete l.credId; await Store.setLock(l); } },
    async checkFace() {
      const l = await Store.getLock(); if (!l || !l.credId) return false;
      try {
        await navigator.credentials.get({ publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: unb64(l.credId), transports: ['internal'] }],
          userVerification: 'required', timeout: 60000,
        } });
        return true;
      } catch { return false; }
    },
  };

  window.Store = Store;
  window.Lock = Lock;
})();
