#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  console.log(`所往 SUOWANG 0.1.0

Usage:
  suowang                    Start SUOWANG and open it
  suowang start              Start SUOWANG and open it
  suowang serve              Run the local service in this terminal
  suowang install-shortcut   Create the Windows desktop shortcut
  suowang --help             Show this help

SUOWANG keeps business data outside the installed package.`);
}

if (command === '--help' || command === '-h' || command === 'help') {
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
