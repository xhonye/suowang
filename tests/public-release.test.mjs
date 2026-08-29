import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditTrackedFiles } from '../scripts/audit-public-surface.mjs';
import { createMirrorManifest } from '../scripts/create-mirror-manifest.mjs';

test('public audit ignores tracked files deleted by the candidate worktree', () => {
  assert.deepEqual(auditTrackedFiles(['deleted-candidate-file.txt']), []);
});

test('mirror manifest binds all public assets to one version and source commit', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'suowang-manifest-'));
  context.after(() => rmSync(root, { force: true, recursive: true }));
  const windowsDir = join(root, 'windows');
  const macosDir = join(root, 'macos');
  mkdirSync(windowsDir);
  mkdirSync(macosDir);
  const version = '0.2.0-beta.1';
  const commitSha = 'a'.repeat(40);
  const assets = [
    [windowsDir, `SUOWANG-Setup-${version}.exe`],
    [windowsDir, `SUOWANG-Portable-${version}.zip`],
    [windowsDir, `SUOWANG-${version}-SHA256SUMS.txt`],
    [macosDir, `SUOWANG-${version}-mac-arm64.dmg`],
    [macosDir, `SUOWANG-${version}-mac-arm64-SHA256SUMS.txt`],
  ];
  for (const [directory, name] of assets) writeFileSync(join(directory, name), `fixture:${name}`);

  const outputPath = join(root, 'SUOWANG-MIRROR-MANIFEST.txt');
  createMirrorManifest({
    version,
    commitSha,
    windowsDir,
    macosDir,
    outputPath,
    electronVersion: '44.0.0',
    windowsSigningStatus: 'SIGNED',
    macosSigningStatus: 'SIGNED+NOTARIZED',
  });
  const manifest = readFileSync(outputPath, 'ascii');

  assert.match(manifest, new RegExp(`Version: ${version.replaceAll('.', '\\.')}`));
  assert.match(manifest, new RegExp(`Source commit: ${commitSha}`));
  assert.match(manifest, /Electron: 44\.0\.0/);
  assert.match(manifest, /Windows signing: SIGNED/);
  assert.match(manifest, /macOS signing: SIGNED\+NOTARIZED/);
  for (const [, name] of assets) assert.match(manifest, new RegExp(`\\*${name.replaceAll('.', '\\.').replaceAll('-', '\\-')}`));
  assert.equal((manifest.match(/^[0-9a-f]{64} \*/gm) ?? []).length, 5);
});
