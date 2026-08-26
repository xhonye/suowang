import { existsSync, readFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
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

  if (platform === 'darwin') {
    return normalize(join(homedir(), 'Library', 'Application Support', 'SUOWANG'));
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

export function resolveAccessMode({
  env = process.env,
  accessConfigPath = join(resolveDataDir({ env }), 'access.json'),
} = {}) {
  let configuredMode = 'local';
  if (existsSync(accessConfigPath)) {
    let config;
    try {
      config = JSON.parse(readFileSync(accessConfigPath, 'utf8').replace(/^\uFEFF/, ''));
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
