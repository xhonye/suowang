import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
export const MIGRATIONS_DIR = join(PROJECT_ROOT, 'migrations');

export function resolveDataDir({ env = process.env, platform = process.platform } = {}) {
  if (env.SUOWANG_DATA_DIR) {
    if (!isAbsolute(env.SUOWANG_DATA_DIR)) {
      throw new Error('SUOWANG_DATA_DIR must be an absolute path.');
    }
    return normalize(resolve(env.SUOWANG_DATA_DIR));
  }

  if (platform === 'win32' && existsSync('D:/5Data')) {
    return normalize('D:/5Data/suowang');
  }

  if (platform === 'win32') {
    return normalize(join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'SUOWANG'));
  }

  return normalize(join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'suowang'));
}

export function resolvePort(env = process.env) {
  const port = Number(env.SUOWANG_PORT ?? 2037);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SUOWANG_PORT must be an integer between 1 and 65535.');
  }
  return port;
}
