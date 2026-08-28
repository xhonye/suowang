import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('Windows access configuration consumes unified data directory and port values', () => {
  const source = readFileSync(new URL('../scripts/configure-access.ps1', import.meta.url), 'utf8');
  const cli = readFileSync(new URL('../scripts/cli.mjs', import.meta.url), 'utf8');

  assert.match(source, /scripts\/launcher-config\.mjs/);
  assert.match(source, /\$config\.dataDir/);
  assert.match(source, /\$config\.port/);
  assert.doesNotMatch(source, /D:\/5Data|:2037/);
  assert.match(cli, /'-NodePath', process\.execPath/);
});
