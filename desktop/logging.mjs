import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SAFE_CODES = new Set([
  'startup',
  'shutdown',
  'uncaught-exception',
  'unhandled-rejection',
  'render-process-gone',
  'child-process-gone',
  'did-fail-load',
  'ipc-failure',
  'smoke-failure',
]);

export function createDesktopLogger(dataDir, { clock = () => new Date() } = {}) {
  const logsDir = join(dataDir, 'logs');
  const path = join(logsDir, 'desktop.log');
  mkdirSync(logsDir, { recursive: true });
  function write(level, code, error) {
    const safeCode = SAFE_CODES.has(code) ? code : 'startup';
    const errorName = error instanceof Error ? error.name : typeof error;
    const errorCode = typeof error?.code === 'string' ? error.code.slice(0, 80) : null;
    const record = { at: clock().toISOString(), level, code: safeCode, errorName, errorCode };
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  }
  return { logsDir, path, info: (code) => write('info', code), error: (code, error) => write('error', code, error) };
}
