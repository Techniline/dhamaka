/* Diwali Dhamaka: the fair pick for the raffle draw (used by draw.html and the Node tests).
 * fairIndex(n) returns a uniform random whole number in [0, n) from the
 * cryptographic generator (crypto.getRandomValues). Values from the top,
 * uneven slice of the 32-bit range are thrown away and drawn again
 * (rejection sampling), so every entry has exactly the same chance: no modulo bias.
 * fingerprint(list) is the SHA-256 of the sorted draw numbers, recorded in the
 * draw log so anyone can check which entries were in the pool.
 */
(function (root) {
  function fairIndex(n, getRandomValues) {
    if (!(n >= 1 && n <= 4294967296 && n % 1 === 0)) throw new Error('Bad pool size');
    var rand = getRandomValues || function (a) { return root.crypto.getRandomValues(a); };
    var limit = Math.floor(4294967296 / n) * n, buf = new Uint32Array(1), x, tries = 0;
    do { rand(buf); x = buf[0]; tries++; } while (x >= limit);
    return { index: x % n, raw: x, tries: tries };
  }
  function fingerprint(numbers) {
    var text = numbers.slice().sort(function (a, b) { return a - b; }).join(',');
    var subtle = root.crypto && root.crypto.subtle;
    if (!subtle) return Promise.resolve('n/a');
    return subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 16);
    });
  }
  var api = { fairIndex: fairIndex, fingerprint: fingerprint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RoshniFair = api;
})(typeof window !== 'undefined' ? window : globalThis);
