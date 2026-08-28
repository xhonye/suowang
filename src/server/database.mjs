import Database from 'better-sqlite3';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
}

function removeIfPresent(path) {
  if (existsSync(path)) unlinkSync(path);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timestampKey(date) {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function migrationVersion(fileName) {
  const match = /^(\d+)_.*\.sql$/i.exec(fileName);
  return match ? Number(match[1]) : null;
}

function assertDatabaseIntegrity(db, { requireCurrentSchema = true } = {}) {
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);

  const required = new Set(['schema_migrations', 'states', 'mainlines', 'todos', 'app_settings']);
  if (requireCurrentSchema) required.add('todo_occurrences');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  for (const name of required) {
    if (!tables.some((table) => table.name === name)) {
      throw new Error(`Restore file is missing required table: ${name}`);
    }
  }

  const stateIds = db.prepare('SELECT id FROM states ORDER BY sort_order').all().map((row) => row.id);
  if (stateIds.join(',') !== 'restore,work,life') {
    throw new Error('Restore file does not contain the three immutable SUOWANG states.');
  }
}

export class DatabaseRuntime {
  constructor({ dataDir, migrationsDir, databaseName = 'suowang.db' }) {
    this.dataDir = dataDir;
    this.migrationsDir = migrationsDir;
    this.databasePath = join(dataDir, databaseName);
    this.backupsDir = join(dataDir, 'backups');
    this.tempDir = join(dataDir, 'tmp');
    this.profileDir = join(dataDir, 'profile');
    this.initializeFreshDatabase = !existsSync(this.databasePath);
    ensureDirectory(this.dataDir);
    ensureDirectory(this.backupsDir);
    ensureDirectory(this.tempDir);
    ensureDirectory(this.profileDir);
    this.open();
  }

  open() {
    this.db = new Database(this.databasePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('journal_mode = WAL');
    this.runMigrations();
    if (this.initializeFreshDatabase) {
      // Migration 001 retains its published seed; only brand-new databases receive the neutral default.
      this.db.prepare('UPDATE app_settings SET display_name = ? WHERE singleton = 1').run('所往用户');
      this.initializeFreshDatabase = false;
    }
    const schemaVersion = this.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version;
    assertDatabaseIntegrity(this.db, { requireCurrentSchema: schemaVersion >= 4 });
  }

  runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    const applied = new Set(
      this.db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
    );
    const files = readdirSync(this.migrationsDir)
      .map((name) => ({ name, version: migrationVersion(name) }))
      .filter((item) => item.version !== null)
      .sort((left, right) => left.version - right.version);

    for (const file of files) {
      if (applied.has(file.version)) continue;
      const sql = readFileSync(join(this.migrationsDir, file.name), 'utf8');
      this.db.transaction(() => {
        this.db.exec(sql);
        this.db.prepare(`
          INSERT INTO schema_migrations(version, name, applied_at)
          VALUES (?, ?, ?)
        `).run(file.version, file.name, new Date().toISOString());
      })();
    }
  }

  async backupTo(destination) {
    ensureDirectory(dirname(destination));
    removeIfPresent(destination);
    await this.db.backup(destination);
    return destination;
  }

  async ensureDailyBackup(date = new Date()) {
    const destination = join(this.backupsDir, `suowang-${localDateKey(date)}.db`);
    if (existsSync(destination)) return { created: false, path: destination };
    await this.backupTo(destination);
    this.pruneAutomaticBackups(30);
    return { created: true, path: destination };
  }

  pruneAutomaticBackups(limit) {
    const backups = readdirSync(this.backupsDir)
      .filter((name) => /^suowang-\d{4}-\d{2}-\d{2}\.db$/.test(name))
      .sort()
      .reverse();
    for (const name of backups.slice(limit)) removeIfPresent(join(this.backupsDir, name));
  }

  async createDownloadBackup(date = new Date()) {
    const path = join(this.tempDir, `suowang-export-${timestampKey(date)}.db`);
    await this.backupTo(path);
    return path;
  }

  validateRestoreFile(path) {
    const candidate = new Database(path, { readonly: true, fileMustExist: true });
    try {
      candidate.pragma('foreign_keys = ON');
      assertDatabaseIntegrity(candidate, { requireCurrentSchema: false });
    } finally {
      candidate.close();
    }
  }

  async restoreFrom(sourcePath, date = new Date()) {
    this.validateRestoreFile(sourcePath);
    const safetyBackup = join(this.backupsDir, `pre-restore-${timestampKey(date)}.db`);
    await this.backupTo(safetyBackup);

    const rollbackPath = join(this.tempDir, `rollback-${timestampKey(date)}.db`);
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    removeIfPresent(`${this.databasePath}-wal`);
    removeIfPresent(`${this.databasePath}-shm`);
    removeIfPresent(rollbackPath);
    renameSync(this.databasePath, rollbackPath);

    try {
      copyFileSync(sourcePath, this.databasePath);
      this.open();
      removeIfPresent(rollbackPath);
      return { safetyBackup };
    } catch (error) {
      try {
        if (this.db?.open) this.db.close();
      } catch {
        // Continue into rollback recovery.
      }
      removeIfPresent(this.databasePath);
      renameSync(rollbackPath, this.databasePath);
      this.open();
      throw error;
    }
  }

  close() {
    if (this.db?.open) {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.close();
    }
  }

  describe() {
    return {
      databasePath: this.databasePath,
      backupsDir: this.backupsDir,
      profileDir: this.profileDir,
      databaseName: basename(this.databasePath),
    };
  }
}
