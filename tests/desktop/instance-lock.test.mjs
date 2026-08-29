import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireInstanceLock, INSTANCE_LOCK_FILE, InstanceLockError } from '../../src/server/instance-lock.mjs';

test('instance lock rejects a live owner and releases only its own token', () => {
  const directory = mkdtempSync(join(tmpdir(), 'suowang-lock-'));
  try {
    const lock = acquireInstanceLock({ dataDir: directory, token: 'owner-a' });
    assert.throws(
      () => acquireInstanceLock({ dataDir: directory, token: 'owner-b', processInspector: () => 'alive' }),
      (error) => error instanceof InstanceLockError && error.code === 'SUOWANG_INSTANCE_CONFLICT',
    );
    assert.equal(lock.release(), true);
    assert.equal(lock.release(), false);
    assert.equal(existsSync(join(directory, INSTANCE_LOCK_FILE)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verified stale lock is removed without killing any process', () => {
  const directory = mkdtempSync(join(tmpdir(), 'suowang-stale-lock-'));
  const path = join(directory, INSTANCE_LOCK_FILE);
  try {
    writeFileSync(path, `${JSON.stringify({ pid: 999999, token: 'stale', kind: 'server' })}\n`);
    const lock = acquireInstanceLock({ dataDir: directory, token: 'replacement', processInspector: () => 'dead' });
    assert.equal(lock.token, 'replacement');
    assert.equal(lock.release(), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('malformed or unverifiable lock is never guessed stale', () => {
  const directory = mkdtempSync(join(tmpdir(), 'suowang-malformed-lock-'));
  const path = join(directory, INSTANCE_LOCK_FILE);
  try {
    writeFileSync(path, 'not-json');
    assert.throws(() => acquireInstanceLock({ dataDir: directory }), InstanceLockError);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
