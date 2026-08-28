import { spawnSync } from 'node:child_process';

const requiredFiles = [
  'scripts/launcher-config.mjs',
  'scripts/macos-launcher.sh',
  'scripts/start.ps1',
  'src/server/app-meta.mjs',
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
