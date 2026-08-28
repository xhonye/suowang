import { existsSync, readFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join, normalize, posix, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
export const MIGRATIONS_DIR = join(PROJECT_ROOT, 'migrations');

export function resolveDataDir({
  env = process.env,
  platform = process.platform,
  home = homedir(),
  fileExists = existsSync,
} = {}) {
  const pathApi = platform === 'win32' ? win32 : posix;
  if (env.SUOWANG_DATA_DIR) {
    if (!pathApi.isAbsolute(env.SUOWANG_DATA_DIR)) {
      throw new Error('SUOWANG_DATA_DIR must be an absolute path.');
    }
    return pathApi.normalize(env.SUOWANG_DATA_DIR);
  }

  if (platform === 'win32') {
    const standardDir = win32.normalize(win32.join(env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local'), 'SUOWANG'));
    const legacyDir = win32.normalize('D:/5Data/suowang');
    const standardDatabase = win32.join(standardDir, 'suowang.db');
    const legacyDatabase = win32.join(legacyDir, 'suowang.db');
    const standardExists = fileExists(standardDatabase);
    const legacyExists = fileExists(legacyDatabase);
    if (standardExists && legacyExists) {
      throw new Error(
        `Found two SUOWANG databases:\n- ${standardDatabase}\n- ${legacyDatabase}\n`
        + 'Set SUOWANG_DATA_DIR to the directory you intend to use. No database was moved or merged.',
      );
    }
    return legacyExists ? legacyDir : standardDir;
  }

  if (platform === 'darwin') {
    return posix.normalize(posix.join(home, 'Library', 'Application Support', 'SUOWANG'));
  }

  return posix.normalize(posix.join(env.XDG_DATA_HOME || posix.join(home, '.local', 'share'), 'suowang'));
}

export function resolvePort(env = process.env) {
  const port = Number(env.SUOWANG_PORT ?? 2037);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SUOWANG_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

export function resolveAccessMode({
  env = process.env,
  accessConfigPath = join(resolveDataDir({ env }), 'access.json'),
  fileExists = existsSync,
  readFile = readFileSync,
} = {}) {
  let configuredMode = 'local';
  if (fileExists(accessConfigPath)) {
    let config;
    try {
      config = JSON.parse(readFile(accessConfigPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (error) {
      throw new Error(`Invalid SUOWANG access config: ${error.message}`);
    }
    configuredMode = config.accessMode ?? 'local';
  }
  const mode = String(env.SUOWANG_ACCESS ?? configuredMode).trim().toLowerCase();
  if (mode !== 'local' && mode !== 'tailscale') {
    throw new Error('SUOWANG_ACCESS must be either local or tailscale.');
  }
  return mode;
}

function isTailscaleIPv4(address) {
  const octets = String(address).split('.').map(Number);
  return octets.length === 4
    && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && octets[0] === 100
    && octets[1] >= 64
    && octets[1] <= 127;
}

export function resolveTailscaleIPv4({
  env = process.env,
  interfaces = networkInterfaces(),
} = {}) {
  const available = Object.values(interfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
    .filter(isTailscaleIPv4);

  const configured = String(env.SUOWANG_TAILSCALE_IP ?? '').trim();
  if (configured) {
    if (!isTailscaleIPv4(configured)) {
      throw new Error('SUOWANG_TAILSCALE_IP must be an IPv4 address in 100.64.0.0/10.');
    }
    if (!available.includes(configured)) {
      throw new Error(`SUOWANG_TAILSCALE_IP is not assigned to this computer: ${configured}`);
    }
    return configured;
  }

  if (available.length === 0) {
    throw new Error('SUOWANG_ACCESS=tailscale requires a connected Tailscale IPv4 address.');
  }
  if (available.length > 1) {
    throw new Error('Multiple Tailscale IPv4 addresses found. Set SUOWANG_TAILSCALE_IP explicitly.');
  }
  return available[0];
}
