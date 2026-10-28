// Local server for web/, used for development and by every browser gate. It sends
// Cache-Control: no-store on every response, so a reload always runs the code on disk. A plain
// static server (python -m http.server) lets the browser cache ES modules heuristically, and a
// page then runs yesterday's charts.js beside today's app.js: a fix looks absent, or a bug looks
// fixed. The browser gates call assertFreshServer() and refuse to run against a local server that
// caches. Production needs none of this: build.mjs stamps every module URL with the commit.
// Run: node scripts/serve.mjs [port]   (default 8731, bound to 127.0.0.1)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

export async function assertFreshServer(base) {
  const host = new URL(base).hostname;
  if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(host)) return; // a deployed site is stamped by build.mjs
  let cc = '';
  try { cc = (await fetch(`${base}/js/app.js`, { method: 'HEAD' })).headers.get('cache-control') || ''; } catch { throw new Error(`No server at ${base}. Start one with: node scripts/serve.mjs`); }
  if (!/no-store/.test(cc)) throw new Error(`The server at ${base} lets the browser cache modules (Cache-Control: "${cc}"), so a gate could pass on stale code. Stop it and run: node scripts/serve.mjs`);
}

export function serve(port = 8731) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); const body = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : body); }
    catch { res.writeHead(404, { 'Cache-Control': 'no-store' }).end('not found'); }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8731;
  await serve(port);
  console.log(`CallReady at http://127.0.0.1:${port} (no-store, so every reload runs the code on disk)`);
}
