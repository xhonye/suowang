#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/server/app-meta.mjs';
import { resolveAccessMode, resolveDataDir, resolvePort } from '../src/server/config.mjs';

export function createLauncherConfig({
  env = process.env,
  platform = process.platform,
  home = homedir(),
  fileExists = existsSync,
  readFile = readFileSync,
} = {}) {
  const dataDir = resolveDataDir({ env, platform, home, fileExists });
  const pathApi = platform === 'win32' ? win32 : posix;
  const port = resolvePort(env);
  const accessMode = resolveAccessMode({
    env,
    accessConfigPath: pathApi.join(dataDir, 'access.json'),
    fileExists,
    readFile,
  });
  return {
    version: APP_VERSION,
    expectedVersion: APP_VERSION,
    dataDir,
    port,
    accessMode,
    localHealthUrl: `http://127.0.0.1:${port}/health`,
    localAppUrl: `http://127.0.0.1:${port}/`,
  };
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isDirectRun) process.stdout.write(`${JSON.stringify(createLauncherConfig())}\n`);
