/**
 * Roshni · Techniline Electronics Diwali Night: backend (Google Apps Script).
 *
 * Three jobs, one script:
 *  1. Photo album (from the Capture the Moment kit): guests' framed photos go
 *     straight from the phone to Cloudinary and register here (Google Drive if
 *     Cloudinary can't be reached). New photos wait for approval in admin.html
 *     unless Auto-approve is on. The album and big screen only see approved photos.
 *  2. Check-in: the employee list, who has checked in, and the guests each
 *     employee brings. Every change runs one at a time under the script lock,
 *     so several phones at the door never double-count. Each change carries a
 *     one-off id: if a phone retries after a slow connection, it isn't applied twice.
 *  3. Raffle draw: every checked-in employee and each of their guests gets a
 *     draw number (DW-001, DW-002, ...) in check-in order. Numbers only ever go
 *     up and are never reused, even after an undo. Winners, skipped entries
 *     ("Not here? Redraw") and the draw log are kept here, so a refresh or a
 *     different laptop keeps them.
 *
 * No PIN: the pages open straight away. To lock the staff pages later, add a
 * STAFF_KEY in Script Properties and give staff the link with #key=<that value>
 * (see README). Secrets (STAFF_KEY, CLOUDINARY_KEY, CLOUDINARY_SECRET) live in
 * Script Properties only, never in this file or the public repo.
 *
 * Setup (full steps in README.md):
 *   1. Paste this file into a new project at script.google.com and save.
 *   2. Set CLOUD just below to your Cloudinary cloud name.
 *   3. Run setup() once and allow the permissions.
 *   4. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 *      Copy the /exec URL into config.js.
 *   Updating later: Deploy > Manage deployments > Edit > Version: New version > Deploy.
 */

var FOLDER_NAME = 'Roshni 2026 - Diwali Photos';
var CLOUD = 'xccqslt2';            // Cloudinary cloud name (public), same as config.js
var CLOUD_ID = /^(roshni\/)?[A-Za-z0-9_-]{6,64}$/; // public IDs from the roshni upload preset
var TZ = 'Asia/Dubai';
var DRAW_PREFIX = 'DW-';
var DEFAULT_PRIZES = ['3rd prize', '2nd prize', '1st prize'];

var MAX_BYTES = 15 * 1024 * 1024;
var LIST_CACHE_KEY = 'approved-list';
var PEOPLE_CACHE_KEY = 'people';
var MAX_KEY_FAILS = 30;  // wrong staff keys per 10 minutes before a short lockout
var ITEM = 'P_';         // Script Property prefix: album entries
var EMP = 'E_';          // Script Property prefix: one entry per employee
var MAX_GUESTS = 20;     // per employee
var MAX_PEOPLE = 1500;

function setup() {
  var root = getFolder_();
  getSubFolder_('Framed');
  getSubFolder_('Originals');
  Logger.log('Photos will be saved to: ' + root.getUrl());
  Logger.log('Employees: ' + allPeople_().length + ', next draw number: ' + drawNo_(nextNo_()));
  Logger.log(staffKey_() ? 'STAFF_KEY is set: staff pages need the link with #key=...' : 'No STAFF_KEY: staff pages open without a key.');
}

