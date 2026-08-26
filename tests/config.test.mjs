import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import test from 'node:test';
import { resolveAccessMode, resolveDataDir, resolveTailscaleIPv4 } from '../src/server/config.mjs';

const interfaces = {
  Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }],
  Tailscale: [{ family: 'IPv4', internal: false, address: '100.64.0.42' }],
};

test('access mode stays local unless tailscale is explicitly enabled', () => {
  assert.equal(resolveAccessMode({ env: {}, accessConfigPath: 'Z:/missing/access.json' }), 'local');
  assert.equal(resolveAccessMode({
    env: { SUOWANG_ACCESS: 'tailscale' },
    accessConfigPath: 'Z:/missing/access.json',
  }), 'tailscale');
  assert.throws(() => resolveAccessMode({
    env: { SUOWANG_ACCESS: 'public' },
    accessConfigPath: 'Z:/missing/access.json',
  }), /local or tailscale/);
});

test('access mode can be kept in the external data directory', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'suowang-access-test-'));
  const accessConfigPath = join(directory, 'access.json');
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(accessConfigPath, JSON.stringify({ accessMode: 'tailscale' }));
  assert.equal(resolveAccessMode({ env: {}, accessConfigPath }), 'tailscale');
});

test('tailscale address is discovered without storing a personal IP in the project', () => {
  assert.equal(resolveTailscaleIPv4({ env: {}, interfaces }), '100.64.0.42');
  assert.equal(resolveTailscaleIPv4({
    env: { SUOWANG_TAILSCALE_IP: '100.64.0.42' },
    interfaces,
  }), '100.64.0.42');
  assert.throws(() => resolveTailscaleIPv4({
    env: { SUOWANG_TAILSCALE_IP: '192.168.1.20' },
    interfaces,
  }), /100\.64\.0\.0\/10/);
});

test('macOS stores SUOWANG data in the standard Application Support location', () => {
  const actual = resolveDataDir({ env: {}, platform: 'darwin' });
  assert.equal(actual, normalize(join(homedir(), 'Library', 'Application Support', 'SUOWANG')));
});

test('an explicit data directory overrides the platform default', () => {
  const actual = resolveDataDir({
    env: { SUOWANG_DATA_DIR: 'C:/Users/example/SUOWANG-data' },
    platform: 'darwin',
  });
  assert.equal(actual, normalize('C:/Users/example/SUOWANG-data'));
});
