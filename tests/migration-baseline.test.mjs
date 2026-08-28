import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { migrationsDir } from './helpers.mjs';

const approvedMigrations = new Map([
  ['001_init.sql', '5e2ac614ed01e8cfffd03374dbd0eec82c287ac6b787bb0f33e6ebacd1e9104f'],
  ['002_add_todo_minimal_step.sql', '1ca567e40c057d661212d34308a249994183655428b3b01f1d8cb1c266790cd8'],
  ['003_refresh_restore_cue.sql', '84278c513989c5b5d28028c8dade1fca0f1122aa5942f0e01be985fcdaa07511'],
  ['004_add_ongoing_todos.sql', '0db4aed11fbfd4132bba2ba1250155635bfa5d5bc28b9fa48b54d7a7e8914e0e'],
  ['005_add_workspace_density.sql', 'fef0bc720d803529f890ac5ecdbb69bde1fe3be4b634d201ec1ff5be39a8cdfc'],
  ['006_add_started_todo.sql', 'ca5c4b4b4a78b21d635bc69551bc035d74ef1e9b7902ab53bbeb73a9a791080f'],
]);

test('published migrations 001 through 006 remain byte-identical', () => {
  for (const [name, expectedHash] of approvedMigrations) {
    const actualHash = createHash('sha256').update(readFileSync(join(migrationsDir, name))).digest('hex');
    assert.equal(actualHash, expectedHash, `${name} changed; add a new migration instead of editing published history`);
  }
});
