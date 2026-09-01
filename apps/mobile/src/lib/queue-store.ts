import * as SQLite from "expo-sqlite";
import type { QueuedReport } from "../types";

export const MAX_AUTO_ATTEMPTS = 5;

export interface QueueStore {
  init(): Promise<void>;
  put(report: QueuedReport): Promise<void>;
  list(ownerId?: string): Promise<QueuedReport[]>;
  remove(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  retry(id: string): Promise<void>;
}

interface QueueRow {
  payload: string;
}

export class SQLiteQueueStore implements QueueStore {
  private database: Promise<SQLite.SQLiteDatabase> | null = null;
  private initialized: Promise<void> | null = null;

  private db(): Promise<SQLite.SQLiteDatabase> {
    this.database ??= SQLite.openDatabaseAsync("civic-mobile.db");
    return this.database;
  }

  async init(): Promise<void> {
    this.initialized ??= this.db().then((db) =>
      db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS report_queue (
          id TEXT PRIMARY KEY NOT NULL,
          occurred_at TEXT NOT NULL,
          payload TEXT NOT NULL
        );
      `),
    );
    await this.initialized;
  }

  async put(report: QueuedReport): Promise<void> {
    await this.init();
    const db = await this.db();
    await db.runAsync(
      "INSERT OR REPLACE INTO report_queue (id, occurred_at, payload) VALUES (?, ?, ?)",
      report.id,
      report.occurredAt,
      JSON.stringify(report),
    );
  }

  async list(ownerId?: string): Promise<QueuedReport[]> {
    await this.init();
    const db = await this.db();
    const rows = await db.getAllAsync<QueueRow>(
      "SELECT payload FROM report_queue ORDER BY occurred_at ASC",
    );
    const reports = rows.map((row) => JSON.parse(row.payload) as QueuedReport);
    return ownerId
      ? reports.filter((report) => report.ownerId === ownerId)
      : reports;
  }

  async remove(id: string): Promise<void> {
    await this.init();
    const db = await this.db();
    await db.runAsync("DELETE FROM report_queue WHERE id = ?", id);
    // Privacy module carries native Skia and is intentionally lazy: queue state
    // is already durable and testable without loading a graphics runtime.
    void import("./privacy")
      .then(({ removeProcessedPhotos }) => removeProcessedPhotos(id))
      .catch(() => undefined);
  }

  async markFailed(id: string, error: string): Promise<void> {
    const report = (await this.list()).find((item) => item.id === id);
    if (!report) return;
    await this.put({
      ...report,
      attempts: report.attempts + 1,
      lastError: error,
      status: "failed",
    });
  }

  async retry(id: string): Promise<void> {
    const report = (await this.list()).find((item) => item.id === id);
    if (!report) return;
    await this.put({
      ...report,
      attempts: 0,
      lastError: null,
      status: "pending",
    });
  }
}
