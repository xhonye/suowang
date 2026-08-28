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
