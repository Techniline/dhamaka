/* Generates the Dhamaka artwork in assets/ (run: node tools/make-art.js).
 * Everything is plain SVG so it stays sharp on phones, posters and the big screen.
 *   mandala.svg       large rangoli used as key art (pages, poster, big screens)
 *   rangoli-tile.svg  faint repeating pattern for backgrounds (replaces the speaker grille)
 *   toran.svg         marigold garland strip, repeats across the top of pages
 *   diya.svg          the event mark: an oil lamp with a glowing flame
 *   favicon.svg       small diya for browser tabs
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets');

const C = { marigold: '#f7a325', saffron: '#ff7a1a', gold: '#f2c45a', cream: '#fbeedd', rose: '#d6336c', wine: '#7a1f3d', leaf: '#3f8f4a', deep: '#2a0a1e' };
const f = (n) => Math.round(n * 100) / 100;
const pt = (r, a) => [f(r * Math.cos(a)), f(r * Math.sin(a))];

// A petal from radius r0 to r1 at angle a, half-width w (radians at the widest point)
function petal(r0, r1, a, w, bulge = 0.55) {
  const rm = r0 + (r1 - r0) * bulge;
  const [x0, y0] = pt(r0, a), [x1, y1] = pt(r1, a);
  const [ax, ay] = pt(rm / Math.cos(w), a - w), [bx, by] = pt(rm / Math.cos(w), a + w);
  return `M${x0} ${y0}Q${ax} ${ay} ${x1} ${y1}Q${bx} ${by} ${x0} ${y0}Z`;
}
function ring(n, fn) { let s = ''; for (let i = 0; i < n; i++) s += fn((i / n) * Math.PI * 2 - Math.PI / 2, i); return s; }
function dots(n, r, size, fill, off = 0) { return ring(n, (a) => { const [x, y] = pt(r, a + off); return `<circle cx="${x}" cy="${y}" r="${size}" fill="${fill}"/>`; }); }

// ---------------------------------------------------------------- mandala (key art)
function mandala() {
  const p = [];
  p.push(`<circle r="300" fill="url(#glow)"/>`);
  // outer scalloped band
  p.push(`<g fill="none" stroke="${C.gold}" stroke-width="3" opacity="0.9">` + ring(24, (a) => `<path d="${petal(258, 296, a, 0.13, 0.5)}"/>`) + `</g>`);
  p.push(dots(48, 252, 3.2, C.cream, Math.PI / 48));
  // 12 large petals, saffron with gold outline
  p.push(`<g stroke="${C.gold}" stroke-width="2.5">` + ring(12, (a, i) => `<path d="${petal(150, 246, a, 0.2)}" fill="${i % 2 ? C.saffron : C.rose}"/>`) + `</g>`);
  p.push(`<g fill="${C.marigold}" opacity="0.95">` + ring(12, (a) => `<path d="${petal(170, 226, a, 0.1)}"/>`) + `</g>`);
  p.push(`<g fill="${C.deep}">` + ring(12, (a) => `<path d="${petal(186, 214, a, 0.05)}"/>`) + `</g>`);
  // 12 small petals between the large ones
  p.push(`<g fill="${C.gold}">` + ring(12, (a) => `<path d="${petal(156, 206, a + Math.PI / 12, 0.09)}"/>`) + `</g>`);
  p.push(dots(12, 222, 5, C.cream, Math.PI / 12));
  // ring band
  p.push(`<circle r="148" fill="${C.wine}" stroke="${C.gold}" stroke-width="3"/>`);
  p.push(dots(36, 138, 3.4, C.gold));
  // 16 marigold petals
  p.push(`<g stroke="${C.wine}" stroke-width="2">` + ring(16, (a, i) => `<path d="${petal(70, 130, a, 0.2)}" fill="${i % 2 ? C.marigold : C.saffron}"/>`) + `</g>`);
  p.push(`<g fill="${C.cream}" opacity="0.85">` + ring(16, (a) => `<path d="${petal(84, 116, a, 0.07)}"/>`) + `</g>`);
  // centre flower
  p.push(`<circle r="68" fill="${C.deep}" stroke="${C.gold}" stroke-width="3"/>`);
  p.push(`<g fill="${C.rose}" stroke="${C.gold}" stroke-width="1.5">` + ring(8, (a) => `<path d="${petal(14, 60, a, 0.3)}"/>`) + `</g>`);
  p.push(`<g fill="${C.gold}">` + ring(8, (a) => `<path d="${petal(18, 46, a + Math.PI / 8, 0.16)}"/>`) + `</g>`);
  p.push(`<circle r="16" fill="${C.marigold}" stroke="${C.cream}" stroke-width="3"/><circle r="5" fill="${C.deep}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-300 -300 600 600">
<defs><radialGradient id="glow"><stop offset="0" stop-color="${C.gold}" stop-opacity="0.35"/><stop offset="0.6" stop-color="${C.saffron}" stop-opacity="0.12"/><stop offset="1" stop-color="${C.saffron}" stop-opacity="0"/></radialGradient></defs>
${p.join('\n')}
</svg>\n`;
}

// ---------------------------------------------------------------- background tile
// Very faint gold line-work: a small rangoli flower in the middle, quarter flowers in the corners.
function tile() {
  const flower = (cx, cy) => `<g transform="translate(${cx} ${cy})">` +
    ring(8, (a) => `<path d="${petal(6, 22, a, 0.32)}"/>`) + `<circle r="4"/>` + `</g>`;
  const corners = [[0, 0], [96, 0], [0, 96], [96, 96]].map(([x, y]) => flower(x, y)).join('');
  const d = (x, y) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${C.gold}" stroke="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<g fill="none" stroke="${C.gold}" stroke-width="1" opacity="0.10">${flower(48, 48)}${corners}</g>
<g opacity="0.16">${d(48, 8)}${d(48, 88)}${d(8, 48)}${d(88, 48)}</g>
</svg>\n`;
}

// ---------------------------------------------------------------- marigold garland (toran)
function toran() {
  const W = 240, parts = [];
  parts.push(`<path d="M0 10 Q60 34 120 10 T240 10" fill="none" stroke="${C.gold}" stroke-width="2" opacity="0.7"/>`);
  const flower = (x, y, r, col) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${col}"/><circle r="${r}" fill="none" stroke="${C.saffron}" stroke-width="${r * 0.55}" stroke-dasharray="2 2.2" opacity="0.8"/><circle r="${r * 0.32}" fill="${C.saffron}"/></g>`;
  const leaf = (x, y, rot) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="M0 0 Q7 14 0 30 Q-7 14 0 0Z" fill="${C.leaf}" stroke="#2c6b35" stroke-width="1"/>`;
  // flowers along the swag
  for (let i = 0; i <= 8; i++) {
    const x = i * 30, t = (x % 120) / 120, y = 10 + 24 * 4 * t * (1 - t) * 0.92;
    parts.push(flower(x, y, i % 2 ? 7.5 : 9, i % 2 ? C.gold : C.marigold));
  }
  // hanging strands with a leaf at the dips
  [60, 180].forEach((x) => {
    parts.push(`<line x1="${x}" y1="30" x2="${x}" y2="64" stroke="${C.gold}" stroke-width="1.5" opacity="0.7"/>`);
    parts.push(flower(x, 42, 7, C.marigold), flower(x, 57, 6, C.gold));
    parts.push(leaf(x - 6, 62, 18), leaf(x + 6, 62, -18));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="96" viewBox="0 0 ${W} 96">\n${parts.join('\n')}\n</svg>\n`;
}

// ---------------------------------------------------------------- diya (event mark)
function diya(small) {
  const halo = small ? '' : `<circle cx="100" cy="72" r="70" fill="url(#halo)"/>`;
  const rays = small ? '' : `<g stroke="${C.gold}" stroke-width="3" stroke-linecap="round" opacity="0.75">` +
    [-60, -35, 35, 60].map((d) => { const a = (d - 90) * Math.PI / 180; return `<line x1="${f(100 + 46 * Math.cos(a))}" y1="${f(66 + 46 * Math.sin(a))}" x2="${f(100 + 62 * Math.cos(a))}" y2="${f(66 + 62 * Math.sin(a))}"/>`; }).join('') + `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs>
<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.gold}" stop-opacity="0.55"/><stop offset="0.5" stop-color="${C.saffron}" stop-opacity="0.18"/><stop offset="1" stop-color="${C.saffron}" stop-opacity="0"/></radialGradient>
<linearGradient id="flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.45" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.saffron}"/></linearGradient>
<linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="0.5" stop-color="${C.marigold}"/><stop offset="1" stop-color="#b8560f"/></linearGradient>
</defs>
${halo}${rays}
<path d="M100 24 C121 52 124 78 100 108 C76 78 79 52 100 24Z" fill="url(#flame)"/>
<path d="M100 56 C110 70 110 86 100 102 C90 86 90 70 100 56Z" fill="#fff8e1"/>
<path d="M18 112 C38 168 162 168 182 112 C190 108 196 102 198 94 C186 100 172 106 150 110 C120 115 80 115 50 112 C36 111 26 110 18 112Z" fill="url(#bowl)" stroke="#8a3b0a" stroke-width="2"/>
<path d="M30 116 C60 124 140 124 172 114" fill="none" stroke="#fff1c9" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
<g fill="${C.wine}">${[60, 80, 100, 120, 140].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 140 : 138}" r="${i === 2 ? 6 : 4.5}"/>`).join('')}</g>
<g fill="${C.cream}">${[70, 90, 110, 130].map((x) => `<circle cx="${x}" cy="138" r="2"/>`).join('')}</g>
<path d="M76 158 L124 158 L132 176 L68 176Z" fill="url(#bowl)" stroke="#8a3b0a" stroke-width="2"/>
</svg>\n`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'mandala.svg'), mandala());
fs.writeFileSync(path.join(OUT, 'rangoli-tile.svg'), tile());
fs.writeFileSync(path.join(OUT, 'toran.svg'), toran());
fs.writeFileSync(path.join(OUT, 'diya.svg'), diya(false));
fs.writeFileSync(path.join(OUT, 'favicon.svg'), diya(true));
console.log('Artwork written to', OUT);
