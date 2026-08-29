import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/server/app-meta.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let commit = String(process.env.SOURCE_COMMIT ?? '').trim().toLowerCase();
if (!commit) commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('SOURCE_COMMIT must be a full 40-character commit SHA.');
const signingStatus = process.env.SUOWANG_SIGNING_STATUS === 'SIGNED' ? 'SIGNED' : 'UNSIGNED';
const target = join(root, 'desktop', 'build-meta.json');
mkdirSync(join(root, 'desktop'), { recursive: true });
writeFileSync(target, `${JSON.stringify({ version: APP_VERSION, commit, signingStatus }, null, 2)}\n`, 'utf8');
process.stdout.write(`Prepared desktop metadata for ${APP_VERSION} at ${commit}.\n`);
