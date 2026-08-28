#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/server/app-meta.mjs';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const command = process.argv[2] ?? 'start';

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function printHelp() {
  console.log(`所往 SUOWANG ${APP_VERSION}

Usage:
  suowang                    Start SUOWANG and open it
  suowang start              Start SUOWANG and open it
  suowang serve              Run the local service in this terminal
  suowang access tailscale   Allow devices in your Tailnet to connect
  suowang access local       Return to local-only access
  suowang install-shortcut   Create the Windows desktop shortcut
  suowang --version          Show the installed version
  suowang --help             Show this help

SUOWANG keeps business data outside the installed package.`);
}

if (command === '--version' || command === '-v') {
  console.log(APP_VERSION);
} else if (command === '--help' || command === '-h' || command === 'help') {
  printHelp();
} else if (command === 'start' || command === 'open') {
  if (process.platform === 'win32') {
    run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', join(projectRoot, 'scripts', 'start.ps1'),
    ]);
  } else {
    run(process.execPath, [join(projectRoot, 'scripts', 'serve.mjs')]);
  }
} else if (command === 'serve') {
  run(process.execPath, [join(projectRoot, 'scripts', 'serve.mjs')]);
} else if (command === 'access') {
  const mode = process.argv[3];
  if (process.platform !== 'win32') {
    console.error('访问模式配置入口目前只支持 Windows。其他系统请设置 SUOWANG_ACCESS 环境变量。');
    process.exitCode = 1;
  } else if (mode !== 'local' && mode !== 'tailscale') {
    console.error('请运行 suowang access tailscale 或 suowang access local。');
    process.exitCode = 1;
  } else {
    run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', join(projectRoot, 'scripts', 'configure-access.ps1'),
      '-Mode', mode,
    ]);
  }
} else if (command === 'install' || command === 'install-shortcut') {
  if (process.platform !== 'win32') {
    console.error('桌面快捷方式安装目前只支持 Windows。');
    process.exitCode = 1;
  } else {
    run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', join(projectRoot, 'scripts', 'install-shortcut.ps1'),
    ]);
  }
} else {
  console.error(`未知命令：${command}\n运行 suowang --help 查看可用命令。`);
  process.exitCode = 1;
}
