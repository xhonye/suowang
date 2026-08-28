import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseRuntime } from '../src/server/database.mjs';
import { migrationsDir } from './helpers.mjs';

test('an existing v1 database gains minimal steps, ongoing-item support, and workspace preference without losing todos', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'suowang-migration-test-'));
  const dataDir = join(root, 'data');
  const v1Migrations = join(root, 'v1-migrations');
  let upgradedRuntime;
  mkdirSync(v1Migrations, { recursive: true });
  copyFileSync(join(migrationsDir, '001_init.sql'), join(v1Migrations, '001_init.sql'));
  context.after(() => {
    upgradedRuntime?.close();
    rmSync(root, { recursive: true, force: true });
  });

  const oldRuntime = new DatabaseRuntime({ dataDir, migrationsDir: v1Migrations });
  oldRuntime.db.prepare('UPDATE app_settings SET display_name = ? WHERE singleton = 1').run('Honye');
  oldRuntime.db.prepare(`
    INSERT INTO todos(id, state_id, mainline_id, title, status, position, created_at, ended_at)
    VALUES ('td_legacy', 'work', NULL, '旧事项', 'active', 1, '2026-08-21T00:00:00.000Z', NULL)
  `).run();
  oldRuntime.close();

  upgradedRuntime = new DatabaseRuntime({ dataDir, migrationsDir });
  const todo = upgradedRuntime.db.prepare('SELECT title, minimal_step, kind FROM todos WHERE id = ?').get('td_legacy');
  assert.deepEqual(todo, { title: '旧事项', minimal_step: '', kind: 'single' });
  assert.ok(upgradedRuntime.db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'todo_occurrences'
  `).get());
  assert.equal(upgradedRuntime.db.prepare('SELECT cue FROM states WHERE id = ?').get('restore').cue, '休息好，才能重新出发。');
  assert.equal(upgradedRuntime.db.prepare('SELECT workspace_density FROM app_settings WHERE singleton = 1').get().workspace_density, 'small');
  assert.equal(upgradedRuntime.db.prepare('SELECT started_todo_id FROM states WHERE id = ?').get('work').started_todo_id, null);
  assert.equal(upgradedRuntime.db.prepare('SELECT display_name FROM app_settings WHERE singleton = 1').get().display_name, 'Honye');
  assert.equal(upgradedRuntime.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 6);
});
