import test from 'node:test';
import assert from 'node:assert/strict';
import { activateExistingWindow } from '../../desktop/single-instance.mjs';

test('second instance restores and focuses the existing desktop window', () => {
  const calls = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
  assert.equal(activateExistingWindow(window), true);
  assert.deepEqual(calls, ['restore', 'show', 'focus']);
  assert.equal(activateExistingWindow({ isDestroyed: () => true }), false);
});
