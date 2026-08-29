import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldIgnore } from '../../forge.config.mjs';
import { ROAD_VISUAL_ASSETS } from '../../src/visual-assets.mjs';

test('Forge keeps the assets directory so approved visual files can be traversed', () => {
  assert.equal(shouldIgnore('/assets'), false);
  assert.equal(shouldIgnore('/assets/brand'), false);
  assert.equal(shouldIgnore('/assets/brand/suowang-app-icon.ico'), false);
  for (const asset of ROAD_VISUAL_ASSETS) assert.equal(shouldIgnore(`/${asset.path}`), false);
});

test('Forge excludes unapproved visual exploration assets', () => {
  assert.equal(shouldIgnore('/assets/unapproved-preview.png'), true);
  assert.equal(shouldIgnore(`/${ROAD_VISUAL_ASSETS[0].path}.backup`), true);
  assert.equal(shouldIgnore('/assets/milestones/2026-08-23-arrow-pipeline/base-no-arrows-v1.png'), true);
});
