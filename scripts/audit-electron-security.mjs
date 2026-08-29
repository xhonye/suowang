import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import runElectronegativity from '@doyensec/electronegativity/dist/runner.js';
import electronPackage from 'electron/package.json' with { type: 'json' };

export async function auditElectronSecurity(input) {
  const target = resolve(input);
  const result = await runElectronegativity({
    input: target,
    customScan: [],
    excludeFromScan: [],
    severitySet: 'high',
    confidenceSet: 'firm',
    isRelative: true,
    isVerbose: false,
    parserPlugins: [],
    electronVersionOverride: electronPackage.version,
  }, false);
  const parseFailures = result.errors.filter((error) => !error.tolerable);
  const blockers = result.issues.filter((issue) => issue.severity.value >= 3 && issue.confidence.value >= 1);
  if (parseFailures.length || blockers.length) {
    const details = [
      ...parseFailures.map((error) => `parse: ${error.file} ${error.message}`),
      ...blockers.map((issue) => `${issue.id}: ${issue.file}:${issue.location.line}:${issue.location.column}`),
    ];
    throw new Error(`Electronegativity release blockers:\n${details.join('\n')}`);
  }
  return { checks: result.globalChecks + result.atomicChecks, blockers: 0, toleratedParseWarnings: result.errors.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node scripts/audit-electron-security.mjs <packaged-app-path>');
  const result = await auditElectronSecurity(input);
  console.log(`Electronegativity passed: ${result.checks} checks, ${result.blockers} high-risk blockers.`);
}
