import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Windows launcher verifies installation, data lock, process and listen scope', { skip: process.platform !== 'win32' }, () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-launcher-identity-'));
  try {
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', fileURLToPath(new URL('./launcher-identity.ps1', import.meta.url)), '-DataRoot', dataDir],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.match(result, /12 cases passed/);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
