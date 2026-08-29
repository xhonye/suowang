import { normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAppServer,
  createGracefulShutdown,
  createStaticResolver,
  startAppServer,
} from '../src/server/app-server.mjs';
import {
  PROJECT_ROOT,
  resolveAccessMode,
  resolveDataDir,
  resolvePort,
  resolveTailscaleIPv4,
} from '../src/server/config.mjs';

export { createAppServer, createGracefulShutdown, createStaticResolver, startAppServer };

const isDirectRun = process.argv[1]
  && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const port = resolvePort();
  const accessMode = resolveAccessMode();
  const tailscaleIp = accessMode === 'tailscale' ? resolveTailscaleIPv4() : null;
  const allowedHosts = ['127.0.0.1', 'localhost', ...(tailscaleIp ? [tailscaleIp] : [])];
  const running = await startAppServer({
    dataDir: resolveDataDir(),
    resourceRoot: PROJECT_ROOT,
    port,
    accessMode,
    allowedHosts,
    extraHosts: tailscaleIp ? [tailscaleIp] : [],
    lockKind: accessMode === 'tailscale' ? 'cli-tailscale' : 'cli-local',
  });

  console.log(`SUOWANG local: ${running.origin}/`);
  if (tailscaleIp) console.log(`SUOWANG Tailscale: http://${tailscaleIp}:${running.actualPort}/`);
  console.log(`Data: ${running.runtime.describe().databasePath}`);

  const shutdown = async () => {
    try {
      await running.close();
    } catch (error) {
      console.error('SUOWANG shutdown failed:', error);
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
