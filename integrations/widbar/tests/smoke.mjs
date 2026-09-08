import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startAppServer } from '../../../src/server/app-server.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'suowang-widget-smoke-'));
let server;
try {
  server = await startAppServer({ dataDir, port: 0, ensureBackup: false });
  const child = spawn('dotnet', ['run', '--project', fileURLToPath(new URL('./Tests.csproj', import.meta.url)), '--', dataDir],
    { stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) throw new Error(`Widget smoke failed (${code})`);
} finally {
  if (server) await server.close();
  if (!dataDir.startsWith(join(tmpdir(), 'suowang-widget-smoke-'))) throw new Error('Unexpected fixture path');
  await rm(dataDir, { recursive: true, force: true });
}
