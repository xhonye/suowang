import assert from 'node:assert/strict';
import { win32 } from 'node:path';
import test from 'node:test';
import packageMetadata from '../package.json' with { type: 'json' };
import { createLauncherConfig } from '../scripts/launcher-config.mjs';

test('launcher configuration keeps version, URLs, and files under the selected data directory', () => {
  const dataDir = win32.normalize('E:/Temporary/SUOWANG');
  const accessPath = win32.join(dataDir, 'access.json');
  const config = createLauncherConfig({
    env: { SUOWANG_DATA_DIR: dataDir, SUOWANG_PORT: '4123' },
    platform: 'win32',
    fileExists: (path) => win32.normalize(path) === accessPath,
    readFile: () => JSON.stringify({ accessMode: 'tailscale' }),
  });

  assert.equal(config.version, packageMetadata.version);
  assert.equal(config.expectedVersion, packageMetadata.version);
  assert.equal(config.dataDir, dataDir);
  assert.equal(config.port, 4123);
  assert.equal(config.accessMode, 'tailscale');
  assert.equal(config.localHealthUrl, 'http://127.0.0.1:4123/health');
  assert.equal(config.localAppUrl, 'http://127.0.0.1:4123/');
});
