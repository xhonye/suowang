import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../../scripts/serve.mjs';
import { migrationsDir } from '../helpers.mjs';

const port = Number(process.env.SUOWANG_E2E_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 2037) {
  throw new Error('SUOWANG_E2E_PORT must be a valid non-production port.');
}

const dataDir = mkdtempSync(join(tmpdir(), 'suowang-playwright-'));
const resultsDir = join(process.cwd(), 'test-results');
const logPath = join(resultsDir, 'e2e-server.log');
const dataMarkerPath = join(resultsDir, 'e2e-data-dir.txt');
mkdirSync(resultsDir, { recursive: true });
writeFileSync(dataMarkerPath, JSON.stringify({ dataDir, pid: process.pid, port }), 'utf8');
const log = (message) => appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
log(`starting on port ${port} with isolated temporary data`);

const server = await createAppServer({
  dataDir,
  migrationsDir,
  ensureBackup: false,
  accessMode: 'local',
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});
log('ready');

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(dataMarkerPath, { force: true });
    log('stopped and removed temporary data');
  }
}

process.once('SIGINT', async () => { await close(); process.exit(0); });
process.once('SIGTERM', async () => { await close(); process.exit(0); });
process.once('uncaughtException', async (error) => {
  log(`uncaughtException: ${error.stack ?? error}`);
  await close();
  process.exit(1);
});
