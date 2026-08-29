import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

const legacyPathAllowlist = new Set([
  'AGENTS.md',
  'CHANGELOG.md',
  'README.md',
  'PUBLIC_RELEASE_READINESS.md',
  'WINDOWS-README.txt',
  'docs/architecture.md',
  'docs/handoff.md',
  'docs/operator-runbook.md',
  'src/server/config.mjs',
  'tests/config.test.mjs',
]);

const historicalNameAllowlist = new Set([
  'migrations/001_init.sql',
  'tests/e2e/boot.spec.mjs',
  'tests/migration.test.mjs',
  'tests/server.test.mjs',
]);

const testPathAllowlist = new Set(['tests/config.test.mjs']);

const sensitiveExtensions = new Set([
  '.db', '.sqlite', '.sqlite3', '.env', '.pem', '.key', '.pfx', '.p12', '.log',
]);

const secretPatterns = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+)/],
  ['OpenAI-style token', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['private key', /BEGIN [A-Z ]*PRIVATE KEY/],
  ['assigned secret', /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"']{8,}["']/i],
];

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean);
}

function isText(bytes) {
  return !bytes.subarray(0, 8192).includes(0);
}

export function auditTrackedFiles(files = trackedFiles()) {
  const failures = [];

  for (const relativePath of files) {
    const normalizedPath = relativePath.replaceAll('\\', '/');
    const extension = extname(normalizedPath).toLowerCase();
    if (sensitiveExtensions.has(extension)) {
      failures.push(`${normalizedPath}: tracked sensitive file type ${extension}`);
      continue;
    }

    const bytes = readFileSync(new URL(`../${normalizedPath}`, import.meta.url));
    if (!isText(bytes)) continue;
    const content = bytes.toString('utf8');

    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(content)) failures.push(`${normalizedPath}: possible ${label}`);
    }

    if (/A:[\\/]2Workspace/i.test(content)) {
      failures.push(`${normalizedPath}: personal workspace path`);
    }
    if (/C:[\\/]Users[\\/]/i.test(content) && !testPathAllowlist.has(normalizedPath)) {
      failures.push(`${normalizedPath}: personal Windows user path`);
    }
    if (/D:[\\/]5Data[\\/]suowang/i.test(content) && !legacyPathAllowlist.has(normalizedPath)) {
      failures.push(`${normalizedPath}: undocumented legacy data path reference`);
    }
    if (/\bHonye\b/.test(content) && !historicalNameAllowlist.has(normalizedPath)) {
      failures.push(`${normalizedPath}: personal display name`);
    }
  }

  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = trackedFiles();
  const failures = auditTrackedFiles(files);
  if (failures.length) {
    for (const failure of failures) console.error(`PUBLIC AUDIT BLOCK: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`public surface audit passed: ${files.length} tracked or candidate files`);
  }
}
