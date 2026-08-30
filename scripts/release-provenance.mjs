import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workflows = Object.freeze({
  core: { path: '.github/workflows/ci.yml', name: 'Verify SUOWANG', events: ['push', 'workflow_dispatch'] },
  windows: { path: '.github/workflows/release-windows.yml', name: 'Build Windows candidate', events: ['workflow_dispatch'] },
  macos: { path: '.github/workflows/release-macos.yml', name: 'Build macOS Apple Silicon candidate', events: ['workflow_dispatch'] },
});

export function assertReleaseRun({ run, sha, repository, kind }) {
  const expected = workflows[kind];
  if (!expected || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid release provenance input.');
  if (run?.repository?.full_name !== repository || run?.head_repository?.full_name !== repository
      || run?.head_sha !== sha || run?.head_branch !== 'main'
      || run?.path !== expected.path || run?.name !== expected.name
      || run?.status !== 'completed' || run?.conclusion !== 'success'
      || !expected.events.includes(run?.event)) {
    throw new Error(`Release blocked: ${kind} run is not a successful trusted-main run for the exact candidate SHA.`);
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , kind, path] = process.argv;
  assertReleaseRun({ kind, run: JSON.parse(readFileSync(path, 'utf8')), sha: process.env.CANDIDATE_SHA, repository: process.env.GITHUB_REPOSITORY });
  console.log(`${kind} release provenance verified`);
}
