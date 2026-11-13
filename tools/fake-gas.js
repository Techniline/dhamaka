/* In-memory stand-ins for the Google Apps Script services that Code.gs uses,
 * so the backend can run in Node for tests and for the local test server.
 *   const gas = loadBackend();   gas.doGet({ parameter: {...} })   gas.doPost({ postData: { contents } })
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeServices(opts = {}) {
  const props = new Map(Object.entries(opts.props || {}));
  const cache = new Map();
  const files = new Map();
  let lockHeld = false;
  const stats = { propReads: 0, propWrites: 0, lockWaits: 0 };
  const now = () => Date.now();

  const scriptProps = {
    getProperty: (k) => { stats.propReads++; return props.has(k) ? props.get(k) : null; },
    setProperty: (k, v) => { stats.propWrites++; if (String(v).length > 9 * 1024) throw new Error('Value too large for Script Properties: ' + k); props.set(k, String(v)); return scriptProps; },
    setProperties: (o) => { Object.keys(o).forEach((k) => scriptProps.setProperty(k, o[k])); return scriptProps; },
    deleteProperty: (k) => { stats.propWrites++; props.delete(k); return scriptProps; },
    getProperties: () => { stats.propReads++; return Object.fromEntries(props); },
    getKeys: () => [...props.keys()],
  };
  const scriptCache = {
    get: (k) => { const e = cache.get(k); if (!e) return null; if (e.exp < now()) { cache.delete(k); return null; } return e.v; },
    put: (k, v, secs) => { if (String(v).length > 100 * 1024) throw new Error('Cache value too large'); cache.set(k, { v: String(v), exp: now() + (secs || 600) * 1000 }); },
    remove: (k) => cache.delete(k),
  };
  const lock = {
    tryLock: () => { if (lockHeld) { stats.lockWaits++; return false; } lockHeld = true; return true; },
    waitLock: () => { if (lockHeld) throw new Error('Lock timeout'); lockHeld = true; },
    releaseLock: () => { lockHeld = false; },
    hasLock: () => lockHeld,
  };

  function blob(bytes, mime, name) {
    return { bytes, mime, name, getBytes: () => bytes, getContentType: () => mime, getName: () => name, setName(n) { this.name = n; return this; }, getDataAsString: () => Buffer.from(bytes).toString('utf8') };
  }
  function folder(id, name) {
    return {
      getId: () => id, getUrl: () => 'https://drive.google.com/drive/folders/' + id, getName: () => name, setName: (n) => { name = n; },
      createFile: (b) => { const fid = 'drv_' + crypto.randomBytes(8).toString('hex'); files.set(fid, { blob: b, trashed: false, sharing: 'private' }); return file(fid); },
      createFolder: (n) => folder('fld_' + crypto.randomBytes(4).toString('hex'), n),
      getFoldersByName: () => ({ hasNext: () => false }),
      getFilesByName: () => ({ hasNext: () => false }),
    };
  }
  function file(fid) {
    const f = files.get(fid);
    if (!f) throw new Error('No item with the given ID could be found');
    return {
      getId: () => fid,
      setSharing: (a) => { f.sharing = a; },
      setTrashed: (t) => { f.trashed = t; },
      setName: () => {},
      getBlob: () => f.blob,
      moveTo: () => {},
    };
  }
  const folders = new Map();
  const DriveApp = {
    Access: { ANYONE_WITH_LINK: 'anyone', PRIVATE: 'private' },
    Permission: { VIEW: 'view', NONE: 'none' },
    createFolder: (n) => { const fo = folder('fld_' + crypto.randomBytes(4).toString('hex'), n); folders.set(fo.getId(), fo); return fo; },
    getFolderById: (id) => { if (!folders.has(id)) throw new Error('Not found'); return folders.get(id); },
    getFileById: (id) => file(id),
  };

  const Utilities = {
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)),
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    newBlob: (bytes, mime, name) => blob(bytes, mime, name),
    getUuid: () => crypto.randomUUID(),
    formatDate: (d, tz, fmt) => d.toISOString(),
    computeDigest: (alg, text) => Array.from(crypto.createHash('sha1').update(text).digest()).map((b) => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_1: 'sha1', SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
  };
  const ContentService = {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ text: t, setMimeType() { return this; }, getContent() { return this.text; } }),
  };
  const fetchLog = [];
  const UrlFetchApp = { fetch: (url, o) => { fetchLog.push({ url, o }); return { getContentText: () => '{"result":"ok"}', getResponseCode: () => 200, getBlob: () => blob([], 'image/jpeg', 'x.jpg') }; } };
  const triggers = [];
  const ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } }) }) }),
  };
  const logs = [];
  return {
    PropertiesService: { getScriptProperties: () => scriptProps },
    CacheService: { getScriptCache: () => scriptCache },
    LockService: { getScriptLock: () => lock },
    DriveApp, Utilities, ContentService, UrlFetchApp, ScriptApp,
    Logger: { log: (m) => logs.push(String(m)) },
    console: { log: () => {}, error: () => {}, warn: () => {} },
    _: { props, cache, files, stats, lock, logs, fetchLog, setLockHeld: (v) => { lockHeld = v; } },
  };
}

function loadBackend(opts = {}) {
  const services = makeServices(opts);
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  const ctx = vm.createContext({ ...services, JSON, Math, Date, String, Number, Object, Array, Error, RegExp, Boolean, isNaN, parseInt });
  vm.runInContext(src, ctx, { filename: 'Code.gs' });
  const call = (fn) => JSON.parse(fn.getContent());
  return {
    ctx,
    _: services._,
    get: (params) => call(ctx.doGet({ parameter: params || {} })),
    post: (body) => call(ctx.doPost({ postData: { contents: JSON.stringify(body) } })),
  };
}

module.exports = { makeServices, loadBackend };
