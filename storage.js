/* Storage locale su IndexedDB: sostituisce il database della pagina.
   Espone window.claude.use('db') con la stessa interfaccia usata dall'app. */
(() => {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('battleworld', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  let dbp, cache = null; const subs = [];
  const getDb = () => dbp || (dbp = open());
  const tx = async (mode, fn) => { const db = await getDb(); return new Promise((res, rej) => { const t = db.transaction('docs', mode); const out = fn(t.objectStore('docs')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  async function load() {
    if (cache) return cache;
    const db = await getDb();
    cache = await new Promise((res, rej) => {
      const m = {}, t = db.transaction('docs', 'readonly'), c = t.objectStore('docs').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { m[cur.key] = cur.value; cur.continue(); } };
      t.oncomplete = () => res(m); t.onerror = () => rej(t.error);
    });
    return cache;
  }
  const notify = () => subs.forEach(s => s());
  const snapOf = prefix => ({ docs: Object.keys(cache).filter(k => k.startsWith(prefix + '/')).map(k => ({ id: k.slice(prefix.length + 1), data: () => cache[k] })), metadata: { fromCache: false } });
  const put = async (path, data) => { await load(); cache[path] = JSON.parse(JSON.stringify(data)); await tx('readwrite', s => s.put(cache[path], path)); notify(); };
  const del = async path => { await load(); delete cache[path]; await tx('readwrite', s => s.delete(path)); notify(); };
  const listen = (fn) => { const run = () => load().then(fn); subs.push(run); run(); };
  const DB = {
    collection: name => ({
      doc: id => ({ set: d => put(name + '/' + id, d), delete: () => del(name + '/' + id) }),
      onSnapshot: cb => listen(() => cb(snapOf(name)))
    }),
    doc: path => ({
      set: d => put(path, d),
      onSnapshot: cb => listen(() => cb({ exists: !!cache[path], data: () => cache[path] }))
    })
  };
  window.claude = { use: n => n === 'db' ? Promise.resolve(DB) : Promise.reject(new Error('n/a')) };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
