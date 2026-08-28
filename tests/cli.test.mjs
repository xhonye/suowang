import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import packageMetadata from '../package.json' with { type: 'json' };

const cliPath = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));

test('CLI exposes stable start and shortcut commands', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, new RegExp(`SUOWANG ${packageMetadata.version.replaceAll('.', '\\.')}`));
  assert.match(result.stdout, /suowang start/);
  assert.match(result.stdout, /suowang access tailscale/);
  assert.match(result.stdout, /suowang install-shortcut/);
});

test('CLI version and package metadata share one source', () => {
  for (const flag of ['--version', '-v']) {
    const result = spawnSync(process.execPath, [cliPath, flag], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), packageMetadata.version);
  }
});

test('CLI rejects unknown commands without starting the service', () => {
  const result = spawnSync(process.execPath, [cliPath, 'unknown-command'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未知命令/);
});
