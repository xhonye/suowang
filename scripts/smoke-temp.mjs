import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_VERSION } from '../src/server/app-meta.mjs';
import { createAppServer } from './serve.mjs';

const dataDir = mkdtempSync(join(tmpdir(), 'suowang-smoke-'));
const requestedPort = Number(process.env.SUOWANG_SMOKE_PORT ?? 0);
let port;
let baseUrl;
let server;

async function openServer() {
  server = await createAppServer({ dataDir, ensureBackup: false });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '127.0.0.1', resolve);
  });
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
}

async function closeServer() {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: options.body === undefined
      ? { connection: 'close', ...options.headers }
      : { connection: 'close', 'content-type': 'application/json', ...options.headers },
  });
  const body = await response.json();
  assert.ok(response.ok, `${options.method ?? 'GET'} ${path} failed: ${JSON.stringify(body)}`);
  return body;
}

try {
  await openServer();
  assert.notEqual(port, 2037);

  const health = await json('/health');
  assert.equal(health.version, APP_VERSION);
  assert.equal(health.database, 'ready');

  const createdMainline = await json('/api/mainlines', {
    method: 'POST',
    body: JSON.stringify({ stateId: 'work', slotIndex: 1, name: '临时烟测主线' }),
  });
  const mainline = createdMainline.states.find((state) => state.id === 'work').mainlines[0];
  const createdTodo = await json('/api/todos', {
    method: 'POST',
    body: JSON.stringify({
      stateId: 'work',
      mainlineId: mainline.id,
      title: '临时烟测事项',
      minimalStep: '先确认数据落盘',
    }),
  });
  const todoId = createdTodo.states.find((state) => state.id === 'work').mainlines[0].todos[0].id;

  await closeServer();
  await openServer();
  const restarted = await json('/api/snapshot');
  assert.equal(restarted.states.find((state) => state.id === 'work').mainlines[0].todos[0].id, todoId);

  const exported = await fetch(`${baseUrl}/api/export/sqlite`, { headers: { connection: 'close' } });
  assert.ok(exported.ok);
  const backup = await exported.arrayBuffer();

  await json(`/api/mainlines/${mainline.id}`, {
    method: 'DELETE',
    body: JSON.stringify({ todoPolicy: 'delete' }),
  });
  const restored = await fetch(`${baseUrl}/api/import/sqlite`, {
    method: 'POST',
    headers: { connection: 'close', 'content-type': 'application/vnd.sqlite3' },
    body: backup,
  });
  if (!restored.ok) throw new Error(`restore failed: ${await restored.text()}`);
  const restoredSnapshot = await restored.json();
  assert.equal(restoredSnapshot.states.find((state) => state.id === 'work').mainlines[0].todos[0].id, todoId);

  const finalHealth = await json('/health');
  assert.equal(finalHealth.version, APP_VERSION);
  console.log(`temporary smoke OK: ${APP_VERSION}, schema ${finalHealth.schemaVersion}, port ${port}`);
} finally {
  await closeServer().catch(() => {});
  const expectedPrefix = join(tmpdir(), 'suowang-smoke-');
  if (!dataDir.startsWith(expectedPrefix)) throw new Error(`Refusing to remove unexpected path: ${dataDir}`);
  rmSync(dataDir, { recursive: true, force: true });
}
