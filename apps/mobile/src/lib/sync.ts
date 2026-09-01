import { File } from "expo-file-system";
import type { QueuedReport, SyncPayload } from "../types";
import type { QueueStore } from "./queue-store";
import { MAX_AUTO_ATTEMPTS } from "./queue-store";

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      offline?: boolean;
      deferred?: boolean;
      stop?: boolean;
    };
export type SyncSummary = {
  delivered: number;
  failed: number;
  interrupted: boolean;
};

const inflight = new Map<string, Promise<SyncSummary>>();

export async function serializeReport(
  report: QueuedReport,
): Promise<SyncPayload> {
  const [blurred, original] = await Promise.all([
    new File(report.publicPhotoUri).base64(),
    new File(report.rawPhotoUri).base64(),
  ]);
  return {
    id: report.id,
    occurredAt: report.occurredAt,
    photosBlurred: [blurred],
    photosOriginal: [original],
    phashes: [],
    location: report.location,
    address: report.address,
    description: report.description,
    tags: report.tags,
    issueType: report.issueType,
  };
}

async function drain(
  store: QueueStore,
  send: (payload: SyncPayload) => Promise<SendResult>,
  serialize: (report: QueuedReport) => Promise<SyncPayload>,
  ownerId?: string,
): Promise<SyncSummary> {
  const pending = (await store.list(ownerId)).filter(
    (item) => item.attempts < MAX_AUTO_ATTEMPTS,
  );
  let delivered = 0;
  let failed = 0;
  for (const report of pending) {
    let result: SendResult;
    try {
      result = await send(await serialize(report));
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (result.ok) {
      await store.remove(report.id);
      delivered += 1;
    } else if (result.deferred) {
      return { delivered, failed, interrupted: true };
    } else {
      await store.markFailed(report.id, result.error);
      failed += 1;
      if (result.offline || result.stop)
        return { delivered, failed, interrupted: true };
    }
  }
  return { delivered, failed, interrupted: false };
}

export function flushQueue(
  store: QueueStore,
  send: (payload: SyncPayload) => Promise<SendResult>,
  serialize: (report: QueuedReport) => Promise<SyncPayload> = serializeReport,
  ownerId?: string,
): Promise<SyncSummary> {
  const drainKey = ownerId ?? "__all__";
  const active = inflight.get(drainKey);
  if (active) return active;
  const started = drain(store, send, serialize, ownerId).finally(() => {
    inflight.delete(drainKey);
  });
  inflight.set(drainKey, started);
  return started;
}
