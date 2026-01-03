import Database from 'better-sqlite3';

export interface Run {
  id: string;
  start_time: number;
  end_time: number | null;
  total_files: number;
  completed: number;
  skipped: number;
  failed: number;
  total_engines: number;
  completed_engines: number;
  status: 'running' | 'completed' | 'cancelled';
  logs: string;
}

export interface FileResult {
  id: number;
  run_id: string;
  file_path: string;
  video_path: string | null;
  status: 'pending' | 'processing' | 'completed' | 'skipped' | 'error';
  current_engine: string | null;
  engines: string; // JSON stringified { ffsubsync?: {...}, autosubsync?: {...}, alass?: {...} }
  created_at: number;
  updated_at: number;
}

export class SubsyncarrPlusDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        total_files INTEGER NOT NULL,
        completed INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        total_engines INTEGER DEFAULT 0,
        completed_engines INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        logs TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS file_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        video_path TEXT,
        status TEXT NOT NULL,
        current_engine TEXT,
        engines TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_file_results_run
        ON file_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_file_results_status
        ON file_results(status);
    `);

    // Migration: Add logs column if it doesn't exist
    const columns = this.db.pragma('table_info(runs)') as Array<{ name: string }>;
    const hasLogsColumn = columns.some((col) => col.name === 'logs');
    if (!hasLogsColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN logs TEXT DEFAULT ''`);
    }

    // Migration: Add total_engines and completed_engines columns if they don't exist
    const hasTotalEnginesColumn = columns.some((col) => col.name === 'total_engines');
    if (!hasTotalEnginesColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN total_engines INTEGER DEFAULT 0`);
    }
    const hasCompletedEnginesColumn = columns.some((col) => col.name === 'completed_engines');
    if (!hasCompletedEnginesColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN completed_engines INTEGER DEFAULT 0`);
    }
  }

  // Run methods
  createRun(id: string, totalFiles: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO runs (id, start_time, total_files, status)
      VALUES (?, ?, ?, 'running')
    `);
    stmt.run(id, Date.now(), totalFiles);
  }

  updateRun(id: string, updates: Partial<Run>): void {
    const fields = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updates);
    this.db.prepare(`UPDATE runs SET ${fields} WHERE id = ?`).run(...values, id);
  }

  getRun(id: string): Run | null {
    const result = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    return result ? (result as Run) : null;
  }

  getRunHistory(limit: number = 50): Run[] {
    return this.db
      .prepare(
        `
      SELECT * FROM runs
      ORDER BY start_time DESC
      LIMIT ?
    `,
      )
      .all(limit) as Run[];
  }

  // File methods
  createFileResult(runId: string, filePath: string, videoPath: string | null): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_results
        (run_id, file_path, video_path, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `);
    const now = Date.now();
    stmt.run(runId, filePath, videoPath, now, now);
  }

  updateFileResult(runId: string, filePath: string, updates: Partial<FileResult>): void {
    const updatesWithTimestamp = { ...updates, updated_at: Date.now() };
    const fields = Object.keys(updatesWithTimestamp)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updatesWithTimestamp);
    this.db
      .prepare(
        `
      UPDATE file_results
      SET ${fields}
      WHERE run_id = ? AND file_path = ?
    `,
      )
      .run(...values, runId, filePath);
  }

  getFileResults(runId: string): FileResult[] {
    return this.db
      .prepare(
        `
      SELECT * FROM file_results
      WHERE run_id = ?
      ORDER BY created_at ASC
    `,
      )
      .all(runId) as FileResult[];
  }

  close() {
    this.db.close();
  }
}
