import { randomUUID } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseRuntime } from '../src/server/database.mjs';
import { AppError, SuowangService } from '../src/server/service.mjs';
import {
  MIGRATIONS_DIR,
  PROJECT_ROOT,
  resolveDataDir,
  resolvePort,
} from '../src/server/config.mjs';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

const avatarExtensions = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);

const publicFiles = new Set([
  join(PROJECT_ROOT, 'index.html'),
  join(PROJECT_ROOT, 'src', 'app.js'),
  join(PROJECT_ROOT, 'src', 'api.js'),
  join(PROJECT_ROOT, 'src', 'view-model.js'),
  join(PROJECT_ROOT, 'src', 'styles.css'),
].map(normalize));
const publicAssetExtensions = new Set(['.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

function removeIfPresent(path) {
  if (existsSync(path)) unlinkSync(path);
}
function isPathInside(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative !== '' && !childRelative.startsWith('..') && !childRelative.includes(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

function resolveRequestPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const requested = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = normalize(join(PROJECT_ROOT, requested));
  const targetRelative = relative(PROJECT_ROOT, target);
  if (targetRelative.startsWith('..') || targetRelative.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    return null;
  }
  if (publicFiles.has(target)) return target;
  const assetsDir = join(PROJECT_ROOT, 'assets');
  if (isPathInside(assetsDir, target) && publicAssetExtensions.has(extname(target).toLowerCase())) {
    return target;
  }
  return null;
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function sendError(response, error) {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'internal_error', 'SUOWANG 没能完成这次操作。请重试；若仍失败，请从启动入口查看错误。');
  if (!(error instanceof AppError)) console.error(error);
  sendJson(response, appError.status, {
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
  });
}

function assertLocalRequest(request) {
  const host = String(request.headers.host ?? '').toLowerCase();
  if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host)) {
    throw new AppError(403, 'invalid_host', 'SUOWANG 只接受本机访问。');
  }
  const origin = request.headers.origin;
  if (origin && origin !== `http://${host}`) {
    throw new AppError(403, 'invalid_origin', 'SUOWANG 拒绝了其他网页发起的本地数据请求。');
  }
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) {
      throw new AppError(413, 'payload_too_large', '上传文件超过允许大小。');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new AppError(415, 'json_required', '这个操作只接受 JSON 请求。');
  }
  const body = await readBody(request, 1024 * 1024);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new AppError(400, 'invalid_json', '请求内容不是有效 JSON。');
  }
}

