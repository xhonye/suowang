import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageMetadata from '../package.json' with { type: 'json' };

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs.');
    values.set(key.slice(2), value);
  }
  return values;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function createMirrorManifest({
  version,
  commitSha,
  windowsDir,
  macosDir,
  outputPath,
  electronVersion = packageMetadata.devDependencies.electron,
  windowsSigningStatus = 'UNSIGNED',
  macosSigningStatus = 'UNSIGNED',
}) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid release version.');
  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('Commit SHA must be 40 lowercase hexadecimal characters.');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(electronVersion)) throw new Error('Invalid Electron version.');
  if (!/^(?:SIGNED|UNSIGNED)$/.test(windowsSigningStatus)) throw new Error('Invalid Windows signing status.');
  if (!/^(?:SIGNED(?:\+NOTARIZED)?|UNSIGNED)$/.test(macosSigningStatus)) throw new Error('Invalid macOS signing status.');

  const assets = [
    [windowsDir, `SUOWANG-Setup-${version}.exe`],
    [windowsDir, `SUOWANG-Portable-${version}.zip`],
    [windowsDir, `SUOWANG-${version}-SHA256SUMS.txt`],
    [macosDir, `SUOWANG-${version}-mac-arm64.dmg`],
    [macosDir, `SUOWANG-${version}-mac-arm64-SHA256SUMS.txt`],
  ];

  for (const [directory, name] of assets) {
    const path = join(directory, name);
    if (!existsSync(path)) throw new Error(`Missing release asset: ${path}`);
  }

  const lines = [
    'SUOWANG RELEASE MIRROR MANIFEST',
    `Version: ${version}`,
    `Source commit: ${commitSha}`,
    `Electron: ${electronVersion}`,
    `Windows signing: ${windowsSigningStatus}`,
    `macOS signing: ${macosSigningStatus}`,
    `Official release: https://github.com/xhonye/suowang/releases/tag/v${version}`,
    '',
    'A mirror is valid only when every mirrored file has the same name and SHA-256 below.',
    '',
    ...assets.map(([directory, name]) => `${sha256(join(directory, name))} *${name}`),
    '',
  ];

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, lines.join('\n'), 'ascii');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = resolve(args.get('output') ?? 'dist/mirror-manifest.txt');
  createMirrorManifest({
    version: args.get('version'),
    commitSha: args.get('sha'),
    windowsDir: resolve(args.get('windows-dir')),
    macosDir: resolve(args.get('macos-dir')),
    outputPath,
    electronVersion: args.get('electron'),
    windowsSigningStatus: args.get('windows-signing'),
    macosSigningStatus: args.get('macos-signing'),
  });
  console.log(`mirror manifest: ${outputPath}`);
}
