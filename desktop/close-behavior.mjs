import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function validateCloseBehavior(value) {
  if (value !== 'tray' && value !== 'quit') throw new TypeError('关闭行为只能是 tray 或 quit。');
  return value;
}

export function loadCloseBehavior(path) {
  try {
    return validateCloseBehavior(JSON.parse(readFileSync(path, 'utf8')).closeBehavior);
  } catch (error) {
    if (error.code === 'ENOENT') return 'tray';
    throw error;
  }
}

export function saveCloseBehavior(path, value) {
  validateCloseBehavior(value);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ closeBehavior: value })}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  return value;
}
