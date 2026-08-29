import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureVisibleWindowState, loadWindowState, saveWindowState } from '../../desktop/window-state.mjs';

const display = [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }];

test('off-screen window bounds are centered on a current display', () => {
  const result = ensureVisibleWindowState({ x: 9000, y: -8000, width: 1200, height: 800, maximized: true }, display);
  assert.deepEqual(result, { x: 360, y: 120, width: 1200, height: 800, maximized: true });
});

test('visible window bounds and maximized state survive a round trip', () => {
  const directory = mkdtempSync(join(tmpdir(), 'suowang-window-'));
  const path = join(directory, 'desktop-window.json');
  try {
    saveWindowState(path, { x: 80, y: 90, width: 1300, height: 820, maximized: true });
    assert.deepEqual(loadWindowState(path, display), { x: 80, y: 90, width: 1300, height: 820, maximized: true });
    assert.match(readFileSync(path, 'utf8'), /"maximized": true/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('corrupt state falls back safely', () => {
  const directory = mkdtempSync(join(tmpdir(), 'suowang-window-corrupt-'));
  const path = join(directory, 'desktop-window.json');
  try {
    writeFileSync(path, '{broken');
    const state = loadWindowState(path, display);
    assert.equal(state.width, 1440);
    assert.equal(state.height, 900);
    assert.equal(state.x, 240);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
