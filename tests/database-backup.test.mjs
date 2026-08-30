import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createServiceHarness } from './helpers.mjs';

test('backup replacement preserves the previous file when candidate creation fails', async (context) => {
  const { runtime, dataDir } = createServiceHarness(context);
  const destination = join(dataDir, 'replace-me.db');
  await runtime.backupTo(destination);
  const previousBytes = readFileSync(destination);

  runtime.backupDatabase = async (_db, temporary) => {
    writeFileSync(temporary, 'incomplete backup');
    throw new Error('simulated backup failure');
  };
  await assert.rejects(runtime.backupTo(destination), /simulated backup failure/);
  assert.deepEqual(readFileSync(destination), previousBytes);
  assert.deepEqual(readdirSync(dataDir).filter((name) => name.endsWith('.tmp') || name.endsWith('.previous')), []);
});

test('same-millisecond exports and restore safeguards never share a file', async (context) => {
  const { runtime } = createServiceHarness(context);
  const date = new Date('2026-08-30T00:00:00.000Z');
  const first = await runtime.createDownloadBackup(date);
  const second = await runtime.createDownloadBackup(date);
  assert.notEqual(first, second);
  runtime.validateBackupFile(first);
  runtime.validateBackupFile(second);
  const one = await runtime.restoreFrom(first, date);
  const two = await runtime.restoreFrom(second, date);
  assert.notEqual(one.safetyBackup, two.safetyBackup);
  runtime.validateBackupFile(one.safetyBackup);
  runtime.validateBackupFile(two.safetyBackup);
});

test('an invalid existing daily backup is verified and replaced', async (context) => {
  const { runtime } = createServiceHarness(context);
  const date = new Date(2026, 7, 28, 9);
  const destination = join(runtime.backupsDir, 'suowang-2026-08-28.db');
  writeFileSync(destination, 'not a sqlite database');

  const result = await runtime.ensureDailyBackup(date);
  assert.equal(result.created, true);
  assert.equal(result.path, destination);
  assert.doesNotThrow(() => runtime.validateBackupFile(destination));
});

test('a valid empty SQLite file cannot masquerade as the daily SUOWANG backup', async (context) => {
  const { runtime } = createServiceHarness(context);
  const date = new Date(2026, 7, 29, 9);
  const destination = join(runtime.backupsDir, 'suowang-2026-08-29.db');
  new Database(destination).close();

  assert.throws(() => runtime.validateBackupFile(destination), /missing required table/i);
  const result = await runtime.ensureDailyBackup(date);
  assert.equal(result.created, true);
  assert.doesNotThrow(() => runtime.validateBackupFile(destination));
});

test('a valid SQLite database from another application is rejected as a backup', (context) => {
  const { runtime, dataDir } = createServiceHarness(context);
  const unrelated = join(dataDir, 'other-app.db');
  const candidate = new Database(unrelated);
  try {
    candidate.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);');
  } finally {
    candidate.close();
  }

  assert.throws(() => runtime.validateBackupFile(unrelated), /missing required table/i);
});

test('a structurally valid backup with an incomplete migration set is replaced', async (context) => {
  const { runtime } = createServiceHarness(context);
  const date = new Date(2026, 7, 30, 9);
  const destination = join(runtime.backupsDir, 'suowang-2026-08-30.db');
  await runtime.backupTo(destination);
  const stale = new Database(destination);
  try {
    stale.prepare('DELETE FROM schema_migrations WHERE version = (SELECT MAX(version) FROM schema_migrations)').run();
  } finally {
    stale.close();
  }

  assert.throws(() => runtime.validateBackupFile(destination), /schema does not match/i);
  const result = await runtime.ensureDailyBackup(date);
  assert.equal(result.created, true);
  assert.doesNotThrow(() => runtime.validateBackupFile(destination));
});

test('backup validation rejects a structurally valid SQLite file with foreign key violations', (context) => {
  const { runtime, dataDir } = createServiceHarness(context);
  const invalid = join(dataDir, 'foreign-key-invalid.db');
  const candidate = new Database(invalid);
  try {
    candidate.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE parents (id INTEGER PRIMARY KEY);
      CREATE TABLE children (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parents(id)
      );
      INSERT INTO children (id, parent_id) VALUES (1, 999);
    `);
  } finally {
    candidate.close();
  }

  assert.throws(() => runtime.validateBackupFile(invalid), /foreign key check failed/i);
});
