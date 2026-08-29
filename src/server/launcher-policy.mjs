import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTIONS = new Set(['reuse', 'restart', 'conflict']);

export function decideLauncherAction({
  expectedVersion,
  expectedAccessMode,
  health = null,
  listener = {},
  processVerified = false,
} = {}) {
  const occupied = Boolean(listener.occupied);
  if (!occupied) {
    return { action: 'restart', reason: 'no_listener', stopExisting: false };
  }
  if (!health || health.app !== 'suowang') {
    return { action: 'conflict', reason: 'port_not_owned_by_suowang', stopExisting: false };
  }

  const healthy = health.status === 'ok' && health.database === 'ready';
  const versionMatches = health.version === expectedVersion;
  const accessModeMatches = health.accessMode === expectedAccessMode
    && listener.accessModeMatches === true;
  if (healthy && versionMatches && accessModeMatches) {
    return { action: 'reuse', reason: 'matching_service', stopExisting: false };
  }
  if (!processVerified) {
    return { action: 'conflict', reason: 'suowang_process_unverified', stopExisting: false };
  }
  return {
    action: 'restart',
    reason: !versionMatches
      ? 'version_mismatch'
      : !accessModeMatches
        ? 'access_mode_mismatch'
        : 'service_not_ready',
    stopExisting: true,
  };
}

export function assertLauncherDecision(decision) {
  if (!decision || !ACTIONS.has(decision.action)) {
    throw new Error('Invalid launcher decision.');
  }
  return decision;
}

export function parseLauncherCliInput(argument = '') {
  const text = argument.startsWith('--base64=')
    ? Buffer.from(argument.slice('--base64='.length), 'base64').toString('utf8')
    : argument;
  return JSON.parse(text || '{}');
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isDirectRun) {
  try {
    const input = parseLauncherCliInput(process.argv[2] ?? '');
    process.stdout.write(`${JSON.stringify(assertLauncherDecision(decideLauncherAction(input)))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
