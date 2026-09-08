import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCloseBehavior, saveCloseBehavior } from '../../desktop/close-behavior.mjs';

test('close preference defaults to tray, persists, and rejects invalid writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suowang-close-test-'));
  const path = join(dir, 'preferences.json');
  try {
    assert.equal(loadCloseBehavior(path), 'tray');
    saveCloseBehavior(path, 'quit');
    assert.equal(loadCloseBehavior(path), 'quit');
    const original = readFileSync(path, 'utf8');
    for (const value of [null, {}, 'hide', '../quit']) assert.throws(() => saveCloseBehavior(path, value));
    assert.equal(readFileSync(path, 'utf8'), original);
    saveCloseBehavior(path, 'tray');
    assert.equal(loadCloseBehavior(path), 'tray');
    writeFileSync(path, '{invalid');
    assert.throws(() => loadCloseBehavior(path), SyntaxError);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
