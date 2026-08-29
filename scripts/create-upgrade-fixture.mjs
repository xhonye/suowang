import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = fileURLToPath(new URL('..', import.meta.url));
const input = process.argv[2];
if (!input || !isAbsolute(input)) throw new Error('Usage: node scripts/create-upgrade-fixture.mjs <absolute-data-dir>');
const dataDir = resolve(input);
mkdirSync(join(dataDir, 'profile'), { recursive: true });
const databasePath = join(dataDir, 'suowang.db');
const db = new Database(databasePath);
try {
  db.exec(readFileSync(join(root, 'migrations', '001_init.sql'), 'utf8'));
  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '001_init.sql', '2026-01-01T00:00:00.000Z');
  `);
  db.prepare('UPDATE app_settings SET display_name = ?, avatar_path = ?, last_viewed_state_id = ? WHERE singleton = 1')
    .run('升级验收用户', 'profile/avatar.png', 'work');
  db.prepare(`
    INSERT INTO mainlines(id, state_id, slot_index, name, normalized_name, goal, success_criteria, horizon, status, created_at, ended_at)
    VALUES (?, 'work', 1, ?, ?, ?, ?, ?, 'active', ?, NULL)
  `).run('ml_upgrade', '保留旧主线', '保留旧主线', '旧目标仍在', '旧标准仍在', '约 2 周', '2026-01-01T00:00:00.000Z');
  db.prepare(`
    INSERT INTO mainlines(id, state_id, slot_index, name, normalized_name, goal, success_criteria, horizon, status, created_at, ended_at)
    VALUES (?, 'life', 1, ?, ?, '', '', '', 'completed', ?, ?)
  `).run('ml_history_upgrade', '保留旧行迹', '保留旧行迹', '2025-12-01T00:00:00.000Z', '2025-12-31T00:00:00.000Z');
  db.prepare(`
    INSERT INTO todos(id, state_id, mainline_id, title, status, position, created_at, ended_at)
    VALUES (?, 'work', 'ml_upgrade', ?, 'active', 1, ?, NULL)
  `).run('td_upgrade', '保留旧事项', '2026-01-01T00:00:00.000Z');
  db.prepare('UPDATE states SET current_mainline_id = ?, priority_todo_id = ? WHERE id = ?')
    .run('ml_upgrade', 'td_upgrade', 'work');
} finally {
  db.close();
}
copyFileSync(join(root, 'assets', 'brand', 'suowang-app-icon-256.png'), join(dataDir, 'profile', 'avatar.png'));
console.log(`Created controlled v0.1-style fixture: ${databasePath}`);
