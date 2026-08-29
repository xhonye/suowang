import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseRuntime } from '../../src/server/database.mjs';
import { createStaticResolver, startAppServer } from '../../src/server/app-server.mjs';
import { INSTANCE_LOCK_FILE, InstanceLockError } from '../../src/server/instance-lock.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('desktop server uses a dynamic loopback port and closes database plus lock', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-desktop-server-'));
  let running;
  try {
    running = await startAppServer({ dataDir, resourceRoot: root, ensureBackup: false, lockKind: 'test-desktop' });
    assert.equal(running.origin, `http://127.0.0.1:${running.actualPort}`);
    assert.ok(running.actualPort > 0);
    const health = await (await fetch(`${running.origin}/health`)).json();
    assert.equal(health.status, 'ok');
    await assert.rejects(
      startAppServer({ dataDir, resourceRoot: root, ensureBackup: false }),
      (error) => error instanceof InstanceLockError,
    );
    await running.close();
    running = null;
    assert.equal(existsSync(join(dataDir, INSTANCE_LOCK_FILE)), false);
    const reopened = new DatabaseRuntime({ dataDir, migrationsDir: join(root, 'migrations') });
    reopened.close();
  } finally {
    if (running) await running.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('packaged static resolver stays inside an explicit resource root', () => {
  const packagedRoot = normalize(join(root, 'packaged-fixture', 'app.asar'));
  const resolveStatic = createStaticResolver(packagedRoot);
  assert.equal(resolveStatic('/index.html'), join(packagedRoot, 'index.html'));
  assert.equal(resolveStatic('/src/app.js'), join(packagedRoot, 'src', 'app.js'));
  assert.equal(resolveStatic('/assets/brand/favicon.png'), join(packagedRoot, 'assets', 'brand', 'favicon.png'));
  assert.equal(resolveStatic('/../package-lock.json'), null);
  assert.equal(resolveStatic('/tests/private.test.mjs'), null);
});
