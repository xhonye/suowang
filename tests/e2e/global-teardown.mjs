import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, resolve, sep } from 'node:path';

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

export default async function globalTeardown() {
  const markerPath = resolve('test-results/e2e-data-dir.txt');
  const tempRoot = `${resolve(tmpdir())}${sep}`;
  const targets = new Set();
  if (existsSync(markerPath)) {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    targets.add(resolve(marker.dataDir));
    let health = null;
    try {
      health = await (await fetch(`http://127.0.0.1:${marker.port}/health`)).json();
    } catch {
      // A stopped test service needs no process action.
    }
    if (health?.app === 'suowang' && health.pid === marker.pid) {
      try { process.kill(marker.pid, 'SIGTERM'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
          process.kill(marker.pid, 0);
          await wait(100);
        } catch {
          break;
        }
      }
    } else if (health) {
      throw new Error('Refusing to stop an unverified E2E listener.');
    }
  }
  for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
    if (entry.isDirectory() && /^suowang-playwright-[A-Za-z0-9]+$/.test(entry.name)) {
      targets.add(resolve(tmpdir(), entry.name));
    }
  }
  for (const dataDir of targets) {
    if (!dataDir.startsWith(tempRoot) || !basename(dataDir).startsWith('suowang-playwright-')) {
      throw new Error(`Refusing to remove unexpected E2E data path: ${dataDir}`);
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
  rmSync(markerPath, { force: true });
}
