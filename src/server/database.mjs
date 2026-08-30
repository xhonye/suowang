import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
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

export function assertSQLiteIntegrity(db) {
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);
}

export function assertForeignKeyIntegrity(db) {
  const violations = db.pragma('foreign_key_check');
  if (violations.length > 0) {
    throw new Error(`SQLite foreign key check failed with ${violations.length} violation(s).`);
  }
}

function assertDatabaseIntegrity(db, { requireCurrentSchema = true } = {}) {
  assertSQLiteIntegrity(db);
  assertForeignKeyIntegrity(db);

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
  constructor({
    dataDir,
    migrationsDir,
    databaseName = 'suowang.db',
    clock = () => new Date(),
    backupDatabase = (db, destination) => db.backup(destination),
  }) {
    this.dataDir = dataDir;
    this.migrationsDir = migrationsDir;
    this.databasePath = join(dataDir, databaseName);
    this.backupsDir = join(dataDir, 'backups');
    this.tempDir = join(dataDir, 'tmp');
    this.profileDir = join(dataDir, 'profile');
    this.clock = clock;
    this.backupDatabase = backupDatabase;
    this.initializeFreshDatabase = !existsSync(this.databasePath);
    ensureDirectory(this.dataDir);
    ensureDirectory(this.backupsDir);
    ensureDirectory(this.tempDir);
    ensureDirectory(this.profileDir);
    this.open();
  }

  open({ existingDatabase = existsSync(this.databasePath) } = {}) {
    this.db = new Database(this.databasePath);
    try {
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('busy_timeout = 5000');
      this.db.pragma('journal_mode = WAL');
      this.runMigrations({ existingDatabase });
      if (this.initializeFreshDatabase) {
        // Migration 001 retains its published seed; only brand-new databases receive the neutral default.
        this.db.prepare('UPDATE app_settings SET display_name = ? WHERE singleton = 1').run('所往用户');
        this.initializeFreshDatabase = false;
      }
      const schemaVersion = this.getCurrentSchemaVersion();
      assertDatabaseIntegrity(this.db, { requireCurrentSchema: schemaVersion >= 4 });
    } catch (error) {
      if (this.db?.open) this.db.close();
      throw error;
    }
  }

  ensureMigrationTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  listMigrationFiles() {
    return readdirSync(this.migrationsDir)
      .map((name) => ({ name, version: migrationVersion(name) }))
      .filter((item) => item.version !== null)
      .sort((left, right) => left.version - right.version);
  }

  getCurrentSchemaVersion() {
    return this.db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
  }

  getPendingMigrations() {
    const applied = new Set(
      this.db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
    );
    return this.listMigrationFiles().filter((file) => !applied.has(file.version));
  }

  createPreMigrationBackup(pendingMigrations) {
    const fromVersion = this.getCurrentSchemaVersion();
    const toVersion = pendingMigrations.at(-1).version;
    const stem = `pre-migrate-v${fromVersion}-to-v${toVersion}-${timestampKey(this.clock())}`;
    let destination = join(this.backupsDir, `${stem}.db`);
    let suffix = 1;
    while (existsSync(destination)) {
      destination = join(this.backupsDir, `${stem}-${suffix}.db`);
      suffix += 1;
    }

    this.db.pragma('wal_checkpoint(TRUNCATE)');
    const escapedDestination = destination.replaceAll("'", "''");
    this.db.exec(`VACUUM INTO '${escapedDestination}'`);
    const candidate = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      candidate.pragma('foreign_keys = ON');
      assertSQLiteIntegrity(candidate);
      assertForeignKeyIntegrity(candidate);
    } finally {
      candidate.close();
    }
    return destination;
  }

  applyPendingMigrations(pendingMigrations) {
    const migrations = pendingMigrations.map((file) => ({
      ...file,
      sql: readFileSync(join(this.migrationsDir, file.name), 'utf8'),
    }));
    this.db.transaction(() => {
      for (const file of migrations) {
        this.db.exec(file.sql);
        this.db.prepare(`
          INSERT INTO schema_migrations(version, name, applied_at)
          VALUES (?, ?, ?)
        `).run(file.version, file.name, this.clock().toISOString());
      }
      assertSQLiteIntegrity(this.db);
      assertForeignKeyIntegrity(this.db);
    })();
  }

  runMigrations({ existingDatabase }) {
    this.ensureMigrationTable();
    const pendingMigrations = this.getPendingMigrations();
    if (pendingMigrations.length === 0) return { backupPath: null, applied: [] };
    const backupPath = existingDatabase ? this.createPreMigrationBackup(pendingMigrations) : null;
    this.applyPendingMigrations(pendingMigrations);
    return { backupPath, applied: pendingMigrations.map((file) => file.version) };
  }

  async backupTo(destination) {
    ensureDirectory(dirname(destination));
    const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
    const previous = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.previous`);
    try {
      await this.backupDatabase(this.db, temporary);
      this.validateBackupFile(temporary);

      if (!existsSync(destination)) {
        renameSync(temporary, destination);
        return destination;
      }

      try {
        renameSync(temporary, destination);
        return destination;
      } catch (error) {
        if (!existsSync(destination) || !existsSync(temporary)) throw error;
      }

      renameSync(destination, previous);
      try {
        renameSync(temporary, destination);
      } catch (error) {
        renameSync(previous, destination);
        throw error;
      }
      removeIfPresent(previous);
      return destination;
    } finally {
      removeIfPresent(temporary);
      if (existsSync(previous) && existsSync(destination)) removeIfPresent(previous);
    }
  }

  async ensureDailyBackup(date = new Date()) {
    const destination = join(this.backupsDir, `suowang-${localDateKey(date)}.db`);
    if (existsSync(destination)) {
      try {
        this.validateBackupFile(destination);
        return { created: false, path: destination };
      } catch {
        // Replace an incomplete or invalid same-day backup only after a new candidate is verified.
      }
    }
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
    const path = join(this.tempDir, `suowang-export-${timestampKey(date)}-${randomUUID()}.db`);
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

  validateBackupFile(path) {
    const candidate = new Database(path, { readonly: true, fileMustExist: true });
    try {
      candidate.pragma('foreign_keys = ON');
      assertDatabaseIntegrity(candidate, { requireCurrentSchema: true });
      const expectedVersions = this.listMigrationFiles().map((file) => file.version);
      const appliedVersions = candidate.prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all()
        .map((row) => row.version);
      if (appliedVersions.join(',') !== expectedVersions.join(',')) {
        throw new Error(
          `Backup schema does not match this SUOWANG version: expected ${expectedVersions.join(',')}, got ${appliedVersions.join(',')}.`,
        );
      }
    } finally {
      candidate.close();
    }
  }

  async restoreFrom(sourcePath, date = new Date()) {
    this.validateRestoreFile(sourcePath);
    const operationId = `${timestampKey(date)}-${randomUUID()}`;
    const safetyBackup = join(this.backupsDir, `pre-restore-${operationId}.db`);
    await this.backupTo(safetyBackup);

    const rollbackPath = join(this.tempDir, `rollback-${operationId}.db`);
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    removeIfPresent(`${this.databasePath}-wal`);
    removeIfPresent(`${this.databasePath}-shm`);
    removeIfPresent(rollbackPath);
    renameSync(this.databasePath, rollbackPath);

    try {
      copyFileSync(sourcePath, this.databasePath);
      this.open({ existingDatabase: true });
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
      this.open({ existingDatabase: true });
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