// ---------------------------------------------------------------- GET

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'list') return json_(publicList_());
    if (p.action === 'people') { auth_(p.key); return json_(peopleState_()); }
    if (p.action === 'admin') {
      auth_(p.key);
      var items = allItems_().sort(function (a, b) { return b.t - a.t; });
      return json_({ ok: true, photos: items, auto: isAuto_() });
    }
    return json_({ ok: true, service: 'roshni', locked: !!staffKey_() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ---------------------------------------------------------------- POST

var STAFF_ACTIONS = {
  checkin: function (b) { return checkin_(b); },
  guestAdd: function (b) { return guestAdd_(b); },
  guestRemove: function (b) { return guestRemove_(b); },
  importPeople: function (b) { return importPeople_(b); },
  savePerson: function (b) { return savePerson_(b); },
  deletePerson: function (b) { return deletePerson_(b); },
  clearPeople: function (b) { return clearPeople_(b); },
  prizes: function (b) { return setPrizes_(b); },
  winner: function (b) { return winner_(b); },
  review: function (b) { return review_(b); },
  settings: function (b) { return settings_(b); },
  'delete': function (b) { return delete_(b); }
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'register') return json_(register_(body));
    if (body.action === 'upload') return json_(upload_(body));
    var fn = STAFF_ACTIONS[body.action];
    if (!fn) throw new Error('Bad request');
    auth_(body.key);
    return json_(fn(body));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ================================================================ check-in

// Everything the check-in, admin and draw pages need, in one cached answer.
function peopleState_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(PEOPLE_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  var props = PropertiesService.getScriptProperties();
  var out = {
    ok: true,
    people: allPeople_().sort(function (a, b) { return a.id - b.id; }),
    prizes: prizes_(),
    winners: jsonProp_('WINNERS', []),
    skipped: jsonProp_('SKIPPED', []),
    log: jsonProp_('DRAW_LOG', []),
    next: nextNo_(),
    rev: Number(props.getProperty('REV') || 0)
  };
  var text = JSON.stringify(out);
  if (text.length < 95000) cache.put(PEOPLE_CACHE_KEY, text, 20);
  return out;
}

// Runs a change under the script lock. op is a one-off id from the phone: if the
// same change arrives twice (a retry), the first answer is returned again.
function change_(body, fn) {
  var cache = CacheService.getScriptCache();
  var opKey = body.op ? 'op_' + String(body.op).slice(0, 60) : '';
  if (opKey) { var seen = cache.get(opKey); if (seen) return JSON.parse(seen); }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Busy right now. Tap again.');
  try {
    if (opKey) { var seen2 = cache.get(opKey); if (seen2) return JSON.parse(seen2); }
    var out = fn(PropertiesService.getScriptProperties());
    bump_();
    if (opKey) cache.put(opKey, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}

function bump_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('REV', String(Number(props.getProperty('REV') || 0) + 1));
  CacheService.getScriptCache().remove(PEOPLE_CACHE_KEY);
}

// Check an employee in (they get the next draw number) or undo it. Undo also
// takes their guests out of the draw. Numbers are never handed out again.
function checkin_(body) {
  return change_(body, function (props) {
    var p = getPerson_(body.id);
    if (!p) throw new Error('Employee not found. Refresh the list.');
    if (body.on) {
      if (!p.n) { p.n = takeNo_(props); p.t = Date.now(); }
    } else {
      if (isWinnerNo_(p.n) || p.g.some(function (g) { return isWinnerNo_(g.n); })) throw new Error('Already drawn as a winner. Reset the draw first.');
      p.n = 0; p.t = 0; p.g = [];
    }
    savePerson__(p);
    return { ok: true, person: p };
  });
}

function guestAdd_(body) {
  var name = clean_(body.name, 60);
  if (name.length < 2) throw new Error('Type the guest\'s name.');
  return change_(body, function (props) {
    var p = getPerson_(body.id);
    if (!p) throw new Error('Employee not found. Refresh the list.');
    if (!p.n) throw new Error('Check ' + p.name + ' in first.');
    if (p.g.length >= MAX_GUESTS) throw new Error('That\'s the most guests for one employee.');
    p.g.push({ n: takeNo_(props), name: name, t: Date.now() });
    savePerson__(p);
    return { ok: true, person: p };
  });
}

function guestRemove_(body) {
  return change_(body, function () {
    var p = getPerson_(body.id);
    if (!p) throw new Error('Employee not found. Refresh the list.');
    var n = Number(body.n);
    if (isWinnerNo_(n)) throw new Error('This guest has been drawn as a winner. Reset the draw first.');
    p.g = p.g.filter(function (g) { return g.n !== n; });
    savePerson__(p);
    return { ok: true, person: p };
  });
}

// Admin: add a list of employees ({name, dept, code}), or replace the whole list.
function importPeople_(body) {
  var rows = (body.rows || []).map(function (r) {
    return { name: clean_(r.name, 80), dept: clean_(r.dept, 60), code: clean_(r.code, 30) };
  }).filter(function (r) { return r.name.length >= 2; });
  if (!rows.length) throw new Error('No names found in the list.');
  return change_(body, function (props) {
    var existing = allPeople_();
    if (body.replace) {
      if (existing.some(function (p) { return p.n; })) throw new Error('Some employees are already checked in. Use Clear everything first, or add to the list instead.');
      existing.forEach(function (p) { props.deleteProperty(EMP + p.id); });
      existing = [];
    }
    if (existing.length + rows.length > MAX_PEOPLE) throw new Error('That would be more than ' + MAX_PEOPLE + ' employees.');
    // skip anyone already on the list (same employee ID, or same name and department)
    var known = {};
    existing.forEach(function (p) { known[keyOf_(p)] = 1; });
    var id = Number(props.getProperty('EMP_NEXT') || 1), batch = {}, added = 0, skipped = 0;
    rows.forEach(function (r) {
      var k = keyOf_(r);
      if (known[k]) { skipped++; return; }
      known[k] = 1;
      batch[EMP + id] = JSON.stringify({ id: id, name: r.name, dept: r.dept, code: r.code, n: 0, t: 0, g: [] });
      id++; added++;
    });
    batch.EMP_NEXT = String(id);
    props.setProperties(batch);
    return { ok: true, added: added, skipped: skipped };
  });
}

function keyOf_(r) {
  return r.code ? 'c:' + r.code.toLowerCase() : 'n:' + r.name.toLowerCase() + '|' + (r.dept || '').toLowerCase();
}

// Admin: add one employee (no id) or edit one
function savePerson_(body) {
  var name = clean_(body.name, 80);
  if (name.length < 2) throw new Error('Enter the employee\'s name.');
  return change_(body, function (props) {
    var p;
    if (body.id) {
      p = getPerson_(body.id);
      if (!p) throw new Error('Employee not found.');
    } else {
      var id = Number(props.getProperty('EMP_NEXT') || 1);
      if (allPeople_().length >= MAX_PEOPLE) throw new Error('The list is full.');
      props.setProperty('EMP_NEXT', String(id + 1));
      p = { id: id, n: 0, t: 0, g: [] };
    }
    p.name = name; p.dept = clean_(body.dept, 60); p.code = clean_(body.code, 30);
    savePerson__(p);
    return { ok: true, person: p };
  });
}

function deletePerson_(body) {
  return change_(body, function (props) {
    var p = getPerson_(body.id);
    if (!p) throw new Error('Employee not found.');
    if (isWinnerNo_(p.n) || p.g.some(function (g) { return isWinnerNo_(g.n); })) throw new Error('Already drawn as a winner. Reset the draw first.');
    props.deleteProperty(EMP + p.id);
    return { ok: true };
  });
}

// Admin: start again from scratch. Clears employees, check-ins, guests, winners
// and the draw log, and draw numbers start again from DW-001.
function clearPeople_(body) {
  if (body.confirm !== 'CLEAR') throw new Error('Type CLEAR to confirm.');
  return change_(body, function (props) {
    var keys = props.getKeys ? props.getKeys() : Object.keys(props.getProperties());
    keys.forEach(function (k) { if (k.indexOf(EMP) === 0) props.deleteProperty(k); });
    ['WINNERS', 'SKIPPED', 'DRAW_LOG', 'DRAW_NEXT', 'EMP_NEXT'].forEach(function (k) { props.deleteProperty(k); });
    return { ok: true };
  });
}

function takeNo_(props) {
  var n = Number(props.getProperty('DRAW_NEXT') || 1);
  props.setProperty('DRAW_NEXT', String(n + 1));
  return n;
}
function nextNo_() { return Number(PropertiesService.getScriptProperties().getProperty('DRAW_NEXT') || 1); }
function drawNo_(n) { var s = String(n); while (s.length < 3) s = '0' + s; return DRAW_PREFIX + s; }

function getPerson_(id) {
  var raw = PropertiesService.getScriptProperties().getProperty(EMP + Number(id));
  return raw ? JSON.parse(raw) : null;
}
function savePerson__(p) {
  PropertiesService.getScriptProperties().setProperty(EMP + p.id, JSON.stringify({ id: p.id, name: p.name, dept: p.dept || '', code: p.code || '', n: p.n || 0, t: p.t || 0, g: p.g || [] }));
}
function allPeople_() {
  var props = PropertiesService.getScriptProperties().getProperties(), out = [];
  Object.keys(props).forEach(function (k) { if (/^E_\d+$/.test(k)) out.push(JSON.parse(props[k])); });
  return out;
}

// Every entry in the draw right now: checked-in employees and their guests
function entries_() {
  var out = [];
  allPeople_().forEach(function (p) {
    if (!p.n) return;
    out.push({ n: p.n, name: p.name, dept: p.dept, id: p.id });
    p.g.forEach(function (g) { out.push({ n: g.n, name: g.name, host: p.name, id: p.id }); });
  });
  return out;
}

// ================================================================ raffle draw

function prizes_() { return jsonProp_('PRIZES', DEFAULT_PRIZES); }

// Admin: the prizes, in the order they're drawn (first in the list is drawn first)
function setPrizes_(body) {
  var list = (body.list || []).map(function (s) { return clean_(s, 60); }).filter(String);
  if (!list.length) throw new Error('Add at least one prize.');
  if (list.length > 30) throw new Error('Up to 30 prizes.');
  return change_(body, function (props) {
    if (jsonProp_('WINNERS', []).length > list.length) throw new Error('More winners have been drawn than that. Reset the draw first.');
    props.setProperty('PRIZES', JSON.stringify(list));
    return { ok: true, prizes: list };
  });
}

// Draw screen. { n, log }: a winner for the next prize.  { skip: n, log }: that
// winner wasn't there; they leave the winners and can't be drawn again.
// { reset: true }: clear winners and skipped entries (the log keeps a note).
function winner_(body) {
  return change_(body, function (props) {
    var winners = jsonProp_('WINNERS', []), skipped = jsonProp_('SKIPPED', []), log = jsonProp_('DRAW_LOG', []);
    var prizes = prizes_();
    if (body.reset) {
      winners = []; skipped = [];
    } else if (body.skip) {
      var s = Number(body.skip);
      winners = winners.filter(function (w) { return w.n !== s; });
      if (skipped.indexOf(s) < 0) skipped.push(s);
    } else {
      var n = Number(body.n);
      var entry = entries_().filter(function (x) { return x.n === n; })[0];
      if (!entry) throw new Error(drawNo_(n) + ' is not in the draw.');
      if (skipped.indexOf(n) >= 0) throw new Error(drawNo_(n) + ' was skipped and can\'t win.');
      var already = winners.filter(function (w) { return w.n === n; })[0];
      if (!already) {
        if (winners.length >= prizes.length) throw new Error('All prizes have been drawn.');
        winners.push({ n: n, name: entry.name, host: entry.host || '', dept: entry.dept || '', prize: prizes[winners.length], t: Date.now() });
      }
    }
    if (body.log) {
      log.unshift(cleanLog_(body.log));
      while (log.length > 60 || JSON.stringify(log).length > 8500) log.pop();
    }
    props.setProperties({ WINNERS: JSON.stringify(winners), SKIPPED: JSON.stringify(skipped), DRAW_LOG: JSON.stringify(log) });
    return { ok: true, winners: winners, skipped: skipped, log: log };
  });
}

function cleanLog_(e) {
  var out = {};
  ['at', 'pool', 'idx', 'raw'].forEach(function (k) { if (e[k] !== undefined) out[k] = Number(e[k]) || 0; });
  ['no', 'name', 'prize', 'fp', 'kind'].forEach(function (k) { if (e[k] !== undefined) out[k] = clean_(e[k], 70); });
  return out;
}

function isWinnerNo_(n) {
  if (!n) return false;
  return jsonProp_('WINNERS', []).some(function (w) { return w.n === n; });
}

// ================================================================ photo album

// A photo the guest's phone has just uploaded to Cloudinary
function register_(body) {
  var id = String(body.id || '');
  if (!CLOUD_ID.test(id)) throw new Error('Bad photo id');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(ITEM + id)) return { ok: true, approved: JSON.parse(props.getProperty(ITEM + id)).s === 'a' };
  var auto = isAuto_(), now = Date.now();
  saveItem_(id, { s: auto ? 'a' : 'p', w: Number(body.w) || 0, h: Number(body.h) || 0, t: now, at: auto ? now : 0, v: Number(body.v) || 0, c: 1 });
  if (auto) CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  return { ok: true, approved: auto };
}

// Fallback when Cloudinary can't be reached: the photo itself, saved to Google Drive
function upload_(body) {
  var framed = jpeg_(body.framed);
  var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH.mm.ss') + ' ' + Utilities.getUuid().slice(0, 4);
  var file = getSubFolder_('Framed').createFile(Utilities.newBlob(framed, 'image/jpeg', 'Roshni ' + stamp + '.jpg'));
  // Unlisted link so the approval page can preview it; only listed publicly once approved.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var auto = isAuto_(), now = Date.now();
  saveItem_(file.getId(), { s: auto ? 'a' : 'p', w: Number(body.w) || 0, h: Number(body.h) || 0, t: now, at: auto ? now : 0 });
  if (auto) CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  return { ok: true, approved: auto };
}

function review_(body) {
  var status = body.status;
  if (['a', 'h', 'p'].indexOf(status) < 0) throw new Error('Bad status');
  var raw = PropertiesService.getScriptProperties().getProperty(ITEM + body.id);
  if (!raw) throw new Error('Photo not found');
  var it = JSON.parse(raw);
  it.s = status;
  if (status === 'a' && !it.at) it.at = Date.now();
  saveItem_(body.id, it);
  if (!it.c) {
    var file = DriveApp.getFileById(body.id);
    if (status === 'h') file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    else file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  return { ok: true };
}

// Delete: removes the album entry and the image (Cloudinary, or the Drive bin)
function delete_(body) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(ITEM + body.id);
  if (!raw) throw new Error('Photo not found');
  var item = JSON.parse(raw);
  if (item.c) {
    cloudinaryDestroy_(body.id);
    if (item.d) { try { DriveApp.getFileById(item.d).setTrashed(true); } catch (e) { /* backup already gone */ } }
  } else {
    try { DriveApp.getFileById(body.id).setTrashed(true); } catch (e) { /* already gone */ }
  }
  props.deleteProperty(ITEM + body.id);
  CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  return { ok: true };
}

function cloudinaryDestroy_(publicId) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('CLOUDINARY_KEY'), secret = props.getProperty('CLOUDINARY_SECRET');
  if (!key || !secret) throw new Error('Add CLOUDINARY_KEY and CLOUDINARY_SECRET in Script Properties to delete');
  var ts = Math.floor(Date.now() / 1000);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, 'public_id=' + publicId + '&timestamp=' + ts + secret, Utilities.Charset.UTF_8);
  var sig = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  var res = UrlFetchApp.fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/destroy', {
    method: 'post', muteHttpExceptions: true,
    payload: { public_id: publicId, timestamp: String(ts), api_key: key, signature: sig }
  });
  var out = JSON.parse(res.getContentText() || '{}');
  if (out.result !== 'ok' && out.result !== 'not found') throw new Error('Cloudinary: ' + (out.error ? out.error.message : out.result));
}

