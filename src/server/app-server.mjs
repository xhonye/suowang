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
import { DatabaseRuntime } from './database.mjs';
import { APP_NAME, APP_VERSION } from './app-meta.mjs';
import { AppError, SuowangService } from './service.mjs';
import {
  PROJECT_ROOT,
  resolveDataDir,
} from './config.mjs';
import { acquireInstanceLock } from './instance-lock.mjs';

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

const publicAssetExtensions = new Set(['.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');
const securityHeaders = {
  'content-security-policy': contentSecurityPolicy,
  'cross-origin-opener-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

function removeIfPresent(path) {
  if (existsSync(path)) unlinkSync(path);
}
function isPathInside(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative !== '' && !childRelative.startsWith('..') && !childRelative.includes(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

export function createStaticResolver(resourceRoot = PROJECT_ROOT) {
  const root = normalize(resourceRoot);
  const publicFiles = new Set([
    join(root, 'index.html'),
    join(root, 'src', 'app.js'),
    join(root, 'src', 'api.js'),
    join(root, 'src', 'view-model.js'),
    join(root, 'src', 'styles.css'),
  ].map(normalize));
  const assetsDir = join(root, 'assets');
  return function resolveRequestPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const requested = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = normalize(join(root, requested));
  const targetRelative = relative(root, target);
  if (targetRelative.startsWith('..') || targetRelative.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    return null;
  }
  if (publicFiles.has(target)) return target;
  if (isPathInside(assetsDir, target) && publicAssetExtensions.has(extname(target).toLowerCase())) {
    return target;
  }
  return null;
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...securityHeaders,
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

function assertTrustedRequest(request, allowedHosts) {
  const host = String(request.headers.host ?? '').toLowerCase();
  const hostname = host.replace(/:\d{1,5}$/, '');
  if (!allowedHosts.has(hostname)) {
    throw new AppError(403, 'invalid_host', 'SUOWANG 拒绝了未授权地址的访问。');
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
    ...securityHeaders,
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

async function handleApi(request, response, url, { runtime, service, clock, accessMode }) {
  const { pathname } = url;
  const method = request.method ?? 'GET';

  if (pathname === '/health' && method === 'GET') {
    sendJson(response, 200, {
      status: 'ok',
      app: APP_NAME,
      version: APP_VERSION,
      database: 'ready',
      schemaVersion: runtime.getCurrentSchemaVersion(),
      pid: process.pid,
      accessMode,
    });
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

  const todoAction = /^\/api\/todos\/([^/]+)\/(complete|abandon|reopen|record|undo-record|move|priority|start|pause)$/.exec(pathname);
  if (todoAction && method === 'POST') {
    const [, id, action] = todoAction;
    const result = action === 'complete'
      ? service.endTodo(id, 'completed')
      : action === 'abandon'
        ? service.endTodo(id, 'abandoned')
        : action === 'reopen'
          ? service.reopenTodo(id)
          : action === 'record'
            ? service.recordTodoOccurrence(id)
            : action === 'undo-record'
            ? service.undoTodoOccurrence(id)
          : action === 'move'
            ? service.moveTodo(id, await readJson(request))
            : action === 'priority'
              ? service.setPriorityTodo(id)
              : action === 'start'
                ? service.startPriorityTodo(id)
                : service.pausePriorityTodo(id);
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
  resourceRoot = PROJECT_ROOT,
  migrationsDir = join(resourceRoot, 'migrations'),
  clock = () => new Date(),
  ensureBackup = true,
  allowedHosts = ['127.0.0.1', 'localhost'],
  closeRuntimeOnServerClose = true,
  accessMode = 'local',
} = {}) {
  const resolveRequestPath = createStaticResolver(resourceRoot);
  const runtime = new DatabaseRuntime({ dataDir, migrationsDir });
  const service = new SuowangService(runtime, { clock });
  if (ensureBackup) await runtime.ensureDailyBackup(clock());

  const trustedHosts = new Set(allowedHosts.map((host) => String(host).toLowerCase()));
  const requestListener = async (request, response) => {
    try {
      assertTrustedRequest(request, trustedHosts);
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (await handleApi(request, response, url, { runtime, service, clock, accessMode })) return;

      const target = resolveRequestPath(url.pathname);
      if (!target || !existsSync(target) || !statSync(target).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders });
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'content-type': mimeTypes.get(extname(target)) ?? 'application/octet-stream',
        'cache-control': 'no-store',
        ...securityHeaders,
      });
      createReadStream(target).pipe(response);
    } catch (error) {
      if (!response.headersSent) sendError(response, error);
      else response.destroy(error);
    }
  };
  const server = createServer(requestListener);
  server.runtime = runtime;
  server.service = service;
  server.createSibling = () => createServer(requestListener);
  if (closeRuntimeOnServerClose) server.on('close', () => runtime.close());
  return server;
}

export function createGracefulShutdown({ listeners, runtime, onError = console.error }) {
  let shuttingDown = false;
  return async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    let failure = null;
    const results = await Promise.allSettled(listeners.map((listener) => new Promise((resolve, reject) => {
      if (!listener.listening) return resolve();
      listener.close((error) => error ? reject(error) : resolve());
      listener.closeIdleConnections?.();
      listener.closeAllConnections?.();
    })));
    failure = results.find((result) => result.status === 'rejected')?.reason ?? null;
    try {
      runtime.close();
    } catch (error) {
      failure ??= error;
    }
    if (failure) {
      onError('SUOWANG shutdown failed:', failure);
      process.exitCode = 1;
    }
  };
}

function listen(listener, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      listener.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      listener.off('error', onError);
      resolve();
    };
    listener.once('error', onError);
    listener.once('listening', onListening);
    listener.listen(port, host);
  });
}

export async function startAppServer({
  dataDir = resolveDataDir(),
  resourceRoot = PROJECT_ROOT,
  migrationsDir = join(resourceRoot, 'migrations'),
  host = '127.0.0.1',
  port = 0,
  extraHosts = [],
  allowedHosts = ['127.0.0.1', 'localhost'],
  accessMode = 'local',
  ensureBackup = true,
  clock = () => new Date(),
  lockKind = 'server',
  acquireLock = acquireInstanceLock,
} = {}) {
  const instanceLock = acquireLock({ dataDir, kind: lockKind });
  let server;
  const listeners = [];
  let closed = false;
  try {
    server = await createAppServer({
      dataDir,
      resourceRoot,
      migrationsDir,
      allowedHosts,
      accessMode,
      ensureBackup,
      clock,
      closeRuntimeOnServerClose: false,
    });
    listeners.push(server);
    await listen(server, port, host);
    const actualPort = server.address().port;
    for (const extraHost of extraHosts) {
      const sibling = server.createSibling();
      listeners.push(sibling);
      await listen(sibling, actualPort, extraHost);
    }
    const close = async () => {
      if (closed) return;
      closed = true;
      const shutdown = createGracefulShutdown({ listeners, runtime: server.runtime });
      try {
        await shutdown();
      } finally {
        instanceLock.release();
      }
    };
    return {
      server,
      listeners,
      origin: `http://${host}:${actualPort}`,
      actualPort,
      runtime: server.runtime,
      service: server.service,
      instanceLock,
      close,
    };
  } catch (error) {
    if (server?.runtime) {
      const shutdown = createGracefulShutdown({ listeners, runtime: server.runtime });
      await shutdown();
    }
    instanceLock.release();
    throw error;
  }
}
