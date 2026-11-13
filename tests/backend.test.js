/* Backend tests: apps-script/Code.gs running in Node with fake Google services.
 *   node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../tools/fake-gas');

function fresh(opts) {
  const g = loadBackend(opts);
  const ok = (body) => { const r = g.post(body); assert.equal(r.ok, true, r.error); return r; };
  const fail = (body, re) => { const r = g.post(body); assert.equal(r.ok, false, 'expected an error'); if (re) assert.match(r.error, re); return r; };
  const state = () => { const s = g.get({ action: 'people' }); assert.equal(s.ok, true, s.error); return s; };
  return { g, ok, fail, state };
}
const ROWS = [
  { name: 'Aisha Rahman', dept: 'Finance', code: 'E1' },
  { name: 'Omar Haddad', dept: 'Sales', code: 'E2' },
  { name: 'Priya Nair', dept: 'Marketing', code: 'E3' },
];
let opSeq = 0;
const op = () => 'op' + (++opSeq);

test('import adds employees and skips duplicates', () => {
  const { ok, state } = fresh();
  let r = ok({ action: 'importPeople', rows: ROWS });
  assert.equal(r.added, 3);
  r = ok({ action: 'importPeople', rows: [ROWS[0], { name: 'New Person', dept: 'IT' }, { name: 'x' }] });
  assert.equal(r.added, 1); assert.equal(r.skipped, 1);
  assert.equal(state().people.length, 4);
});

test('check-in gives draw numbers in order; undo never reuses a number', () => {
  const { ok, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  const [a, b, c] = state().people;
  assert.equal(ok({ action: 'checkin', id: a.id, on: true, op: op() }).person.n, 1);
  assert.equal(ok({ action: 'checkin', id: b.id, on: true, op: op() }).person.n, 2);
  ok({ action: 'checkin', id: a.id, on: false, op: op() });
  assert.equal(ok({ action: 'checkin', id: c.id, on: true, op: op() }).person.n, 3);
  assert.equal(ok({ action: 'checkin', id: a.id, on: true, op: op() }).person.n, 4, 'a re-check-in gets a new number');
  // checking in twice keeps the same number
  assert.equal(ok({ action: 'checkin', id: a.id, on: true, op: op() }).person.n, 4);
});

test('guests: added under a checked-in employee, removed, and dropped on undo', () => {
  const { ok, fail, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  const a = state().people[0];
  fail({ action: 'guestAdd', id: a.id, name: 'Sameer', op: op() }, /Check .* in first/);
  ok({ action: 'checkin', id: a.id, on: true, op: op() });
  ok({ action: 'guestAdd', id: a.id, name: 'Sameer Rahman', op: op() });
  const p = ok({ action: 'guestAdd', id: a.id, name: 'Lina Rahman', op: op() }).person;
  assert.deepEqual(p.g.map((x) => x.n), [2, 3]);
  fail({ action: 'guestAdd', id: a.id, name: ' ', op: op() }, /guest's name/);
  assert.deepEqual(ok({ action: 'guestRemove', id: a.id, n: 2, op: op() }).person.g.map((x) => x.n), [3]);
  ok({ action: 'checkin', id: a.id, on: false, op: op() });
  const s = state();
  assert.equal(s.people[0].g.length, 0);
  assert.equal(s.next, 4, 'numbers 1-3 are used up for good');
});

test('a retried change (same op id) is applied once', () => {
  const { ok, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  const a = state().people[0];
  ok({ action: 'checkin', id: a.id, on: true, op: op() });
  const same = op();
  const r1 = ok({ action: 'guestAdd', id: a.id, name: 'Sameer', op: same });
  const r2 = ok({ action: 'guestAdd', id: a.id, name: 'Sameer', op: same });
  assert.deepEqual(r1, r2);
  assert.equal(state().people[0].g.length, 1);
});

test('several phones at once: every change is counted exactly once', () => {
  const { g, ok, state } = fresh();
  const many = Array.from({ length: 60 }, (_, i) => ({ name: 'Person ' + i, dept: 'D' + (i % 5), code: 'C' + i }));
  ok({ action: 'importPeople', rows: many });
  const people = state().people;
  // 4 "phones" each check in 15 people and add a guest, with retries mixed in
  const phones = [0, 1, 2, 3].map((k) => people.slice(k * 15, k * 15 + 15));
  for (let i = 0; i < 15; i++) {
    phones.forEach((list, k) => {
      const p = list[i], o1 = 'p' + k + 'c' + i, o2 = 'p' + k + 'g' + i;
      ok({ action: 'checkin', id: p.id, on: true, op: o1 });
      ok({ action: 'guestAdd', id: p.id, name: 'Guest of ' + p.name, op: o2 });
      if (i % 3 === 0) { ok({ action: 'checkin', id: p.id, on: true, op: o1 }); ok({ action: 'guestAdd', id: p.id, name: 'Guest of ' + p.name, op: o2 }); }
    });
  }
  const s = state();
  const nums = [];
  s.people.forEach((p) => { if (p.n) nums.push(p.n); p.g.forEach((x) => nums.push(x.n)); });
  assert.equal(nums.length, 120);
  assert.equal(new Set(nums).size, 120, 'no number handed out twice');
  assert.equal(Math.max(...nums), 120);
  assert.equal(g._.lock.hasLock(), false, 'lock released');
});

test('a busy lock gives a friendly error and changes nothing', () => {
  const { g, fail, ok, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  const a = state().people[0];
  g._.setLockHeld(true);
  fail({ action: 'checkin', id: a.id, on: true, op: op() }, /Busy/);
  g._.setLockHeld(false);
  assert.equal(state().people[0].n, 0);
});

test('winners: prizes in order, no repeats, skip, cap and reset', () => {
  const { ok, fail, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  ok({ action: 'prizes', list: ['Gift hamper', 'Air fryer'] });
  const ps = state().people;
  ps.forEach((p) => ok({ action: 'checkin', id: p.id, on: true, op: op() }));
  ok({ action: 'guestAdd', id: ps[0].id, name: 'Lina Rahman', op: op() });
  fail({ action: 'winner', n: 99, op: op() }, /not in the draw/);
  let r = ok({ action: 'winner', n: 4, log: { no: 'DW-004', name: 'Lina Rahman', pool: 4, fp: 'abc', idx: 3, raw: 7, at: 1 }, op: op() });
  assert.equal(r.winners[0].prize, 'Gift hamper');
  assert.equal(r.winners[0].host, 'Aisha Rahman', 'guest winner remembers the employee');
  assert.equal(r.log.length, 1);
  ok({ action: 'winner', n: 4, op: op() }); // same winner again: no change
  assert.equal(state().winners.length, 1);
  r = ok({ action: 'winner', skip: 4, log: { kind: 'skip', no: 'DW-004' }, op: op() });
  assert.deepEqual(r.skipped, [4]); assert.equal(r.winners.length, 0);
  fail({ action: 'winner', n: 4, op: op() }, /skipped/);
  ok({ action: 'winner', n: 1, op: op() });
  r = ok({ action: 'winner', n: 2, op: op() });
  assert.deepEqual(r.winners.map((w) => w.prize), ['Gift hamper', 'Air fryer']);
  fail({ action: 'winner', n: 3, op: op() }, /All prizes/);
  // winners are protected from undo and removal
  fail({ action: 'checkin', id: ps[0].id, on: false, op: op() }, /winner/);
  fail({ action: 'deletePerson', id: ps[1].id, op: op() }, /winner/);
  fail({ action: 'prizes', list: ['Only one'] }, /Reset the draw/);
  r = ok({ action: 'winner', reset: true, log: { kind: 'reset' }, op: op() });
  assert.equal(r.winners.length, 0); assert.equal(r.skipped.length, 0);
  assert.equal(state().log.length, 3, 'the log keeps the history across a reset');
});

test('draw log stays small enough for Script Properties', () => {
  const { ok } = fresh();
  for (let i = 0; i < 80; i++) ok({ action: 'winner', reset: true, log: { kind: 'reset', name: 'x'.repeat(70), fp: 'f'.repeat(16) }, op: op() });
  // a value over 9 KB would have thrown in the fake Script Properties
});

test('clear everything needs CLEAR and starts numbers again', () => {
  const { ok, fail, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  ok({ action: 'checkin', id: state().people[0].id, on: true, op: op() });
  fail({ action: 'clearPeople' }, /CLEAR/);
  fail({ action: 'importPeople', rows: ROWS, replace: true }, /checked in/);
  ok({ action: 'clearPeople', confirm: 'CLEAR', op: op() });
  const s = state();
  assert.equal(s.people.length, 0); assert.equal(s.next, 1);
});

test('edit, add and delete one employee', () => {
  const { ok, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  const a = state().people[0];
  ok({ action: 'savePerson', id: a.id, name: 'Aisha R. Rahman', dept: 'Finance', code: 'E1', op: op() });
  const added = ok({ action: 'savePerson', name: 'Walk In', dept: 'Guest desk', op: op() }).person;
  assert.equal(added.id, 4);
  ok({ action: 'deletePerson', id: ROWS.length, op: op() });
  const s = state();
  assert.deepEqual(s.people.map((p) => p.name), ['Aisha R. Rahman', 'Omar Haddad', 'Walk In']);
});

test('names are cleaned of markup and trimmed', () => {
  const { ok, state } = fresh();
  ok({ action: 'importPeople', rows: [{ name: '  <b>Bad</b>   Name ', dept: 'x<script>' }] });
  const p = state().people[0];
  assert.equal(p.name, 'bBad/b Name');
  assert.equal(p.dept, 'xscript');
});

test('open by default; a STAFF_KEY locks staff actions but not guest photos', () => {
  const open = fresh();
  assert.equal(open.g.get({}).locked, false);
  const locked = fresh({ props: { STAFF_KEY: 'k3y' } });
  assert.equal(locked.g.get({ action: 'people' }).ok, false);
  assert.equal(locked.g.get({ action: 'people', key: 'k3y' }).ok, true);
  locked.fail({ action: 'importPeople', rows: ROWS }, /staff link/);
  locked.ok({ action: 'importPeople', rows: ROWS, key: 'k3y' });
  assert.equal(locked.g.get({ action: 'list' }).ok, true, 'the public album still works');
  locked.ok({ action: 'register', id: 'roshni/abc123', w: 10, h: 10 });
});

test('photos: register, approve, auto-approve and public list', () => {
  const { g, ok, fail } = fresh();
  fail({ action: 'register', id: '../bad' }, /Bad photo id/);
  assert.equal(ok({ action: 'register', id: 'roshni/photo01', w: 1080, h: 1300, v: 5 }).approved, false);
  assert.equal(g.get({ action: 'list' }).photos.length, 0);
  ok({ action: 'review', id: 'roshni/photo01', status: 'a' });
  assert.equal(g.get({ action: 'list' }).photos.length, 1);
  ok({ action: 'settings', auto: true });
  assert.equal(ok({ action: 'register', id: 'roshni/photo02', w: 1, h: 1 }).approved, true);
  assert.equal(g.get({ action: 'admin' }).photos.length, 2);
});

test('photos: Drive fallback accepts only real JPEGs', () => {
  const { ok, fail } = fresh();
  fail({ action: 'upload', framed: Buffer.from('hello').toString('base64') }, /valid photo/);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  ok({ action: 'upload', framed: jpeg, w: 10, h: 10 });
});

test('the people answer is cached and refreshed after every change', () => {
  const { g, ok, state } = fresh();
  ok({ action: 'importPeople', rows: ROWS });
  const r1 = state().rev;
  const reads = g._.stats.propReads;
  state(); state();
  // only the staff-key check reads Script Properties; the list itself comes from the cache
  assert.equal(g._.stats.propReads - reads, 2, 'served from the cache');
  ok({ action: 'checkin', id: 1, on: true, op: op() });
  assert.ok(state().rev > r1);
});
