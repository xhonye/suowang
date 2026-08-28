import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { expectedNodeArchiveSha256, verifyNodeArchive } from '../scripts/verify-node-download.mjs';

test('Node runtime verification requires an exact official filename and SHA-256 match', async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'suowang-node-download-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const fileName = 'node-v24.15.0-win-x64.zip';
  const archive = join(root, fileName);
  const shasums = join(root, 'SHASUMS256.txt');
  const bytes = Buffer.from('verified node archive fixture');
  const hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(archive, bytes);
  writeFileSync(shasums, `${hash}  ${fileName}\n`);

  assert.equal(expectedNodeArchiveSha256(readFileSync(shasums, 'utf8'), fileName), hash);
  assert.equal(await verifyNodeArchive({ shasumsPath: shasums, archivePath: archive, fileName }), hash);
  writeFileSync(archive, 'tampered');
  await assert.rejects(
    verifyNodeArchive({ shasumsPath: shasums, archivePath: archive, fileName }),
    /SHA-256 mismatch/,
  );
  assert.throws(() => expectedNodeArchiveSha256(readFileSync(shasums, 'utf8'), 'other.zip'), /does not contain/);
});
