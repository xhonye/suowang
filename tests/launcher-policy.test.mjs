import assert from 'node:assert/strict';
import test from 'node:test';
import { decideLauncherAction } from '../src/server/launcher-policy.mjs';

const expected = {
  expectedVersion: '0.2.0-alpha.1',
  expectedAccessMode: 'local',
};
const matchingHealth = {
  status: 'ok',
  app: 'suowang',
  version: expected.expectedVersion,
  database: 'ready',
  schemaVersion: 7,
  pid: 1234,
  accessMode: 'local',
};
const matchingListener = { occupied: true, accessModeMatches: true };

test('launcher policy reuses the matching service', () => {
  assert.deepEqual(decideLauncherAction({
    ...expected,
    health: matchingHealth,
    listener: matchingListener,
  }), { action: 'reuse', reason: 'matching_service', stopExisting: false });
});

test('launcher policy restarts a verified older SUOWANG including legacy health without pid', () => {
  const health = { ...matchingHealth, version: '0.1.2' };
  delete health.pid;
  assert.deepEqual(decideLauncherAction({
    ...expected,
    health,
    listener: matchingListener,
    processVerified: true,
  }), { action: 'restart', reason: 'version_mismatch', stopExisting: true });
});

test('launcher policy rejects a non-SUOWANG listener', () => {
  assert.equal(decideLauncherAction({
    ...expected,
    health: { status: 'ok', app: 'other' },
    listener: matchingListener,
    processVerified: true,
  }).action, 'conflict');
});

test('launcher policy refuses to restart an unverified SUOWANG process', () => {
  assert.deepEqual(decideLauncherAction({
    ...expected,
    health: { ...matchingHealth, version: '0.1.2' },
    listener: matchingListener,
    processVerified: false,
  }), { action: 'conflict', reason: 'suowang_process_unverified', stopExisting: false });
});

test('launcher policy restarts a verified service when access mode differs', () => {
  assert.deepEqual(decideLauncherAction({
    ...expected,
    health: { ...matchingHealth, accessMode: 'tailscale' },
    listener: { occupied: true, accessModeMatches: false },
    processVerified: true,
  }), { action: 'restart', reason: 'access_mode_mismatch', stopExisting: true });
});

test('launcher policy starts through restart action when the port is free', () => {
  assert.deepEqual(decideLauncherAction({
    ...expected,
    listener: { occupied: false, accessModeMatches: false },
  }), { action: 'restart', reason: 'no_listener', stopExisting: false });
});
