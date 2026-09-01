# Concurrency & State Safety Audit

**Summary:** 2 findings affecting cache efficiency and realtime safety. Non-critical but notable: module-level cache isn't atomic (concurrent requests both call Gemini); realtime subscription has unhandled promise in one-shot fallback query (cross-ref EH-X).

## Findings

| File | Line | Risk | Finding | Fix |
|------|------|------|---------|-----|
| `src/lib/ai/reasoning-ai.ts` | 177-230 | P2 | Module-level cache is not atomic. Two concurrent requests for the same report ID both call `geminiReasoning()`, wasting a Gemini API call. Cache hit/miss is checked without locking; between check and set, another request can also miss. Typical: T1 miss → T2 miss → T1 set → T2 set (overwrites T1, both computed). | Use `Promise` memoization or request deduplication: cache the Promise itself, not the result. Return same promise for concurrent identical requests. |
| `src/app/report/page.tsx` | 313-333 | P2 | Realtime subscription's `subscribe()` callback fires one-shot query with unhandled `.then()` (already found in EH-X). Additionally, if subscription is unsubscribed/resubscribed (e.g., user navigates away then back), callback fires again, re-running the fetch. No guard prevents duplicate fires on re-subscribe. | Add flag to ensure one-shot fetch fires only once per component mount: `let fetched = false; ... if (!fetched) { fetched = true; ... query.then(...) }`. |

---

## Details

### P2: Non-atomic cache in reasoning-ai.ts (src/lib/ai/reasoning-ai.ts:177-230)

```typescript
const cache = new Map<string, ReasoningPayload>();

function cacheGet(id: string): ReasoningPayload | undefined {
  const hit = cache.get(id);
  if (hit === undefined) return undefined;
  cache.delete(id);
  cache.set(id, hit);
  return hit;
}

function cacheSet(id: string, payload: ReasoningPayload): void {
  cache.delete(id);
  cache.set(id, payload);
  // LRU eviction...
}

export async function getReasoning(input, ...): Promise<...> {
  const cached = cacheGet(input.id);
  if (cached !== undefined) return { payload: cached, source: "cache" };
  
  try {
    const payload = await geminiReasoning(input, ...);  // <- CONCURRENT CALL
    cacheSet(input.id, payload);
    return { payload, source: "gemini" };
  } catch {
    return { payload: templateFallback(), source: "template" };
  }
}
```

**Race condition:**
```
T1: cacheGet("report-123") → undefined (cache miss)
T2: cacheGet("report-123") → undefined (cache miss)
T1: await geminiReasoning() [starts Gemini API call #1]
T2: await geminiReasoning() [starts Gemini API call #2] ← Duplicate, wasteful
T1: cacheSet("report-123", result1)
T2: cacheSet("report-123", result2) [overwrites T1's result]
```

**Why P2:** Both Gemini calls compute the same reasoning (identical input), so the second call is pure waste. Cost: $0.08 per duplicate (at current pricing). Correctness: unaffected (both results are deterministic and identical). UX: fine (user sees correct result either way).

**Fix:** Memoize the Promise itself, not the result:

```typescript
// At module level, alongside the result cache
const pendingPromises = new Map<string, Promise<ReasoningPayload>>();

export async function getReasoning(
  input: ReasoningInput,
  ...
): Promise<{ payload: ReasoningPayload; source: "cache" | "gemini" | "template" }> {
  // Check result cache (already computed and cached)
  const cached = cacheGet(input.id);
  if (cached !== undefined) {
    return { payload: cached, source: "cache" };
  }

  // Check if already in flight for this ID
  if (pendingPromises.has(input.id)) {
    const pending = pendingPromises.get(input.id)!;
    return pending.then((payload) => ({
      payload,
      source: "gemini",
    }));
  }

  // Deduplicate: cache the Promise itself while in flight
  const promise = geminiReasoning(input, slaHours, categoryLabel)
    .then((payload) => {
      cacheSet(input.id, payload);
      pendingPromises.delete(input.id); // Clean up after success
      return payload;
    })
    .catch((err) => {
      pendingPromises.delete(input.id); // Clean up after failure
      throw err;
    });

  pendingPromises.set(input.id, promise);

  try {
    const payload = await promise;
    return { payload, source: "gemini" };
  } catch {
    return { payload: templateFallback(), source: "template" };
  }
}
```

Now concurrent requests for the same ID share the in-flight Promise and return the same Gemini result.

---

### P2: Re-subscribable realtime without one-shot guard (src/app/report/page.tsx:313-333)

```typescript
const channel = supabase
  .channel(`classify_${pendingReportId}`)
  .on("postgres_changes", { ... }, payload => applyRow(payload.new))
  .subscribe(() => {
    // One-shot fetch to catch INSERTs that landed before subscription
    supabase
      .from("classifications")
      .select(...)
      .eq("report_id", pendingReportId)
      .maybeSingle()
      .then(({ data }) => applyRow(data)) // ← Unhandled error (EH-X)
  });

return () => {
  supabase.removeChannel(channel);
};
```

**Issue:** If the component unmounts and remounts (user navigates away then back to the report), the channel is removed and re-created, calling subscribe() again. The one-shot fetch fires twice, calling applyRow() multiple times for the same data.

Not a bug (applyRow idempotent?), but inefficient. If applyRow has side effects or state mutations, could cause subtle issues.

**Fix:** Ensure one-shot fires exactly once:

```typescript
let fetched = false;

const channel = supabase
  .channel(`classify_${pendingReportId}`)
  .on("postgres_changes", { ... }, payload => applyRow(payload.new))
  .subscribe(() => {
    if (fetched) return; // Guard: only fire once
    fetched = true;

    supabase
      .from("classifications")
      .select(...)
      .eq("report_id", pendingReportId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[report] classifications fetch failed:", error);
          return;
        }
        applyRow(data);
      })
      .catch((err) => {
        console.error("[report] realtime subscription fetch threw:", err);
      });
  });

return () => {
  fetched = false; // Reset on cleanup so next mount re-fetches
  supabase.removeChannel(channel);
};
```

---

## Backlog

1. **Deduplicate Gemini calls with Promise memoization (P2).** Implement pendingPromises Map to avoid concurrent calls for identical inputs.
2. **Guard realtime one-shot fetch (P2).** Add `fetched` flag to ensure subscribe() callback query fires only once per component lifecycle.
3. **Audit other module-level state (P2).** Check demo-reports, custom-categories, teams-overrides for similar non-atomic caches.
