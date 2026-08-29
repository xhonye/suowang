import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { statFile as statAsarFile } from '@electron/asar';
import { APP_VERSION } from '../src/server/app-meta.mjs';
import { ROAD_VISUAL_ASSETS } from '../src/visual-assets.mjs';
import { auditElectronSecurity } from './audit-electron-security.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const FUSE_DISABLED = 48;
const FUSE_ENABLED = 49;

function findNativeModule(directory) {
  if (!existsSync(directory)) return null;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findNativeModule(path);
      if (nested) return nested;
    } else if (entry.name.endsWith('.node') && path.includes(`better-sqlite3${process.platform === 'win32' ? '\\' : '/'}prebuilds`)) return path;
  }
  return null;
}

export function resolvePackagedApplication({ platform = process.platform, arch = process.arch, base = join(root, 'out') } = {}) {
  const folder = join(base, `所往 SUOWANG-${platform}-${arch}`);
  if (platform === 'darwin') {
    const appPath = join(folder, '所往 SUOWANG.app');
    return {
      folder,
      appPath,
      executable: join(appPath, 'Contents', 'MacOS', 'SUOWANG'),
      resources: join(appPath, 'Contents', 'Resources'),
    };
  }
  return {
    folder,
    appPath: folder,
    executable: join(folder, platform === 'win32' ? 'SUOWANG.exe' : 'SUOWANG'),
    resources: join(folder, 'resources'),
  };
}

export async function verifyDesktopPackage(options = {}) {
  const packaged = resolvePackagedApplication(options);
  for (const path of [packaged.folder, packaged.executable, join(packaged.resources, 'app.asar')]) {
    if (!existsSync(path)) throw new Error(`Packaged desktop file is missing: ${path}`);
  }
  const asarPath = join(packaged.resources, 'app.asar');
  for (const asset of ROAD_VISUAL_ASSETS) {
    let entry;
    try {
      entry = statAsarFile(asarPath, asset.path);
    } catch {
      throw new Error(`Required visual asset is missing from app.asar: ${asset.path}`);
    }
    if (!entry || entry.size <= 0) throw new Error(`Required visual asset is empty in app.asar: ${asset.path}`);
  }
  const nativeModule = findNativeModule(join(packaged.resources, 'app.asar.unpacked'));
  if (!nativeModule) throw new Error('better-sqlite3 was not unpacked from ASAR.');
  for (const forbidden of ['runtime', 'scripts/start.ps1', 'SUOWANG.cmd']) {
    if (existsSync(join(packaged.folder, ...forbidden.split('/')))) throw new Error(`Legacy launcher leaked into desktop package: ${forbidden}`);
  }

  const fuses = await getCurrentFuseWire(packaged.executable);
  const expectedFuses = new Map([
    [FuseV1Options.RunAsNode, FUSE_DISABLED],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FUSE_DISABLED],
    [FuseV1Options.EnableNodeCliInspectArguments, FUSE_DISABLED],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FUSE_ENABLED],
    [FuseV1Options.OnlyLoadAppFromAsar, FUSE_ENABLED],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FUSE_DISABLED],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FUSE_DISABLED],
    [FuseV1Options.WasmTrapHandlers, FUSE_DISABLED],
  ]);
  for (const [option, expected] of expectedFuses) {
    if (fuses[option] !== expected) throw new Error(`Electron fuse ${FuseV1Options[option]} is not hardened.`);
  }
  const security = await auditElectronSecurity(join(packaged.resources, 'app.asar'));

  const tempRoot = mkdtempSync(join(tmpdir(), 'suowang-packaged-smoke-'));
  const dataDir = join(tempRoot, 'data');
  const reportPath = join(tempRoot, 'smoke-report.json');
  try {
    const result = spawnSync(packaged.executable, ['--smoke-test'], {
      cwd: packaged.folder,
      env: { ...process.env, SUOWANG_DATA_DIR: dataDir, SUOWANG_SMOKE_REPORT: reportPath },
      encoding: 'utf8',
      timeout: 45_000,
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Packaged smoke failed with ${result.status}: ${result.stderr || result.stdout}`);
    }
    if (!existsSync(reportPath)) throw new Error('Packaged smoke did not write its structured report.');
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    if (
      report.status !== 'passed'
      || !report.rendererLoaded
      || !report.rendererReady
      || !report.databaseWrite
      || !report.visualAssetsLoaded
      || report.visualAssets?.length !== ROAD_VISUAL_ASSETS.length
    ) {
      throw new Error(`Invalid packaged smoke report: ${JSON.stringify(report)}`);
    }
    if (report.version !== APP_VERSION) throw new Error(`Packaged version ${report.version} does not match ${APP_VERSION}.`);
    return {
      ...packaged,
      nativeModule,
      packageBytes: statSync(packaged.executable).size,
      smoke: report,
      security,
    };
  } finally {
    const safeRoot = resolve(tmpdir());
    const target = resolve(tempRoot);
    if (!target.startsWith(`${safeRoot}${process.platform === 'win32' ? '\\' : '/'}`) || !target.includes('suowang-packaged-smoke-')) {
      throw new Error(`Refusing to clean unexpected smoke path: ${target}`);
    }
    rmSync(target, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await verifyDesktopPackage();
  console.log(`Packaged desktop verified: ${result.executable}`);
  console.log(`Electron ${result.smoke.electron}; Chromium ${result.smoke.chromium}; Node ${result.smoke.node}`);
  console.log(`Electronegativity: ${result.security.blockers} high-risk blockers`);
}
