import assert from 'node:assert/strict';
import test from 'node:test';
import { auditBuildReport } from '../scripts/audit-build-dependencies.mjs';

const url = 'https://github.com/advisories/GHSA-jmr9-qjv8-65gv';
const lock = { packages: { 'node_modules/extract-zip': { dev: true, version: '2.0.1' } } };
const report = { auditReportVersion: 2, metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {
  'extract-zip': { nodes: ['node_modules/extract-zip'], via: [{ url }] },
} };
const options = { now: new Date('2026-08-30T00:00:00Z') };
test('build advisory exceptions are exact, dev-only and expire', () => {
  assert.deepEqual(auditBuildReport(report, lock, options), [url]);
  assert.throws(() => auditBuildReport(report, { packages: { 'node_modules/extract-zip': { version: '2.0.1' } } }, options), /Runtime vulnerability/);
  assert.throws(() => auditBuildReport(report, { packages: { 'node_modules/extract-zip': { dev: true, version: '2.0.0' } } }, options), /Unreviewed/);
  assert.throws(() => auditBuildReport(report, lock, { now: new Date('2026-09-30T00:00:00Z') }), /expired/);
  assert.throws(() => auditBuildReport({ ...report, error: {} }, lock, options), /no valid report/);
  const unknown = structuredClone(report);
  unknown.vulnerabilities['extract-zip'].via[0].url = 'https://github.com/advisories/new-advisory';
  assert.throws(() => auditBuildReport(unknown, lock, options), /Unreviewed/);
});
