import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import packageMetadata from '../package.json' with { type: 'json' };
import { createAppServer } from '../scripts/serve.mjs';
import { migrationsDir } from './helpers.mjs';

async function createServerHarness(context, options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-server-test-'));
  const server = await createAppServer({
    dataDir,
    migrationsDir,
    ensureBackup: false,
    clock: () => new Date('2026-08-21T00:00:00.000Z'),
    ...options,
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

async function requestWithHeaders(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('server exposes a database-backed health check, snapshot, and static shell', async (context) => {
  const baseUrl = await createServerHarness(context);
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: 'ok', app: 'suowang', version: packageMetadata.version, database: 'ready',
  });

  const snapshot = await fetch(`${baseUrl}/api/snapshot`);
  assert.equal(snapshot.status, 200);
  const snapshotBody = await snapshot.json();
  assert.deepEqual(snapshotBody.meta, { appVersion: packageMetadata.version, schemaVersion: 6 });
  assert.deepEqual(snapshotBody.states.map((state) => state.id), ['restore', 'work', 'life']);

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
  assert.match(shell, /mainline-scene-bright-office-v1-no-arrows-geometry-v5\.png/);
  assert.match(shell, /mainline-scene-bright-office-v1-arrow-restore-light-v2\.png/);
  assert.match(shell, /mainline-scene-bright-office-v1-arrow-work-light-v4\.png/);
  assert.match(shell, /mainline-scene-bright-office-v1-arrow-life-light-v2\.png/);
  assert.match(shell, /class="cockpit"/);
  assert.match(shell, /class="work-area"/);
  assert.match(shell, /class="dashboard-prompt"/);
  assert.match(shell, /我现在处于什么模式/);
  assert.match(shell, /<span>行迹<\/span>/);
  assert.match(shell, /id="priority-heading">下一步/);
  assert.match(shell, /id="mainline-todo-heading">主线事项/);
  assert.match(shell, /<h2>其他事项<\/h2>/);
  assert.match(shell, /id="daylight-icon"/);
  assert.doesNotMatch(shell, /沿当前方向|暂不归入主线|当前主线 Todo|状态 Todo|现在最值得做/);
  assert.doesNotMatch(shell, /mainline-scene-neutral|road-mist/);
  assert.doesNotMatch(shell, /时间线|开始专注|累计专注|notification-button|data-path-id/);

  const app = await fetch(`${baseUrl}/src/app.js`);
  assert.equal(app.status, 200);
  const appSource = await app.text();
  assert.match(appSource, /卡住了？/);
  assert.match(appSource, /data-stuck-action="minimal-step"/);
  assert.match(appSource, /data-stuck-action="restore"/);
  assert.doesNotMatch(appSource, /MAINLINE SLOT/);
  assert.doesNotMatch(appSource, /priority-source|class="priority-card" draggable/);
  assert.match(shell, /id="stuck-toggle"/);
  assert.match(appSource, /data-start-todo/);
  assert.match(appSource, /data-pause-todo/);
  assert.match(shell, /id="workspace-density-form"/);
  assert.equal(shell.match(/class="todo-kind-toggle"/g)?.length, 2);

  const styles = await fetch(`${baseUrl}/src/styles.css`);
  assert.equal(styles.status, 200);
  const stylesSource = await styles.text();
  assert.match(stylesSource, /scrollbar-gutter:\s*stable/);
  assert.match(stylesSource, /\.page-stage\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/);
  assert.match(shell, /class="road-chrome"/);
  assert.doesNotMatch(shell, /class="topbar"/);
  assert.match(stylesSource, /\.quick-add button\s*\{[^}]*min-width:\s*44px[^}]*height:\s*32px[^}]*font-size:\s*10px/);
  assert.match(stylesSource, /\.todo-row \.complete-button\s*\{[^}]*width:\s*32px[^}]*height:\s*32px[^}]*border-radius:\s*8px[^}]*font-size:\s*10px/);
  assert.match(stylesSource, /\.road-stage\s*\{[^}]*height:\s*clamp\(430px,\s*42vh,\s*460px\)/);
  assert.match(stylesSource, /\.road-image\s*\{[^}]*object-fit:\s*cover[^}]*object-position:\s*center 68%/);
  assert.match(stylesSource, /\.page-stage::\-webkit-scrollbar-thumb/);
  assert.doesNotMatch(stylesSource, /\.settings-page::\-webkit-scrollbar-thumb/);
  assert.doesNotMatch(stylesSource, /html::\-webkit-scrollbar-thumb/);
  assert.match(stylesSource, /\.road-stage\[data-active-state="restore"\]/);
  assert.match(stylesSource, /object-fit:\s*cover/);
  assert.match(stylesSource, /env\(safe-area-inset-bottom\)/);
  assert.match(stylesSource, /--workspace-sky-crop/);
  assert.match(stylesSource, /data-workspace-density="max"/);
  assert.match(stylesSource, /priority-departure/);
  assert.match(stylesSource, /\.mainline-slots:has\(\.create-mainline-form\)/);
  assert.doesNotMatch(stylesSource, /grid-auto-columns:\s*min\(82vw/);
  assert.match(stylesSource, /\.todo-list\s*\{[^}]*max-height:\s*230px/);
  assert.doesNotMatch(stylesSource, /\.todo-column\s*\{\s*min-height:\s*260px/);
  assert.match(stylesSource, /@media \(max-width: 900px\)[\s\S]*?\.priority-zone\s*\{[^}]*height:\s*214px/);
  assert.match(stylesSource, /@media \(max-width: 420px\)[\s\S]*?\.priority-zone\.stuck-open\s*\{[^}]*height:\s*236px/);
  assert.doesNotMatch(appSource, /持续事项 · 累计/);
  assert.match(appSource, /class="todo-ongoing-count"/);
  assert.match(appSource, /class="priority-ongoing-count"/);
  assert.doesNotMatch(stylesSource, /\.todo-ongoing-badge/);
  assert.doesNotMatch(stylesSource, /\.todo-row\.completed-today/);
  assert.match(appSource, /data-record-todo/);
  assert.match(appSource, /撤回今天/);
  assert.doesNotMatch(appSource, />进行中</);
  assert.match(appSource, /<span class="mainline-state">当前主线<\/span>/);
  assert.match(appSource, /<circle cx="6" cy="12" r="1\.65"\/>/);
  assert.match(appSource, />完成事项<\/button>/);
  assert.match(appSource, />放弃事项<\/button>/);
  assert.match(appSource, /本阶段完成标准/);
  assert.match(appSource, /本阶段时间范围/);
  assert.doesNotMatch(appSource, /pageStage\.scrollTop > 20/);
  assert.match(appSource, /history\.scrollRestoration = 'manual'/);
  assert.match(appSource, /mainline-todo-form'\)\.querySelector\('button\[type="submit"\]'\)/);
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
    body: JSON.stringify({
      stateId: 'work',
      mainlineId: mainline.id,
      title: 'API 下一步',
      minimalStep: '先打开文件',
    }),
  });
  assert.equal(todo.response.status, 201);
  assert.equal(todo.body.states.find((state) => state.id === 'work').priorityTodoId, todo.body.states[1].mainlines[0].todos[0].id);
  const todoId = todo.body.states[1].mainlines[0].todos[0].id;
  assert.equal(todo.body.states[1].mainlines[0].todos[0].minimalStep, '先打开文件');

  const edited = await jsonRequest(`${baseUrl}/api/todos/${todoId}`, {
    method: 'PATCH',
    body: JSON.stringify({ minimalStep: '只写第一行' }),
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.states[1].mainlines[0].todos[0].minimalStep, '只写第一行');

  const started = await jsonRequest(`${baseUrl}/api/todos/${todoId}/start`, { method: 'POST' });
  assert.equal(started.response.status, 200);
  assert.equal(started.body.states[1].startedTodoId, todoId);
  const paused = await jsonRequest(`${baseUrl}/api/todos/${todoId}/pause`, { method: 'POST' });
  assert.equal(paused.response.status, 200);
  assert.equal(paused.body.states[1].startedTodoId, null);

  const completed = await jsonRequest(`${baseUrl}/api/todos/${todoId}/complete`, { method: 'POST' });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.history.find((item) => item.id === todoId).status, 'completed');
  const reopened = await jsonRequest(`${baseUrl}/api/todos/${todoId}/reopen`, { method: 'POST' });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.states[1].mainlines[0].todos[0].id, todoId);
  assert.equal(reopened.body.history.some((item) => item.id === todoId), false);

  const ongoing = await jsonRequest(`${baseUrl}/api/todos/${todoId}`, {
    method: 'PATCH', body: JSON.stringify({ kind: 'ongoing' }),
  });
  assert.equal(ongoing.body.states[1].mainlines[0].todos[0].kind, 'ongoing');
  const recorded = await jsonRequest(`${baseUrl}/api/todos/${todoId}/record`, { method: 'POST' });
  assert.equal(recorded.body.states[1].mainlines[0].todos[0].completionCount, 1);
  assert.equal(recorded.body.states[1].mainlines[0].todos[0].completedToday, true);
  const undone = await jsonRequest(`${baseUrl}/api/todos/${todoId}/undo-record`, { method: 'POST' });
  assert.equal(undone.body.states[1].mainlines[0].todos[0].completionCount, 0);

  const invalid = await jsonRequest(`${baseUrl}/api/mainlines`, {
    method: 'POST',
    body: JSON.stringify({ stateId: 'unknown', slotIndex: 1, name: '错误状态' }),
  });
  assert.equal(invalid.response.status, 404);
  assert.equal(invalid.body.error.code, 'state_not_found');
  assert.match(invalid.body.error.message, /模式/);
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

test('tailscale mode accepts only its discovered address and same origin', async (context) => {
  const baseUrl = await createServerHarness(context, {
    allowedHosts: ['127.0.0.1', 'localhost', '100.64.0.42'],
  });
  const allowed = await requestWithHeaders(`${baseUrl}/health`, {
    host: '100.64.0.42:2037',
  });
  assert.equal(allowed.status, 200);

  const denied = await requestWithHeaders(`${baseUrl}/health`, {
    host: '192.168.1.20:2037',
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'invalid_host');

  const crossOrigin = await requestWithHeaders(`${baseUrl}/api/snapshot`, {
    host: '100.64.0.42:2037',
    origin: 'http://100.68.113.59:2037',
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.body.error.code, 'invalid_origin');
});