// ---- Drive backup: run startDriveBackup() once; new Cloudinary photos are copied every 5 minutes
function startDriveBackup() {
  stopDriveBackup();
  ScriptApp.newTrigger('backupToDrive').timeBased().everyMinutes(5).create();
  backupToDrive();
  Logger.log('Drive backup is on: new photos are copied every 5 minutes.');
}
function stopDriveBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupToDrive') ScriptApp.deleteTrigger(t);
  });
}
function backupToDrive() {
  var cache = CacheService.getScriptCache();
  if (cache.get('backup-running')) return;
  cache.put('backup-running', '1', 300);
  try {
    var started = Date.now(), folder = getSubFolder_('Framed'), props = PropertiesService.getScriptProperties();
    var todo = allItems_().filter(function (it) { return it.c && !it.d; }).sort(function (a, b) { return a.t - b.t; });
    for (var i = 0; i < todo.length && Date.now() - started < 4 * 60 * 1000; i++) {
      var it = todo[i];
      var res = UrlFetchApp.fetch('https://res.cloudinary.com/' + CLOUD + '/image/upload/' + (it.v ? 'v' + it.v + '/' : '') + it.id + '.jpg', { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) continue;
      var file = folder.createFile(res.getBlob().setName('Roshni ' + Utilities.formatDate(new Date(it.t), TZ, 'yyyy-MM-dd HH.mm.ss') + ' ' + it.id.slice(-6) + '.jpg'));
      var fresh = props.getProperty(ITEM + it.id);
      if (!fresh) { file.setTrashed(true); continue; }
      var cur = JSON.parse(fresh);
      cur.d = file.getId();
      saveItem_(it.id, cur);
    }
  } finally {
    cache.remove('backup-running');
  }
}

function settings_(body) {
  PropertiesService.getScriptProperties().setProperty('AUTO_APPROVE', body.auto ? '1' : '0');
  CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  return { ok: true, auto: !!body.auto };
}
function isAuto_() { return PropertiesService.getScriptProperties().getProperty('AUTO_APPROVE') === '1'; }

function saveItem_(id, it) {
  PropertiesService.getScriptProperties().setProperty(ITEM + id, JSON.stringify({ s: it.s, w: it.w, h: it.h, t: it.t, at: it.at, v: it.v || 0, c: it.c ? 1 : 0, d: it.d || '' }));
}
function allItems_() {
  var props = PropertiesService.getScriptProperties().getProperties(), out = [];
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(ITEM) !== 0) return;
    var it = JSON.parse(props[k]); it.id = k.slice(ITEM.length); out.push(it);
  });
  return out;
}
// What guest pages and the big screen poll for: cached so busy evenings stay inside quotas
function publicList_() {
  var cache = CacheService.getScriptCache(), hit = cache.get(LIST_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  var photos = allItems_().filter(function (it) { return it.s === 'a'; }).sort(function (a, b) { return b.t - a.t; })
    .map(function (it) { return { id: it.id, w: it.w, h: it.h, t: it.t, at: it.at, v: it.v || 0, c: it.c ? 1 : 0 }; });
  var out = { ok: true, photos: photos, auto: isAuto_() };
  cache.put(LIST_CACHE_KEY, JSON.stringify(out), 30);
  return out;
}

// ================================================================ helpers

function staffKey_() { return PropertiesService.getScriptProperties().getProperty('STAFF_KEY') || ''; }

// Open by default. With a STAFF_KEY in Script Properties, staff pages must send it.
function auth_(key) {
  var real = staffKey_();
  if (!real) return;
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('key-fails') || 0);
  if (fails >= MAX_KEY_FAILS) throw new Error('Too many attempts. Try again in a few minutes.');
  if (String(key || '') !== real) {
    cache.put('key-fails', String(fails + 1), 600);
    throw new Error('Open this page from the staff link.');
  }
}

function jsonProp_(k, dflt) {
  var raw = PropertiesService.getScriptProperties().getProperty(k);
  return raw ? JSON.parse(raw) : dflt;
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function jpeg_(b64) {
  if (!b64) throw new Error('Missing photo');
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > MAX_BYTES || bytes[0] !== -1 || bytes[1] !== -40) throw new Error('Not a valid photo');
  return bytes;
}

function getFolder_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* deleted; make a new one */ } }
  var folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}
function getSubFolder_(name) {
  var props = PropertiesService.getScriptProperties(), key = 'FOLDER_' + name.toUpperCase(), id = props.getProperty(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* deleted; recreate */ } }
  var root = getFolder_(), it = root.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : root.createFolder(name);
  props.setProperty(key, folder.getId());
  return folder;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
