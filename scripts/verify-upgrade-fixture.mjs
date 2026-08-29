import { existsSync, readdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const input = process.argv[2];
if (!input || !isAbsolute(input)) throw new Error('Usage: node scripts/verify-upgrade-fixture.mjs <absolute-data-dir>');
const dataDir = resolve(input);
const db = new Database(join(dataDir, 'suowang.db'), { readonly: true, fileMustExist: true });
try {
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Upgraded database integrity check failed.');
  if (db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version !== 7) throw new Error('Upgrade did not reach schema 7.');
  if (db.prepare('SELECT display_name FROM app_settings WHERE singleton = 1').get().display_name !== '升级验收用户') throw new Error('Display name was not preserved.');
  if (db.prepare('SELECT name FROM mainlines WHERE id = ?').get('ml_upgrade')?.name !== '保留旧主线') throw new Error('Active mainline was not preserved.');
  if (db.prepare('SELECT title FROM todos WHERE id = ?').get('td_upgrade')?.title !== '保留旧事项') throw new Error('Todo was not preserved.');
  if (db.prepare('SELECT name FROM mainlines WHERE id = ?').get('ml_history_upgrade')?.name !== '保留旧行迹') throw new Error('History was not preserved.');
  if (db.prepare("SELECT COUNT(*) AS count FROM mainlines WHERE name LIKE '%demo%' OR name LIKE '%示例%'").get().count !== 0) throw new Error('Upgrade inserted demo data.');
} finally {
  db.close();
}
if (!existsSync(join(dataDir, 'profile', 'avatar.png'))) throw new Error('Avatar was not preserved.');
if (!readdirSync(join(dataDir, 'backups')).some((name) => name.startsWith('pre-migrate-v1-to-v7-'))) {
  throw new Error('Upgrade did not create the pre-migration backup.');
}
console.log('Controlled v0.1-style upgrade fixture passed.');
