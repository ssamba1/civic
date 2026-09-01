import type { QueuedReport, SyncPayload } from "../types";
import type { QueueStore } from "./queue-store";
import { MAX_AUTO_ATTEMPTS } from "./queue-store";
import { flushQueue, type SendResult } from "./sync";

class MemoryStore implements QueueStore {
  records = new Map<string, QueuedReport>();
  async init() {}
  async put(report: QueuedReport) {
    this.records.set(report.id, structuredClone(report));
  }
  async list(ownerId?: string) {
    return [...this.records.values()]
      .filter((report) => (ownerId ? report.ownerId === ownerId : true))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
  async remove(id: string) {
    this.records.delete(id);
  }
  async markFailed(id: string, error: string) {
    const r = this.records.get(id);
    if (r)
      this.records.set(id, {
        ...r,
        attempts: r.attempts + 1,
        status: "failed",
        lastError: error,
      });
  }
  async retry(id: string) {
    const r = this.records.get(id);
    if (r)
      this.records.set(id, {
        ...r,
        attempts: 0,
        status: "pending",
        lastError: null,
      });
  }
}

const report = (
  id: string,
  occurredAt = "2026-08-31T10:00:00.000Z",
): QueuedReport => ({
  id,
  ownerId: "resident-one",
  occurredAt,
  publicPhotoUri: `file://${id}-public.webp`,
  rawPhotoUri: `file://${id}-raw.jpg`,
  location: { lat: 31.39, lng: -81.26 },
  address: null,
  description: "Dune breach",
  issueType: null,
  tags: [],
  attempts: 0,
  lastError: null,
  status: "pending",
});
const serialize = async (r: QueuedReport): Promise<SyncPayload> => ({
  id: r.id,
  occurredAt: r.occurredAt,
  photosBlurred: ["blurred"],
  photosOriginal: ["raw"],
  phashes: [],
  location: r.location,
  address: r.address,
  description: r.description,
  tags: [],
  issueType: null,
});

describe("native offline synchronization", () => {
  test("persists the original observation timestamp in the wire payload", async () => {
    const store = new MemoryStore();
    await store.put(report("one"));
    const send = async (): Promise<SendResult> => ({ ok: true });
    await flushQueue(
      store,
      async (payload) => {
        expect(payload.occurredAt).toBe("2026-08-31T10:00:00.000Z");
        return send();
      },
      serialize,
    );
  });

  test("sends oldest first and removes only confirmed reports", async () => {
    const store = new MemoryStore();
    await store.put(report("new", "2026-08-31T12:00:00.000Z"));
    await store.put(report("old", "2026-08-31T09:00:00.000Z"));
    const ids: string[] = [];
    await flushQueue(
      store,
      async (payload) => {
        ids.push(payload.id);
        return payload.id === "old"
          ? { ok: true }
          : { ok: false, error: "rejected" };
      },
      serialize,
    );
    expect(ids).toEqual(["old", "new"]);
    expect((await store.list()).map((r) => r.id)).toEqual(["new"]);
  });

  test("stops after an offline failure and retains remaining work", async () => {
    const store = new MemoryStore();
    await store.put(report("one"));
    await store.put(report("two", "2026-08-31T11:00:00.000Z"));
    const result = await flushQueue(
      store,
      async () => ({
        ok: false,
        error: "Network request failed",
        offline: true,
      }),
      serialize,
    );
    expect(result.interrupted).toBe(true);
    expect(await store.list()).toHaveLength(2);
  });

  test("coalesces concurrent drains", async () => {
    const store = new MemoryStore();
    await store.put(report("same-id"));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sendCount = 0;
    const send = async () => {
      sendCount += 1;
      await gate;
      return { ok: true } as const;
    };
    const first = flushQueue(store, send, serialize);
    const second = flushQueue(store, send, serialize);
    release();
    await Promise.all([first, second]);
    expect(sendCount).toBe(1);
  });

  test("a lost response retries the same idempotency key exactly", async () => {
    const store = new MemoryStore();
    await store.put(report("stable-client-uuid"));
    const sent: string[] = [];
    await flushQueue(
      store,
      async (payload) => {
        sent.push(payload.id);
        return { ok: false, error: "connection lost", offline: true };
      },
      serialize,
    );
    await store.retry("stable-client-uuid");
    await flushQueue(
      store,
      async (payload) => {
        sent.push(payload.id);
        return { ok: true };
      },
      serialize,
    );
    expect(sent).toEqual(["stable-client-uuid", "stable-client-uuid"]);
    expect(await store.list()).toEqual([]);
  });

  test("only drains reports owned by the signed-in resident", async () => {
    const store = new MemoryStore();
    await store.put(report("mine"));
    await store.put({ ...report("theirs"), ownerId: "resident-two" });
    const sent: string[] = [];
    await flushQueue(
      store,
      async (payload) => {
        sent.push(payload.id);
        return { ok: true };
      },
      serialize,
      "resident-one",
    );
    expect(sent).toEqual(["mine"]);
    expect((await store.list()).map((item) => item.id)).toEqual(["theirs"]);
  });

  test("auth deferral preserves the report without consuming an attempt", async () => {
    const store = new MemoryStore();
    await store.put(report("auth-expired"));
    const result = await flushQueue(
      store,
      async () => ({
        ok: false,
        error: "Sign in again",
        deferred: true,
      }),
      serialize,
      "resident-one",
    );
    expect(result.interrupted).toBe(true);
    expect((await store.list())[0]).toMatchObject({
      id: "auth-expired",
      attempts: 0,
      lastError: null,
    });
  });

  test("does not automatically send a report at the retry ceiling", async () => {
    const store = new MemoryStore();
    const exhausted = {
      ...report("exhausted"),
      attempts: MAX_AUTO_ATTEMPTS,
      status: "failed" as const,
    };
    await store.put(exhausted);
    const send = jest.fn(async (): Promise<SendResult> => ({ ok: true }));

    const result = await flushQueue(store, send, serialize, "resident-one");

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, failed: 0, interrupted: false });
    expect(await store.list()).toEqual([exhausted]);
  });

  test("records a thrown send error and continues with the next report", async () => {
    const store = new MemoryStore();
    await store.put(report("first"));
    await store.put(report("second", "2026-08-31T11:00:00.000Z"));

    const result = await flushQueue(
      store,
      async (payload) => {
        if (payload.id === "first") throw new Error("temporary server error");
        return { ok: true };
      },
      serialize,
      "resident-one",
    );

    expect(result).toEqual({ delivered: 1, failed: 1, interrupted: false });
    const remaining = await store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      id: "first",
      attempts: 1,
      status: "failed",
      lastError: "temporary server error",
    });
  });

  test("manual retry resets failure state and permits another send", async () => {
    const store = new MemoryStore();
    await store.put({
      ...report("manual"),
      attempts: MAX_AUTO_ATTEMPTS,
      status: "failed",
      lastError: "retry limit reached",
    });

    await store.retry("manual");
    const [reset] = await store.list();
    expect(reset).toMatchObject({
      attempts: 0,
      status: "pending",
      lastError: null,
    });

    const send = jest.fn(async (): Promise<SendResult> => ({ ok: true }));
    await flushQueue(store, send, serialize, "resident-one");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await store.list()).toEqual([]);
  });
});
