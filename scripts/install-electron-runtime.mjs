import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronRoot = dirname(require.resolve('electron/package.json'));
const executable = process.platform === 'win32'
  ? join(electronRoot, 'dist', 'electron.exe')
  : process.platform === 'darwin'
    ? join(electronRoot, 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : join(electronRoot, 'dist', 'electron');

if (!existsSync(executable)) {
  const result = spawnSync(process.execPath, [join(electronRoot, 'install.js')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Electron runtime installation failed with exit code ${result.status}.`);
}
if (!existsSync(executable)) throw new Error(`Electron runtime is missing after installation: ${executable}`);
console.log(`Electron runtime ready: ${process.platform}-${process.arch}`);
