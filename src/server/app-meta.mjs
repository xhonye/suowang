import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageMetadata = require('../../package.json');

export const APP_NAME = packageMetadata.name;
export const APP_VERSION = packageMetadata.version;

export function deriveMacOSVersions(version = APP_VERSION) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+)(?:\.(\d+))?)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`Invalid application SemVer: ${version}`);

  const [, major, minor, patch, prerelease = '', prereleaseNumber = '0'] = match;
  const channel = prerelease === '' ? 9
    : prerelease === 'alpha' ? 1
      : prerelease === 'beta' ? 2
        : prerelease === 'rc' ? 3
          : null;
  if (channel === null) throw new Error(`Unsupported macOS prerelease channel: ${version}`);
  const serial = Number(prereleaseNumber);
  if (!Number.isSafeInteger(serial) || serial < 0 || serial > 9) {
    throw new Error(`macOS prerelease serial must be an integer from 0 to 9: ${version}`);
  }

  return {
    shortVersion: `${major}.${minor}.${patch}`,
    bundleVersion: `${major}.${minor}.${Number(patch) * 100 + channel * 10 + serial}`,
  };
}
