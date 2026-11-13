/* Local test server: serves the site and runs apps-script/Code.gs in memory
 * (fake Google services), so every page works on http://localhost:8765 without
 * touching the real Apps Script. config.js points pages at /exec on localhost.
 *   node tools/dev-server.js [port]
 * Data lives in memory only and is gone when the server stops.
 * Set STAFF_KEY=xyz in the environment to test the optional staff-link lock.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadBackend } = require('./fake-gas');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8765);
const props = process.env.STAFF_KEY ? { STAFF_KEY: process.env.STAFF_KEY } : {};
let gas = null;
function backend() {
  if (!gas) gas = loadBackend({ props });
  return gas;
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/exec') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let out;
      try {
        const g = backend();
        out = req.method === 'POST' ? g.ctx.doPost({ postData: { contents: body } }).getContent()
          : g.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) }).getContent();
      } catch (e) { out = JSON.stringify({ ok: false, error: String(e.message || e) }); }
      // Apps Script answers slowly; a small delay keeps local testing honest
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out); }, 120);
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Dhamaka test server on http://localhost:' + PORT));
