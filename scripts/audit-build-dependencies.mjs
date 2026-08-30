import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Temporary, explicit build-only risk review. This is not a claim that upstream is patched.
const reviewed = new Map([
  ['https://github.com/advisories/GHSA-jmr9-qjv8-65gv', { name: 'extract-zip', version: '2.0.1' }],
  ['https://github.com/advisories/GHSA-w3rx-r6r6-pgpr', { name: 'image-size', version: '0.7.5' }],
  ['https://github.com/advisories/GHSA-5p2g-fcmc-qvqq', { name: 'image-size', version: '0.7.5' }],
]);

export function auditBuildReport(report, lock, { now = new Date() } = {}) {
  if (report?.error || report?.auditReportVersion !== 2 || !report.vulnerabilities || !report.metadata?.vulnerabilities) {
    throw new Error('Dependency audit returned no valid report.');
  }
  const warnings = new Set();
  const checked = new Set();
  function visit(name, ancestors = new Set()) {
    if (checked.has(name)) return;
    const entry = report.vulnerabilities[name];
    if (!entry || ancestors.has(name) || !entry.nodes?.length || !entry.via?.length) {
      throw new Error(`Unreviewed build dependency chain: ${name}`);
    }
    for (const path of entry.nodes) {
      if (lock.packages?.[path]?.dev !== true) throw new Error(`Runtime vulnerability is never exempted: ${name}`);
    }
    const branch = new Set([...ancestors, name]);
    for (const cause of entry.via) {
      if (typeof cause === 'string') { visit(cause, branch); continue; }
      const accepted = reviewed.get(cause.url);
      if (!accepted || accepted.name !== name || entry.nodes.some((path) => lock.packages[path].version !== accepted.version)) {
        throw new Error(`Unreviewed dependency advisory: ${cause.url ?? name}`);
      }
      if (now >= new Date('2026-09-30T00:00:00Z')) throw new Error('Build-only advisory review expired; re-evaluate upstream fixes and exposure.');
      warnings.add(cause.url);
    }
    checked.add(name);
  }
  for (const name of Object.keys(report.vulnerabilities)) visit(name);
  return [...warnings].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this gate with npm run audit:build.');
  const result = spawnSync(process.execPath, [npmCli, 'audit', '--json'], { encoding: 'utf8', windowsHide: true, timeout: 90000 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Dependency audit failed to run.');
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const warnings = auditBuildReport(JSON.parse(result.stdout), lock);
  for (const advisory of warnings) console.warn(`REVIEWED BUILD-ONLY RISK (not patched): ${advisory}`);
  console.log(`Build dependency review: ${warnings.length} known advisories; no unreviewed vulnerabilities. See docs/security-review-beta.3.md.`);
}
