import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const INSTANCE_LOCK_FILE = 'instance.lock';

export class InstanceLockError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'InstanceLockError';
    this.code = 'SUOWANG_INSTANCE_CONFLICT';
    this.details = details;
  }
}

export function inspectProcess(pid, { kill = process.kill } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return 'unknown';
  try {
    kill(pid, 0);
    return 'alive';
  } catch (error) {
    if (error?.code === 'ESRCH') return 'dead';
    return 'unknown';
  }
}

function readLock(path, readFile = readFileSync) {
  const raw = readFile(path, 'utf8');
  const value = JSON.parse(raw);
  if (!Number.isInteger(value?.pid) || value.pid <= 0 || typeof value?.token !== 'string' || !value.token) {
    throw new Error('Malformed instance lock.');
  }
  return { raw, value };
}

export function acquireInstanceLock({
  dataDir,
  kind = 'server',
  pid = process.pid,
  now = () => new Date(),
  token = randomUUID(),
  processInspector = inspectProcess,
  fileName = INSTANCE_LOCK_FILE,
  fs = {},
} = {}) {
  if (!dataDir) throw new TypeError('dataDir is required to acquire the SUOWANG instance lock.');
  const mkdir = fs.mkdirSync ?? mkdirSync;
  const open = fs.openSync ?? openSync;
  const close = fs.closeSync ?? closeSync;
  const write = fs.writeFileSync ?? writeFileSync;
  const read = fs.readFileSync ?? readFileSync;
  const unlink = fs.unlinkSync ?? unlinkSync;
  mkdir(dataDir, { recursive: true });
  const path = join(dataDir, fileName);
  const payload = JSON.stringify({ pid, token, kind, startedAt: now().toISOString() });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor;
    try {
      descriptor = open(path, 'wx', 0o600);
      write(descriptor, `${payload}\n`, 'utf8');
      close(descriptor);
      descriptor = undefined;
      let released = false;
      return {
        path,
        pid,
        token,
        release() {
          if (released) return false;
          released = true;
          try {
            const current = readLock(path, read).value;
            if (current.token !== token || current.pid !== pid) return false;
            unlink(path);
            return true;
          } catch (error) {
            if (error?.code === 'ENOENT') return false;
            throw error;
          }
        },
      };
    } catch (error) {
      if (descriptor !== undefined) {
        try { close(descriptor); } catch {}
      }
      if (error?.code !== 'EEXIST') throw error;

      let existing;
      try {
        existing = readLock(path, read);
      } catch (readError) {
        throw new InstanceLockError(
          'SUOWANG found an unreadable instance lock and will not guess whether the database is in use.',
          { path, reason: readError?.code ?? 'invalid_lock' },
        );
      }

      const status = processInspector(existing.value.pid);
      if (status !== 'dead') {
        throw new InstanceLockError(
          'Another SUOWANG process may already be using this data directory.',
          { path, pid: existing.value.pid, status, kind: existing.value.kind },
        );
      }

      try {
        const latest = read(path, 'utf8');
        if (latest !== existing.raw) continue;
        unlink(path);
      } catch (removeError) {
        if (removeError?.code !== 'ENOENT') {
          throw new InstanceLockError('SUOWANG could not safely clear a stale instance lock.', {
            path,
            reason: removeError?.code ?? 'remove_failed',
          });
        }
      }
    }
  }
  throw new InstanceLockError('SUOWANG could not acquire its data-directory instance lock.', { path });
}
