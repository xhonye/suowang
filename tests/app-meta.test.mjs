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
});

test('macOS bundle versions are legal numeric values derived from SemVer', () => {
  const versions = deriveMacOSVersions('0.2.0-alpha.1');
  assert.deepEqual(versions, { shortVersion: '0.2.0', bundleVersion: '0.2.2' });
  assert.match(versions.shortVersion, /^\d+\.\d+\.\d+$/);
  assert.match(versions.bundleVersion, /^\d+(?:\.\d+){0,2}$/);
  assert.equal(versions.shortVersion.includes('alpha'), false);
  assert.equal(versions.bundleVersion.includes('alpha'), false);
});
