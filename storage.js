/* Marvel Battleworld – salvataggio sul dispositivo (IndexedDB).
   Quando l'app è aperta dal sito (Vercel/GitHub) e non da claude.ai, questo file
   fornisce window.claude.use('db' | 'assets' | 'downloads') con la stessa interfaccia
   usata dall'app: carte, mazzi, regolamento, immagini e PDF restano salvati sul dispositivo
   e funzionano anche senza connessione. */
(() => {
  if (window.claude && window.claude.use) return; /* dentro claude.ai: usa il database vero */
  window.__BW_LOCAL = true;

  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('battleworld', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs');
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  let dbp = null;
  const getDb = () => dbp || (dbp = open());
  const tx = async (store, mode, fn) => {
    const db = await getDb();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode), req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('abort'));
    });
  };
  const readAll = async store => {
    const db = await getDb();
    return new Promise((res, rej) => {
      const m = {}, t = db.transaction(store, 'readonly'), c = t.objectStore(store).openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { m[cur.key] = cur.value; cur.continue(); } };
      t.oncomplete = () => res(m); t.onerror = () => rej(t.error);
    });
  };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const err = (code, message) => Object.assign(new Error(message || code), {code});

  /* ---------- documenti ---------- */
  let cache = null, loading = null;
  const load = () => cache ? Promise.resolve(cache) : (loading || (loading = readAll('docs').then(m => (cache = m))));
  const subs = new Set();
  let pending = false;
  const notify = () => {
    if (pending) return; pending = true;
    setTimeout(() => { pending = false; [...subs].forEach(s => { try { s(); } catch (e) { console.error(e); } }); }, 0);
  };
  const isDoc = p => p.split('/').length % 2 === 0;
  const norm = p => String(p || '').replace(/^\/+|\/+$/g, '');
  const put = async (path, data) => {
    await load(); const v = clone(data || {});
    await tx('docs', 'readwrite', s => s.put(v, path)); cache[path] = v; notify();
  };
  const del = async path => {
    await load();
    await tx('docs', 'readwrite', s => s.delete(path)); delete cache[path]; notify();
  };
  const upd = async (path, patch) => {
    await load();
    if (!cache[path]) throw err('not_found', 'Documento inesistente: ' + path);
    const v = Object.assign({}, cache[path], clone(patch || {}));
    await tx('docs', 'readwrite', s => s.put(v, path)); cache[path] = v; notify();
  };
  const docSnap = path => ({id: path.split('/').pop(), exists: Object.prototype.hasOwnProperty.call(cache, path), data: () => clone(cache[path]), metadata: {fromCache: false}});
  const collSnap = path => {
    const pre = path + '/', docs = Object.keys(cache)
      .filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
      .map(k => ({id: k.slice(pre.length), exists: true, data: () => clone(cache[k])}));
    return {docs, size: docs.length, empty: !docs.length, metadata: {fromCache: false}, forEach: f => docs.forEach(f)};
  };
  const listen = (make, cb, onErr) => {
    let on = true;
    const run = () => { if (!on) return; load().then(() => { if (on) cb(make()); }).catch(e => onErr && onErr(e)); };
    subs.add(run); run();
    return () => { on = false; subs.delete(run); };
  };
  const docRef = path => {
    path = norm(path);
    if (!isDoc(path)) throw err('invalid_path', 'Percorso documento non valido: ' + path);
    return {
      id: path.split('/').pop(), path,
      get: () => load().then(() => docSnap(path)),
      set: d => put(path, d),
      update: d => upd(path, d),
      delete: () => del(path),
      onSnapshot: (cb, onErr) => listen(() => docSnap(path), cb, onErr)
    };
  };
  const collRef = path => {
    path = norm(path);
    if (isDoc(path)) throw err('invalid_path', 'Percorso collezione non valido: ' + path);
    return {
      id: path.split('/').pop(), path,
      doc: id => docRef(path + '/' + (id || Math.random().toString(36).slice(2, 12))),
      add: async d => { const r = docRef(path + '/' + Math.random().toString(36).slice(2, 12)); await r.set(d); return r; },
      get: () => load().then(() => collSnap(path)),
      onSnapshot: (cb, onErr) => listen(() => collSnap(path), cb, onErr)
    };
  };
  const DB = {doc: docRef, collection: collRef};

  /* ---------- immagini e PDF ---------- */
  const urls = {};
  const newId = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
  window.__bwAsset = id => urls[id] || '';
  let assetsReady = null;
  const loadAssets = () => assetsReady || (assetsReady = readAll('blobs').then(m => {
    Object.entries(m).forEach(([id, b]) => { if (b) urls[id] = URL.createObjectURL(b); });
  }));
  const ASSETS = {
    upload: async (blob, opts) => {
      if (!(blob instanceof Blob)) throw err('invalid_input', 'File non valido');
      const type = (opts && opts.type) || blob.type || 'application/octet-stream';
      const b = blob.type === type ? blob : new Blob([blob], {type});
      const id = newId();
      try { await tx('blobs', 'readwrite', s => s.put(b, id)); }
      catch (e) { throw err('quota_exceeded', 'Spazio esaurito sul dispositivo'); }
      urls[id] = URL.createObjectURL(b);
      return {id, url: urls[id], sizeBytes: b.size, contentType: type};
    },
    delete: async id => {
      await tx('blobs', 'readwrite', s => s.delete(id));
      if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
    },
    list: async () => {
      const m = await readAll('blobs'); let used = 0;
      const assets = Object.entries(m).map(([id, b]) => { used += b.size; return {id, url: urls[id] || '', sizeBytes: b.size, contentType: b.type}; });
      return {assets, usage: {usedBytes: used}};
    }
  };

  /* ---------- download ---------- */
  const DL = {
    save: async ({filename, data, mimeType}) => {
      const blob = data instanceof Blob ? data : new Blob([data], {type: mimeType || 'application/octet-stream'});
      const file = filename || 'file';
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      if (ios && navigator.canShare) {
        try {
          const f = new File([blob], file, {type: blob.type || 'application/octet-stream'});
          if (navigator.canShare({files: [f]})) { await navigator.share({files: [f], title: file}); return {saved: true}; }
        } catch (e) { if (e && e.name === 'AbortError') throw err('declined', 'Annullato'); }
      }
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = file; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      return {saved: true};
    }
  };

  const ok = v => Promise.resolve(v);
  window.claude = Object.freeze({
    use: n => {
      if (n === 'db') return load().then(() => DB, () => null);
      if (n === 'assets') return loadAssets().then(() => ASSETS, () => null);
      if (n === 'downloads') return ok(DL);
      return ok(null);
    }
  });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
