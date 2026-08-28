import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import packageMetadata from '../package.json' with { type: 'json' };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('core CI runs dynamic temporary smoke on Node 22 and 24 across all supported platforms', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /- run: npm run smoke:temp/);
  for (const os of ['ubuntu-latest', 'windows-latest', 'macos-14']) {
    assert.match(workflow, new RegExp(`- os: ${os}\\s+node: '22'`));
    assert.match(workflow, new RegExp(`- os: ${os}\\s+node: '24\\.15\\.0'`));
  }
  assert.match(packageMetadata.scripts['release:check'], /npm run smoke:temp/);
});

test('candidate builds require a full commit SHA and cannot mutate a published Release', () => {
  for (const path of [
    '.github/workflows/release-windows.yml',
    '.github/workflows/release-macos.yml',
  ]) {
    const workflow = read(path);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /sha:/);
    assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
    assert.doesNotMatch(workflow, /types:\s*\[published\]/);
    assert.doesNotMatch(workflow, /--clobber/);
    assert.doesNotMatch(workflow, /gh release upload/);
  }
  assert.match(read('.github/workflows/release-windows.yml'), /SUOWANG\.cmd/);
  assert.match(read('.github/workflows/release-windows.yml'), /unins000\.exe/);
  assert.match(read('.github/workflows/release-macos.yml'), /hdiutil attach/);
  assert.match(read('.github/workflows/release-macos.yml'), /Contents\/MacOS\/SUOWANG/);
});

test('source launchers enforce the documented Node 22 or 24 LTS contract', () => {
  assert.match(read('scripts/start.ps1'), /\$nodeMajor -notin @\(22, 24\)/);
  const installer = read('INSTALL.cmd');
  assert.match(installer, /"%NODE_MAJOR%"=="22"/);
  assert.match(installer, /"%NODE_MAJOR%"=="24"/);
});

test('publishing verifies both candidate runs and keeps the Release private until all assets exist', () => {
  const workflow = read('.github/workflows/publish-release.yml');
  assert.match(workflow, /INSTALL_VERIFIED/);
  assert.match(workflow, /Build Windows candidate/);
  assert.match(workflow, /Build macOS Apple Silicon candidate/);
  assert.match(workflow, /--draft --prerelease --verify-tag/);
  assert.match(workflow, /--draft=false --prerelease/);
  assert.match(workflow, /Refusing to replace existing tag/);
  assert.doesNotMatch(workflow, /--clobber/);
});
