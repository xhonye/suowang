import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAppServer } from '../scripts/serve.mjs';
import { migrationsDir } from './helpers.mjs';

async function createServerHarness(context) {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-server-test-'));
  const server = await createAppServer({
    dataDir,
    migrationsDir,
    ensureBackup: false,
    clock: () => new Date('2026-08-21T00:00:00.000Z'),
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    rmSync(dataDir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json', ...options.headers } : options.headers,
  });
  return { response, body: await response.json() };
}

test('server exposes a database-backed health check, snapshot, and static shell', async (context) => {
  const baseUrl = await createServerHarness(context);
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: 'ok', app: 'suowang', version: '0.1.0', database: 'ready',
  });

  const snapshot = await fetch(`${baseUrl}/api/snapshot`);
  assert.equal(snapshot.status, 200);
  assert.deepEqual((await snapshot.json()).states.map((state) => state.id), ['restore', 'work', 'life']);

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  const shell = await home.text();
  assert.match(shell, /人生主线驾驶舱/);
  assert.match(shell, /data-page="dashboard"/);
  assert.match(shell, /data-page="history"/);
  assert.match(shell, /data-page="settings"/);
  assert.equal(shell.match(/data-road-scene=/g)?.length, 3);
  assert.match(shell, /class="road-stage"/);
  assert.doesNotMatch(shell, /class="road-field"/);
  assert.match(shell, /id="route-tabs" role="tablist"/);
  assert.doesNotMatch(shell, /id="state-tabs"|id="road-switches"/);
  assert.match(shell, /mainline-scene-restore-v3\.webp/);
  assert.match(shell, /mainline-scene-work-v3\.webp/);
  assert.match(shell, /mainline-scene-life-v3\.webp/);
  assert.doesNotMatch(shell, /mainline-scene-neutral|road-mist/);
  assert.doesNotMatch(shell, /时间线|开始专注|累计专注|notification-button|data-path-id/);
});

test('API mutations return the new authoritative snapshot and readable errors', async (context) => {
  const baseUrl = await createServerHarness(context);
  const created = await jsonRequest(`${baseUrl}/api/mainlines`, {
    method: 'POST',
    body: JSON.stringify({ stateId: 'work', slotIndex: 1, name: 'API 主线' }),
  });
  assert.equal(created.response.status, 201);
  const mainline = created.body.states.find((state) => state.id === 'work').mainlines[0];

  const todo = await jsonRequest(`${baseUrl}/api/todos`, {
    method: 'POST',
    body: JSON.stringify({ stateId: 'work', mainlineId: mainline.id, title: 'API 下一步' }),
  });
  assert.equal(todo.response.status, 201);
  assert.equal(todo.body.states.find((state) => state.id === 'work').priorityTodoId, todo.body.states[1].mainlines[0].todos[0].id);

  const invalid = await jsonRequest(`${baseUrl}/api/mainlines`, {
    method: 'POST',
    body: JSON.stringify({ stateId: 'unknown', slotIndex: 1, name: '错误状态' }),
  });
  assert.equal(invalid.response.status, 404);
  assert.equal(invalid.body.error.code, 'state_not_found');
  assert.match(invalid.body.error.message, /状态/);
});

test('server exports JSON and rejects missing or traversal paths', async (context) => {
  const baseUrl = await createServerHarness(context);
  const exported = await fetch(`${baseUrl}/api/export/json`);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition'), /suowang-export\.json/);
  assert.equal((await exported.json()).format, 'SUOWANG readable export');

  assert.equal((await fetch(`${baseUrl}/missing.txt`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/..%2Fpackage.json`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/package.json`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/src/server/service.mjs`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/.git/config`)).status, 404);
});

test('SQLite download and upload perform a whole-database restore', async (context) => {
  const baseUrl = await createServerHarness(context);
  const created = await jsonRequest(`${baseUrl}/api/mainlines`, {
    method: 'POST',
    body: JSON.stringify({ stateId: 'life', slotIndex: 1, name: '恢复验证主线' }),
  });
  const mainline = created.body.states.find((state) => state.id === 'life').mainlines[0];

  const exported = await fetch(`${baseUrl}/api/export/sqlite`);
  assert.equal(exported.status, 200);
  const bytes = await exported.arrayBuffer();
  const removed = await jsonRequest(`${baseUrl}/api/mainlines/${mainline.id}`, {
    method: 'DELETE',
    body: JSON.stringify({ todoPolicy: 'delete' }),
  });
  assert.equal(removed.body.states.find((state) => state.id === 'life').mainlines.length, 0);

  const restored = await fetch(`${baseUrl}/api/import/sqlite`, {
    method: 'POST',
    headers: { 'content-type': 'application/vnd.sqlite3' },
    body: bytes,
  });
  assert.equal(restored.status, 200);
  const restoredSnapshot = await restored.json();
  assert.equal(restoredSnapshot.states.find((state) => state.id === 'life').mainlines[0].id, mainline.id);
});

test('restore rejects a non-SUOWANG file with a useful error', async (context) => {
  const baseUrl = await createServerHarness(context);
  const response = await fetch(`${baseUrl}/api/import/sqlite`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: Buffer.from('not a sqlite database'),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'invalid_restore');
  assert.match(body.error.message, /不是可恢复的 SUOWANG 数据库/);
});

test('server rejects cross-origin and non-JSON mutation attempts', async (context) => {
  const baseUrl = await createServerHarness(context);
  const crossOrigin = await fetch(`${baseUrl}/api/mainlines`, {
    method: 'POST',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' },
    body: JSON.stringify({ stateId: 'work', slotIndex: 1, name: '不应创建' }),
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, 'invalid_origin');

  const textPlain = await fetch(`${baseUrl}/api/mainlines`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ stateId: 'work', slotIndex: 1, name: '仍不应创建' }),
  });
  assert.equal(textPlain.status, 415);
  assert.equal((await textPlain.json()).error.code, 'json_required');

  const snapshot = await (await fetch(`${baseUrl}/api/snapshot`)).json();
  assert.equal(snapshot.states.find((state) => state.id === 'work').mainlines.length, 0);
});
