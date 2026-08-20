import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createAppServer } from '../scripts/serve.mjs';

test('server exposes health and the prototype shell', async (context) => {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', app: 'suowang', version: '0.1.0' });

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /所往 SUOWANG/);
  assert.match(html, /三条候选路径|我的主线/);
  assert.match(html, /class="side-nav"/);
  assert.match(html, /方向比速度更重要/);
  assert.match(html, /你正在走向更好的自己/);
  assert.equal(html.match(/data-route-scene=/g)?.length, 3);
  assert.match(html, /mainline-scene-neutral-v1\.webp/);
  assert.doesNotMatch(html, /<mask|route-vector|mainline-arrows-(?:base|highlight)-v2/);
  assert.doesNotMatch(html, /aria-label="通知"|state-panel|>Pro</);
});

test('server rejects traversal and missing files', async (context) => {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/missing.txt`);
  assert.equal(response.status, 404);
});
