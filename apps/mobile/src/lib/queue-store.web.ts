import type { QueuedReport } from "../types";

export const MAX_AUTO_ATTEMPTS = 5;
const KEY = "civic-mobile-preview-queue";

export class SQLiteQueueStore {
  async init(): Promise<void> {}

  async put(report: QueuedReport): Promise<void> {
    const reports = (await this.list()).filter((item) => item.id !== report.id);
    reports.push(report);
    globalThis.localStorage.setItem(KEY, JSON.stringify(reports));
  }

  async list(ownerId?: string): Promise<QueuedReport[]> {
    const stored = globalThis.localStorage.getItem(KEY);
    if (!stored) return [];
    return (JSON.parse(stored) as QueuedReport[])
      .filter((report) => !ownerId || report.ownerId === ownerId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async remove(id: string): Promise<void> {
    const reports = (await this.list()).filter((item) => item.id !== id);
    globalThis.localStorage.setItem(KEY, JSON.stringify(reports));
  }

  async markFailed(id: string, error: string): Promise<void> {
    const report = (await this.list()).find((item) => item.id === id);
    if (report)
      await this.put({
        ...report,
        attempts: report.attempts + 1,
        lastError: error,
        status: "failed",
      });
  }

  async retry(id: string): Promise<void> {
    const report = (await this.list()).find((item) => item.id === id);
    if (report)
      await this.put({
        ...report,
        attempts: 0,
        lastError: null,
        status: "pending",
      });
  }
}
