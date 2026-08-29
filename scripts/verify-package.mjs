import { spawnSync } from 'node:child_process';

const requiredFiles = [
  'assets/brand/favicon.png',
  'assets/brand/suowang-app-icon.ico',
  'assets/brand/suowang-app-icon.svg',
  'desktop/main.js',
  'desktop/preload.cjs',
  'desktop/desktop-policy.mjs',
  'forge.config.mjs',
  'installer/SUOWANG.iss',
  'scripts/audit-electron-security.mjs',
  'scripts/build-icons.mjs',
  'scripts/build-macos-release.sh',
  'scripts/build-windows-release.ps1',
  'scripts/create-upgrade-fixture.mjs',
  'scripts/install-electron-runtime.mjs',
  'scripts/verify-upgrade-fixture.mjs',
  'scripts/launcher-config.mjs',
  'scripts/start.ps1',
  'src/server/app-meta.mjs',
  'src/server/app-server.mjs',
  'src/server/instance-lock.mjs',
  'src/server/launcher-policy.mjs',
];

const npmArguments = ['pack', '--dry-run', '--json'];
const npmCli = process.env.npm_execpath;
const result = spawnSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...npmArguments] : npmArguments, {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack failed without output.\n');
  process.exit(result.status ?? 1);
}
const report = JSON.parse(result.stdout)[0];
const files = new Set(report.files.map((file) => file.path));
const missing = requiredFiles.filter((path) => !files.has(path));
if (missing.length) throw new Error(`npm package is missing: ${missing.join(', ')}`);
console.log(`npm package verified: ${report.filename} (${report.files.length} files)`);
for (const path of requiredFiles) console.log(`  included ${path}`);
