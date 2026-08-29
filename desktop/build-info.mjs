import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readBuildInfo(resourceRoot, fallbackVersion) {
  const path = join(resourceRoot, 'desktop', 'build-meta.json');
  if (!existsSync(path)) {
    return { version: fallbackVersion, commit: 'development', shortCommit: 'development', signingStatus: 'UNSIGNED' };
  }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    const commit = /^[0-9a-f]{40}$/i.test(value.commit) ? value.commit.toLowerCase() : 'unknown';
    return {
      version: value.version === fallbackVersion ? value.version : fallbackVersion,
      commit,
      shortCommit: commit === 'unknown' ? commit : commit.slice(0, 8),
      signingStatus: value.signingStatus === 'SIGNED' ? 'SIGNED' : 'UNSIGNED',
    };
  } catch {
    return { version: fallbackVersion, commit: 'unknown', shortCommit: 'unknown', signingStatus: 'UNSIGNED' };
  }
}
