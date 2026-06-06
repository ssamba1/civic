// @vitest-environment node
import { defaultIsRetryable, withRetry } from "./retry";

/**
 * Build an error that looks like an AbortError (name === "AbortError"),
 * which `defaultIsRetryable` treats as retryable.
 */
function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

describe("withRetry", () => {
  it("succeeds on the first try without retrying", async () => {
    const fn = vi.fn(async () => "ok");

    const result = await withRetry(fn, { isRetryable: () => true, baseMs: 1 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable error then succeeds", async () => {
    const fn = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, {
      retries: 2,
      baseMs: 1,
      isRetryable: () => true,
    });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-retryable error", async () => {
    const boom = new Error("fatal");
    const fn = vi.fn(async () => {
      throw boom;
    });

    await expect(
      withRetry(fn, { retries: 2, baseMs: 1, isRetryable: () => false }),
    ).rejects.toBe(boom);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows the last error after exhausting all retries", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always fails");
    });

    await expect(
      withRetry(fn, { retries: 2, baseMs: 1, isRetryable: () => true }),
    ).rejects.toThrow("always fails");

    // 1 initial attempt + 2 retries === 3 calls.
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("aborts the attempt when the per-attempt timeout fires", async () => {
    // withRetry does not race the timeout itself; the abort only matters if
    // `fn` observes the signal. This fn rejects with an AbortError once aborted
    // and otherwise never resolves.
    const fn = vi.fn(
      (signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(abortError()));
        }),
    );

    // retries: 0 so the first abort throws immediately (AbortError is
    // retryable by default, so without this it would retry on the tiny timeout).
    await expect(
      withRetry(fn, { timeoutMs: 5, retries: 0, baseMs: 1 }),
    ).rejects.toThrow(/abort/i);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes a fresh AbortSignal to each attempt", async () => {
    const signals: AbortSignal[] = [];
    const fn = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(async (signal: AbortSignal) => {
        signals.push(signal);
        throw new Error("retry me");
      })
      .mockImplementationOnce(async (signal: AbortSignal) => {
        signals.push(signal);
        return "done";
      });

    const result = await withRetry(fn, {
      retries: 2,
      baseMs: 1,
      isRetryable: () => true,
    });

    expect(result).toBe("done");
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBeInstanceOf(AbortSignal);
    expect(signals[0]).not.toBe(signals[1]);
    // No timeoutMs supplied, so neither signal should be aborted.
    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(false);
  });
});

describe("defaultIsRetryable", () => {
  it("treats AbortError as retryable", () => {
    expect(defaultIsRetryable(abortError())).toBe(true);
  });

  it("treats retryable HTTP statuses as retryable", () => {
    expect(defaultIsRetryable({ status: 429 })).toBe(true);
    expect(defaultIsRetryable({ response: { status: 503 } })).toBe(true);
  });

  it("treats transient message signals as retryable", () => {
    expect(defaultIsRetryable(new Error("model is overloaded"))).toBe(true);
    expect(defaultIsRetryable(new Error("rate limit exceeded"))).toBe(true);
  });

  it("treats an unrelated error as non-retryable", () => {
    expect(
      defaultIsRetryable(new Error("bad request: validation failed")),
    ).toBe(false);
    expect(defaultIsRetryable({ status: 400 })).toBe(false);
  });
});
