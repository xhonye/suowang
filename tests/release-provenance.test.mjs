import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReleaseRun } from '../scripts/release-provenance.mjs';

const sha = 'a'.repeat(40);
const repository = 'xhonye/suowang';
const core = {
  head_sha: sha, head_branch: 'main', status: 'completed', conclusion: 'success', event: 'push',
  path: '.github/workflows/ci.yml', name: 'Verify SUOWANG',
  repository: { full_name: repository }, head_repository: { full_name: repository },
};
test('release requires successful exact-SHA main CI, not merely successful candidate builds', () => {
  assert.equal(assertReleaseRun({ run: core, sha, repository, kind: 'core' }), true);
  for (const patch of [
    { conclusion: 'failure' }, { conclusion: null }, { status: 'in_progress' },
    { head_sha: 'b'.repeat(40) }, { head_branch: 'other' }, { event: 'pull_request' },
    { path: '.github/workflows/lookalike.yml' }, { name: 'Unrelated checks' },
    { head_repository: { full_name: 'other/suowang' } }, { repository: { full_name: 'other/suowang' } },
  ]) assert.throws(() => assertReleaseRun({ run: { ...core, ...patch }, sha, repository, kind: 'core' }), /Release blocked/);
});
test('release verifies exact candidate workflow identity and event', () => {
  for (const [kind, name] of [['windows', 'Build Windows candidate'], ['macos', 'Build macOS Apple Silicon candidate']]) {
    const run = { ...core, name, path: `.github/workflows/release-${kind}.yml`, event: 'workflow_dispatch' };
    assert.equal(assertReleaseRun({ run, sha, repository, kind }), true);
    assert.throws(() => assertReleaseRun({ run: { ...run, event: 'push' }, sha, repository, kind }), /Release blocked/);
  }
});
