import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { DatabaseRuntime } from '../src/server/database.mjs';
import { SuowangService } from '../src/server/service.mjs';
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
  assert.equal(upgradedRuntime.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 7);

  const migrationBackups = readdirSync(join(dataDir, 'backups')).filter((name) => name.startsWith('pre-migrate-v1-to-v7-'));
  assert.equal(migrationBackups.length, 1);
  const backup = new Database(join(dataDir, 'backups', migrationBackups[0]), { readonly: true, fileMustExist: true });
  try {
    assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(backup.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 1);
    assert.equal(backup.prepare('SELECT title FROM todos WHERE id = ?').get('td_legacy').title, '旧事项');
  } finally {
    backup.close();
  }
});

test('a v0.1.2-style database rekeys mainline names without changing visible facts', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'suowang-mainline-rekey-test-'));
  const dataDir = join(root, 'data');
  const v6Migrations = join(root, 'v6-migrations');
  let upgradedRuntime;
  mkdirSync(v6Migrations, { recursive: true });
  for (const file of readdirSync(migrationsDir).filter((name) => /^00[1-6]_/.test(name))) {
    copyFileSync(join(migrationsDir, file), join(v6Migrations, file));
  }
  context.after(() => {
    upgradedRuntime?.close();
    rmSync(root, { recursive: true, force: true });
  });

  const oldRuntime = new DatabaseRuntime({ dataDir, migrationsDir: v6Migrations });
  oldRuntime.db.prepare(`
    INSERT INTO mainlines(
      id, state_id, slot_index, name, normalized_name,
      goal, success_criteria, horizon, status, created_at, ended_at
    ) VALUES
      ('ml_active', 'work', 1, '原样 名称', '原样 名称', '', '', '', 'active', '2026-08-21T00:00:00.000Z', NULL),
      ('ml_history', 'life', 1, '已经结束', '已经结束', '', '', '', 'completed', '2026-08-20T00:00:00.000Z', '2026-08-21T00:00:00.000Z')
  `).run();
  oldRuntime.close();

  upgradedRuntime = new DatabaseRuntime({ dataDir, migrationsDir });
  assert.equal(upgradedRuntime.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 7);
  assert.deepEqual(
    upgradedRuntime.db.prepare('SELECT id, name, normalized_name FROM mainlines ORDER BY id').all(),
    [
      { id: 'ml_active', name: '原样 名称', normalized_name: 'active:work:原样 名称' },
      { id: 'ml_history', name: '已经结束', normalized_name: 'history:ml_history' },
    ],
  );

  const service = new SuowangService(upgradedRuntime);
  const snapshot = service.createMainline({ stateId: 'restore', slotIndex: 1, name: '原样 名称' });
  assert.equal(
    snapshot.states.find((state) => state.id === 'restore').mainlines[0].name,
    '原样 名称',
  );
});

test('opening a current database creates no pre-migration backup', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'suowang-no-migration-test-'));
  const dataDir = join(root, 'data');
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const created = new DatabaseRuntime({ dataDir, migrationsDir });
  created.close();
  const reopened = new DatabaseRuntime({ dataDir, migrationsDir });
  reopened.close();
  assert.deepEqual(readdirSync(join(dataDir, 'backups')).filter((name) => name.startsWith('pre-migrate-')), []);
});

test('a failed migration rolls back the entire upgrade and keeps its pre-migration backup', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'suowang-failed-migration-test-'));
  const dataDir = join(root, 'data');
  const failingMigrations = join(root, 'failing-migrations');
  mkdirSync(failingMigrations, { recursive: true });
  copyFileSync(join(migrationsDir, '001_init.sql'), join(failingMigrations, '001_init.sql'));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const original = new DatabaseRuntime({ dataDir, migrationsDir: failingMigrations });
  original.db.prepare(`
    INSERT INTO todos(id, state_id, mainline_id, title, status, position, created_at, ended_at)
    VALUES ('td_safe', 'work', NULL, '保持原样', 'active', 1, '2026-08-21T00:00:00.000Z', NULL)
  `).run();
  original.close();
  writeFileSync(join(failingMigrations, '002_fail.sql'), 'ALTER TABLE todos ADD COLUMN temporary_value TEXT;\nTHIS IS NOT SQL;\n');

  assert.throws(() => new DatabaseRuntime({ dataDir, migrationsDir: failingMigrations }));
  const current = new Database(join(dataDir, 'suowang.db'), { readonly: true, fileMustExist: true });
  try {
    assert.equal(current.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 1);
    assert.equal(current.prepare('SELECT title FROM todos WHERE id = ?').get('td_safe').title, '保持原样');
    assert.equal(current.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('todos') WHERE name = 'temporary_value'").get().count, 0);
  } finally {
    current.close();
  }
  const backups = readdirSync(join(dataDir, 'backups')).filter((name) => name.startsWith('pre-migrate-v1-to-v2-'));
  assert.equal(backups.length, 1);
  const backup = new Database(join(dataDir, 'backups', backups[0]), { readonly: true, fileMustExist: true });
  try {
    assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(backup.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 1);
  } finally {
    backup.close();
  }
});

test('foreign key violations block migration commit', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'suowang-foreign-key-migration-test-'));
  const dataDir = join(root, 'data');
  const invalidMigrations = join(root, 'invalid-migrations');
  mkdirSync(invalidMigrations, { recursive: true });
  copyFileSync(join(migrationsDir, '001_init.sql'), join(invalidMigrations, '001_init.sql'));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const original = new DatabaseRuntime({ dataDir, migrationsDir: invalidMigrations });
  original.close();
  writeFileSync(join(invalidMigrations, '002_orphan.sql'), `
    DROP TRIGGER todo_mainline_matches_state_insert;
    INSERT INTO todos(id, state_id, mainline_id, title, status, position, created_at, ended_at)
    VALUES ('td_orphan', 'work', 'missing-mainline', '孤立事项', 'active', 1, '2026-08-21T00:00:00.000Z', NULL);
  `);

  assert.throws(
    () => new DatabaseRuntime({ dataDir, migrationsDir: invalidMigrations }),
    /foreign key check failed/,
  );
  const current = new Database(join(dataDir, 'suowang.db'), { readonly: true, fileMustExist: true });
  try {
    assert.equal(current.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 1);
    assert.equal(current.prepare('SELECT COUNT(*) AS count FROM todos WHERE id = ?').get('td_orphan').count, 0);
    assert.ok(current.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'todo_mainline_matches_state_insert'").get());
  } finally {
    current.close();
  }
});
