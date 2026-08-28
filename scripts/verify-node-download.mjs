#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function expectedNodeArchiveSha256(shasums, fileName) {
  for (const line of shasums.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match && match[2] === fileName) return match[1].toLowerCase();
  }
  throw new Error(`Node.js SHASUMS256.txt does not contain ${fileName}.`);
}

export async function fileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyNodeArchive({ shasumsPath, archivePath, fileName }) {
  const expected = expectedNodeArchiveSha256(readFileSync(shasumsPath, 'utf8'), fileName);
  const actual = await fileSha256(archivePath);
  if (actual !== expected) {
    throw new Error(`Node.js archive SHA-256 mismatch for ${fileName}: expected ${expected}, got ${actual}.`);
  }
  return actual;
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isDirectRun) {
  const [shasumsPath, archivePath, fileName] = process.argv.slice(2);
  if (!shasumsPath || !archivePath || !fileName) {
    console.error('Usage: node scripts/verify-node-download.mjs <SHASUMS256.txt> <archive> <file-name>');
    process.exitCode = 1;
  } else {
    verifyNodeArchive({ shasumsPath, archivePath, fileName })
      .then((hash) => console.log(`Node.js archive verified: ${fileName} ${hash}`))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
