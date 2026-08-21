import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseRuntime } from '../src/server/database.mjs';
import { SuowangService } from '../src/server/service.mjs';

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const migrationsDir = join(projectRoot, 'migrations');

export function createServiceHarness(testContext, { start = '2026-08-21T00:00:00.000Z' } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-test-'));
  let tick = 0;
  const clock = () => new Date(Date.parse(start) + tick++ * 1000);
  const runtime = new DatabaseRuntime({ dataDir, migrationsDir });
  const service = new SuowangService(runtime, { clock });
  testContext.after(() => {
    runtime.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return { dataDir, runtime, service, clock };
}

export function findMainline(snapshot, stateId, name) {
  return snapshot.states
    .find((state) => state.id === stateId)
    .mainlines.find((mainline) => mainline.name === name);
}
