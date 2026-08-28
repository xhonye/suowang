import assert from 'node:assert/strict';
import test from 'node:test';
import packageLock from '../package-lock.json' with { type: 'json' };
import packageMetadata from '../package.json' with { type: 'json' };
import { APP_NAME, APP_VERSION, deriveMacOSVersions } from '../src/server/app-meta.mjs';

test('package metadata is the application version source', () => {
  assert.equal(APP_NAME, packageMetadata.name);
  assert.equal(APP_VERSION, packageMetadata.version);
  assert.equal(packageLock.version, packageMetadata.version);
  assert.equal(packageLock.packages[''].version, packageMetadata.version);
  assert.equal(packageMetadata.engines.node, '^22.0.0 || ^24.0.0');
  assert.equal(packageLock.packages[''].engines.node, packageMetadata.engines.node);
});

test('macOS bundle versions are legal numeric values derived from SemVer', () => {
  const versions = deriveMacOSVersions('0.2.0-alpha.1');
  assert.deepEqual(versions, { shortVersion: '0.2.0', bundleVersion: '0.2.11' });
  assert.match(versions.shortVersion, /^\d+\.\d+\.\d+$/);
  assert.match(versions.bundleVersion, /^\d+(?:\.\d+){0,2}$/);
  assert.equal(versions.shortVersion.includes('alpha'), false);
  assert.equal(versions.bundleVersion.includes('alpha'), false);
});

test('macOS bundle versions are unique and strictly ordered across release channels and patches', () => {
  const orderedVersions = [
    ...Array.from({ length: 10 }, (_, serial) => `0.2.0-alpha.${serial}`),
    '0.2.0-beta.0',
    '0.2.0-rc.0',
    '0.2.0',
    '0.2.1-alpha.0',
  ];
  const serials = orderedVersions.map((version) => Number(deriveMacOSVersions(version).bundleVersion.split('.').at(-1)));
  assert.equal(new Set(serials).size, serials.length);
  for (let index = 1; index < serials.length; index += 1) {
    assert.ok(serials[index] > serials[index - 1], `${orderedVersions[index]} must sort after ${orderedVersions[index - 1]}`);
  }
  assert.throws(() => deriveMacOSVersions('0.2.0-alpha'), /must include a serial/);
  assert.throws(() => deriveMacOSVersions('0.2.0-beta'), /must include a serial/);
  assert.throws(() => deriveMacOSVersions('0.2.0-rc'), /must include a serial/);
  assert.throws(() => deriveMacOSVersions('0.2.0-preview.1'), /Unsupported macOS prerelease channel/);
});
