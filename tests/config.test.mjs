import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
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
  const actual = resolveDataDir({ env: {}, platform: 'darwin', home: '/Users/tester' });
  assert.equal(actual, '/Users/tester/Library/Application Support/SUOWANG');
});

test('an explicit data directory overrides the platform default', () => {
  const explicitDataDir = '/tmp/suowang-explicit-data';
  const actual = resolveDataDir({
    env: { SUOWANG_DATA_DIR: explicitDataDir },
    platform: 'darwin',
  });
  assert.equal(actual, posix.normalize(explicitDataDir));
});

test('Windows selects only a real database and never a legacy root directory', () => {
  const standardDir = win32.normalize('C:/Users/tester/AppData/Local/SUOWANG');
  const legacyDir = win32.normalize('D:/5Data/suowang');
  const standardDatabase = win32.join(standardDir, 'suowang.db');
  const legacyDatabase = win32.join(legacyDir, 'suowang.db');
  const resolveWindows = (paths) => resolveDataDir({
    env: { LOCALAPPDATA: 'C:/Users/tester/AppData/Local' },
    platform: 'win32',
    home: 'C:/Users/tester',
    fileExists: (path) => paths.has(win32.normalize(path)),
  });

  assert.equal(resolveWindows(new Set()), standardDir);
  assert.equal(resolveWindows(new Set([win32.normalize('D:/5Data')])), standardDir);
  assert.equal(resolveWindows(new Set([legacyDatabase])), legacyDir);
  assert.equal(resolveWindows(new Set([standardDatabase])), standardDir);
  assert.throws(
    () => resolveWindows(new Set([standardDatabase, legacyDatabase])),
    (error) => error.message.includes(standardDatabase)
      && error.message.includes(legacyDatabase)
      && error.message.includes('SUOWANG_DATA_DIR'),
  );
});

test('explicit Windows data directory wins even when both known databases exist', () => {
  const explicit = win32.normalize('E:/SUOWANG-Test');
  assert.equal(resolveDataDir({
    env: { SUOWANG_DATA_DIR: explicit, LOCALAPPDATA: 'C:/Users/tester/AppData/Local' },
    platform: 'win32',
    fileExists: () => true,
  }), explicit);
});

test('Linux uses XDG data home or the standard home fallback', () => {
  assert.equal(resolveDataDir({
    env: { XDG_DATA_HOME: '/var/test-data' }, platform: 'linux', home: '/home/tester',
  }), '/var/test-data/suowang');
  assert.equal(resolveDataDir({ env: {}, platform: 'linux', home: '/home/tester' }), '/home/tester/.local/share/suowang');
});
