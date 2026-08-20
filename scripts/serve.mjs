import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const requested = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = normalize(join(root, requested));
  const targetRelative = relative(root, target);
  if (targetRelative.startsWith('..') || targetRelative.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    return null;
  }
  return target;
}
export function createAppServer() {
  return createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ status: 'ok', app: 'suowang', version: '0.1.0' }));
      return;
    }

    const target = resolveRequestPath(request.url ?? '/');
    if (!target || !existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(target)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(target).pipe(response);
  });
}

const isDirectRun = process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const port = Number(process.env.SUOWANG_PORT ?? 2037);
  createAppServer().listen(port, '127.0.0.1', () => {
    console.log(`SUOWANG prototype: http://127.0.0.1:${port}/`);
  });
}
