/* Fairness of the raffle pick (assets/fair.js).
 *   node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { fairIndex, fingerprint } = require('../assets/fair.js');

const rng = (a) => webcrypto.getRandomValues(a);

// Chi-square goodness of fit against a uniform distribution
function chiSquare(counts, total) {
  const exp = total / counts.length;
  return counts.reduce((s, c) => s + (c - exp) ** 2 / exp, 0);
}

test('every entry is equally likely (1,000,000 picks from 150 entries)', () => {
  const n = 150, total = 1_000_000, counts = new Array(n).fill(0);
  for (let i = 0; i < total; i++) counts[fairIndex(n, rng).index]++;
  const chi = chiSquare(counts, total);
  // 149 degrees of freedom: the 99.99th percentile is about 220
  assert.ok(chi < 220, 'chi-square ' + chi.toFixed(1) + ' is too high for a fair pick');
  const min = Math.min(...counts), max = Math.max(...counts);
  assert.ok(min > 6000 && max < 7350, `counts between ${min} and ${max}`);
});

test('small pools are fair too (3 entries, 300,000 picks)', () => {
  const counts = [0, 0, 0];
  for (let i = 0; i < 300_000; i++) counts[fairIndex(3, rng).index]++;
  assert.ok(chiSquare(counts, 300_000) < 18.4); // 2 dof, 99.99th percentile
});

test('rejection sampling removes modulo bias', () => {
  // A fake generator that walks the whole 32-bit range in big steps. For n = 3,
  // 2^32 mod 3 = 1, so exactly the top value must be rejected.
  const n = 3, limit = Math.floor(4294967296 / n) * n;
  assert.equal(limit, 4294967295);
  let calls = 0;
  const seq = [4294967295, 4294967295, 7];
  const r = fairIndex(n, (a) => { a[0] = seq[calls++]; });
  assert.equal(r.tries, 3); assert.equal(r.index, 7 % 3); assert.equal(r.raw, 7);
  // A pool size where the bias would be large (n just above 2^31): about half the values are thrown away
  const big = 2 ** 31 + 1, lim = Math.floor(4294967296 / big) * big;
  assert.equal(lim, big);
});

test('a pool of one always picks it; bad pool sizes are refused', () => {
  assert.equal(fairIndex(1, rng).index, 0);
  assert.throws(() => fairIndex(0, rng));
  assert.throws(() => fairIndex(2.5, rng));
});

test('fingerprint ignores order and changes with the pool', async () => {
  globalThis.crypto = globalThis.crypto || webcrypto;
  const a = await fingerprint([3, 1, 2]), b = await fingerprint([1, 2, 3]), c = await fingerprint([1, 2, 4]);
  assert.equal(a, b); assert.notEqual(a, c); assert.match(a, /^[0-9a-f]{16}$/);
});
