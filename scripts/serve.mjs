import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const arg = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback;
const port = Number(arg('--port', process.env.PORT || '4173'));
const host = arg('--host', '127.0.0.1');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    const requested = decodeURIComponent(url.pathname);
    const file = path.resolve(root, `.${requested}`);
    if ((file !== path.resolve(root) && !file.startsWith(root)) || requested.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(file);
    const resolved = info.isDirectory() ? path.join(file, 'index.html') : file;
    const content = await readFile(resolved);
    res.writeHead(200, { 'Content-Type': types[path.extname(resolved)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end();
    else res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});
server.listen(port, host, () => console.log(`Villages running at http://${host}:${port}`));

