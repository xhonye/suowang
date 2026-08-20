import assert from 'node:assert/strict';
import test from 'node:test';
import { activatePath, createDefaultState, DEFAULT_PATHS, getTimelineItems } from '../src/app.js';

test('prototype always exposes exactly three candidate paths', () => {
  assert.equal(DEFAULT_PATHS.length, 3);
  assert.deepEqual(DEFAULT_PATHS.map((path) => path.id), ['restore', 'work', 'system']);
  assert.deepEqual(DEFAULT_PATHS.map((path) => path.status), ['recommended', 'active', 'candidate']);
});

test('every path contains the decision and low-energy fields', () => {
  for (const path of DEFAULT_PATHS) {
    assert.ok(path.reason);
    assert.ok(path.success);
    assert.ok(path.cost);
    assert.ok(path.now.done);
    assert.ok(path.now.fallback);
    for (const horizon of ['today', 'week', 'month', 'later']) {
      assert.ok(getTimelineItems(path, horizon).length > 0);
    }
  }
});

test('exploration is separate from activation', () => {
  const state = createDefaultState();
  state.selectedPathId = 'system';
  assert.equal(state.activePathId, 'work');

  const activated = activatePath(state, 'system', new Date('2026-08-20T00:00:00.000Z'));
  assert.equal(activated.activePathId, 'system');
  assert.equal(activated.history.length, 1);
  assert.equal(activated.history[0].title, '工作推进');
  assert.equal(activated.history[0].nextTitle, '生活主线');
  assert.equal(activated.history[0].path.reason, DEFAULT_PATHS[1].reason);
  assert.equal(activated.history[0].candidates.length, 3);
  assert.equal(activated.history[0].observedOutcome, null);
  assert.equal(activated.paths.find((path) => path.id === 'work').status, 'paused');
  assert.equal(activated.paths.find((path) => path.id === 'system').status, 'active');
});