function sendDownload(response, path, { contentType, fileName, removeAfter = false }) {
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': statSync(path).size,
    'content-disposition': `attachment; filename="${fileName}"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const stream = createReadStream(path);
  const cleanup = () => {
    if (removeAfter) removeIfPresent(path);
  };
  stream.on('error', (error) => {
    cleanup();
    response.destroy(error);
  });
  response.on('close', cleanup);
  stream.pipe(response);
}

async function handleApi(request, response, url, { runtime, service, clock }) {
  const { pathname } = url;
  const method = request.method ?? 'GET';

  if (pathname === '/health' && method === 'GET') {
    sendJson(response, 200, { status: 'ok', app: 'suowang', version: '0.1.0', database: 'ready' });
    return true;
  }
  if (pathname === '/api/snapshot' && method === 'GET') {
    sendJson(response, 200, service.snapshot());
    return true;
  }
  if (pathname === '/api/app-state' && method === 'PATCH') {
    sendJson(response, 200, service.updateAppState(await readJson(request)));
    return true;
  }
  if (pathname === '/api/settings' && method === 'PATCH') {
    sendJson(response, 200, service.updateSettings(await readJson(request)));
    return true;
  }

  const stateMatch = /^\/api\/states\/([^/]+)$/.exec(pathname);
  if (stateMatch && method === 'PATCH') {
    sendJson(response, 200, service.updateState(stateMatch[1], await readJson(request)));
    return true;
  }

  if (pathname === '/api/mainlines' && method === 'POST') {
    sendJson(response, 201, service.createMainline(await readJson(request)));
    return true;
  }
  const mainlineMatch = /^\/api\/mainlines\/([^/]+)$/.exec(pathname);
  if (mainlineMatch && method === 'PATCH') {
    sendJson(response, 200, service.updateMainline(mainlineMatch[1], await readJson(request)));
    return true;
  }
  if (mainlineMatch && method === 'DELETE') {
    sendJson(response, 200, service.deleteMainline(mainlineMatch[1], await readJson(request)));
    return true;
  }

  const mainlineAction = /^\/api\/mainlines\/([^/]+)\/(current|slot|end|copy)$/.exec(pathname);
  if (mainlineAction && method === 'POST') {
    const [, id, action] = mainlineAction;
    const body = await readJson(request);
    const result = action === 'current'
      ? service.setCurrentMainline(id)
      : action === 'slot'
        ? service.moveMainlineSlot(id, body.slotIndex)
        : action === 'end'
          ? service.endMainline(id, body)
          : service.copyMainline(id, body);
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === '/api/todos' && method === 'POST') {
    sendJson(response, 201, service.createTodo(await readJson(request)));
    return true;
  }
  const todoMatch = /^\/api\/todos\/([^/]+)$/.exec(pathname);
  if (todoMatch && method === 'PATCH') {
    sendJson(response, 200, service.updateTodo(todoMatch[1], await readJson(request)));
    return true;
  }
  if (todoMatch && method === 'DELETE') {
    sendJson(response, 200, service.deleteTodo(todoMatch[1]));
    return true;
  }

  const todoAction = /^\/api\/todos\/([^/]+)\/(complete|abandon|move|priority)$/.exec(pathname);
  if (todoAction && method === 'POST') {
    const [, id, action] = todoAction;
    const result = action === 'complete'
      ? service.endTodo(id, 'completed')
      : action === 'abandon'
        ? service.endTodo(id, 'abandoned')
        : action === 'move'
          ? service.moveTodo(id, await readJson(request))
          : service.setPriorityTodo(id);
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === '/api/export/json' && method === 'GET') {
    const body = Buffer.from(`${JSON.stringify(service.exportReadable(), null, 2)}\n`);
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': body.length,
      'content-disposition': 'attachment; filename="suowang-export.json"',
      'cache-control': 'no-store',
    });
    response.end(body);
    return true;
  }

  if (pathname === '/api/export/sqlite' && method === 'GET') {
    const path = await runtime.createDownloadBackup(clock());
    sendDownload(response, path, {
      contentType: 'application/vnd.sqlite3',
      fileName: 'suowang-backup.db',
      removeAfter: true,
    });
    return true;
  }

  if (pathname === '/api/import/sqlite' && method === 'POST') {
    const bytes = await readBody(request, 250 * 1024 * 1024);
    if (!bytes.length) throw new AppError(400, 'empty_restore', '请选择要恢复的 SQLite 文件。');
    const incoming = join(runtime.tempDir, `incoming-${randomUUID()}.db`);
    writeFileSync(incoming, bytes);
    try {
      try {
        runtime.validateRestoreFile(incoming);
      } catch (error) {
        throw new AppError(400, 'invalid_restore', `这个文件不是可恢复的 SUOWANG 数据库：${error.message}`);
      }
      await runtime.restoreFrom(incoming, clock());
      sendJson(response, 200, service.snapshot());
    } finally {
      removeIfPresent(incoming);
    }
    return true;
  }

  if (pathname === '/api/avatar' && method === 'POST') {
    const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const extension = avatarExtensions.get(contentType);
    if (!extension) {
      throw new AppError(415, 'unsupported_avatar', '头像只支持 PNG、JPEG 或 WebP。');
    }
    const bytes = await readBody(request, 5 * 1024 * 1024);
    if (!bytes.length) throw new AppError(400, 'empty_avatar', '请选择头像图片。');
    const temporary = join(runtime.profileDir, `avatar-${randomUUID()}${extension}`);
    const destination = join(runtime.profileDir, `avatar${extension}`);
    writeFileSync(temporary, bytes);
    for (const name of readdirSync(runtime.profileDir)) {
      if (name.startsWith('avatar.') || name.startsWith('avatar-')) {
        const path = join(runtime.profileDir, name);
        if (path !== temporary) removeIfPresent(path);
      }
    }
    renameSync(temporary, destination);
    sendJson(response, 200, service.setAvatarPath(`profile/avatar${extension}`));
    return true;
  }

  if (pathname === '/api/avatar' && method === 'GET') {
    const settings = runtime.db.prepare('SELECT avatar_path FROM app_settings WHERE singleton = 1').get();
    if (!settings.avatar_path) throw new AppError(404, 'avatar_not_found', '尚未设置本地头像。');
    const path = normalize(join(runtime.dataDir, settings.avatar_path));
    if (!existsSync(path) || !statSync(path).isFile() || !isPathInside(runtime.dataDir, path)) {
      throw new AppError(404, 'avatar_not_found', '本地头像文件不存在。');
    }
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(path)) ?? 'application/octet-stream',
      'content-length': statSync(path).size,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(path).pipe(response);
    return true;
  }

  if (pathname.startsWith('/api/')) {
    throw new AppError(404, 'api_not_found', '未找到这个 SUOWANG 操作。');
  }
  return false;
}

export async function createAppServer({
  dataDir = resolveDataDir(),
  migrationsDir = MIGRATIONS_DIR,
  clock = () => new Date(),
  ensureBackup = true,
} = {}) {
  const runtime = new DatabaseRuntime({ dataDir, migrationsDir });
  const service = new SuowangService(runtime, { clock });
  if (ensureBackup) await runtime.ensureDailyBackup(clock());

  const server = createServer(async (request, response) => {
    try {
      assertLocalRequest(request);
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (await handleApi(request, response, url, { runtime, service, clock })) return;

      const target = resolveRequestPath(url.pathname);
      if (!target || !existsSync(target) || !statSync(target).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'content-type': mimeTypes.get(extname(target)) ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      createReadStream(target).pipe(response);
    } catch (error) {
      if (!response.headersSent) sendError(response, error);
      else response.destroy(error);
    }
  });
  server.runtime = runtime;
  server.service = service;
  server.on('close', () => runtime.close());
  return server;
}

const isDirectRun = process.argv[1]
  && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const port = resolvePort();
  const server = await createAppServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`SUOWANG: http://127.0.0.1:${port}/`);
    console.log(`Data: ${server.runtime.describe().databasePath}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
