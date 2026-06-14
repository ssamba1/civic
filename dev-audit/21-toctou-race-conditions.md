# Time-of-Check Time-of-Use (TOCTOU) & Race Conditions

**Summary:** 2 findings in critical state transitions: authorization checks can become stale between RLS scope check and DB write; concurrent status updates can leave work order and report in inconsistent states.

## Findings

| File | Line | Risk | Finding | Fix |
|------|------|------|---------|-----|
| `src/app/api/ai/classify/route.ts` | 63–75 | P2 | Authorization check (RLS scope verify) happens before DB write, but another request can delete the report between check and write. Check returns `ownedReport`, but by the time `runClassifyPipeline()` executes, the report might be deleted (204 No Content response from Supabase query, or RLS rejects the nested classifications insert). Result: classify job silently fails or crashes with "report_not_found". | Rely on RLS for all DB ops; remove explicit check if RLS is already scoped. OR wrap pipeline in try/catch and handle "report_not_found" with proper error logging. Current code does the latter, pattern is SAFE but could be clearer. |
| `src/app/staff/actions.ts` | 66–80, 100–113 | P2 | `dispatchWorkOrder()` and `dispatchWorkOrderForReport()` update work_orders, then update reports. Between the two updates, another staff member could update the same work order, causing race condition: two concurrent dispatches both succeed at work_orders level, but only one updates reports status. Work order has two dispatch records (if audit table exists); report status may be stale. | Use a single atomic update: update work_orders + update reports in one transaction via database trigger, OR read work_orders result back in same query (current code does `.select()` on update for this reason, PATTERN IS CLEAN). |

---

## Details

### P2: Stale authorization check in classify route (src/app/api/ai/classify/route.ts:63–75)

```typescript
if (!isInternal) {
  const ssr = await createSSRClient();
  const { data: ownedReport, error: ownErr } = await ssr
    .from("reports")
    .select("id")
    .eq("id", reportId)
    .maybeSingle();
  if (ownErr || !ownedReport) {
    return NextResponse.json(
      { error: "Report not found" },
      { status: 404 },
    );
  }
}

const result = await runClassifyPipeline(reportId); // ← Report might be deleted here
```

**Race condition (low probability):**
1. User A calls classify route; auth check passes, ownedReport exists
2. User B (staff) deletes the report
3. User A's pipeline tries to query the report → RLS filters it out or returns empty
4. Pipeline returns ok:false with "Report not found"
5. User A sees 500 (classify route casts to 404, pattern is SAFE)

**Why P2 (not P1):** 
- Deletion race is rare (requires concurrent delete + classify in <100ms)
- Pipeline already handles "report_not_found" gracefully
- RLS is the actual authorization; the upfront check is redundant

**Current pattern is SAFE** because:
1. RLS scopes all queries to auth.uid() or staff city
2. Pipeline checks "report_not_found" and returns ok:false
3. Route converts ok:false to 404

No fix needed unless you want to remove the redundant check:

```typescript
// Simplify: let RLS be the only gate
// Remove the upfront select(). RLS on runClassifyPipeline's queries will reject if report not found.
const result = await runClassifyPipeline(reportId);
if (!result.ok) {
  const status = result.error.includes("not found") ? 404 : 500;
  return NextResponse.json({ error: result.error }, { status });
}
```

---

### P2: Non-atomic dispatch updates (src/app/staff/actions.ts:66–80)

```typescript
export async function dispatchWorkOrder(
  workOrderId: string,
  crewId?: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized" };

  const supabase = createServerClient();

  const update: Record<string, unknown> = {
    dispatched_at: new Date().toISOString(),
    assigned_crew_id: crewId ?? null,
  };

  // Update and read back report_id in one round-trip
  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .update(update)
    .eq("id", workOrderId)
    .select("report_id")
    .single();

  if (woError) return { ok: false, error: "work_order_not_found" };

  // M9 fix: check error on report status update
  const { error: reportError } = await supabase
    .from("reports")
    .update({ status: "dispatched", updated_at: new Date().toISOString() })
    .eq("id", wo.report_id);
  if (reportError) return { ok: false, error: "status_update_failed" };

  // Notify out-of-band
  after(() => notifyReportStatus(wo.report_id, "dispatched"));

  return { ok: true, data: undefined };
}
```

**Race condition (low probability):**
1. Staff A calls dispatchWorkOrder(wo-123)
2. Staff B calls dispatchWorkOrder(wo-123) simultaneously
3. Both read work_orders → both get wo-123 and report_id-456
4. Staff A updates work_orders set dispatched_at=T1 → success
5. Staff B updates work_orders set dispatched_at=T2 → success (overwrites A's timestamp)
6. Both update reports set status='dispatched' → both succeed, idempotent
7. Result: work_order has dispatched_at=T2 (later timestamp wins); report is correct

**Why P2 (not P1):**
- Both updates succeed; data is eventually consistent
- Report status ends up correct
- Work order timestamp is slightly off (T2 instead of T1) — not critical
- No data loss or corruption

**Current pattern is mostly SAFE** because:
1. Supabase's `.update().eq()` is atomic per row
2. RLS and timestamps are on the same rows
3. Report status is idempotent (both staff trying to set "dispatched" is harmless)

**Fix (optional):** Use a database trigger to keep work_orders + reports in sync atomically:

```sql
CREATE TRIGGER dispatch_work_order_sync
AFTER UPDATE ON work_orders FOR EACH ROW
WHEN (NEW.dispatched_at IS NOT NULL AND OLD.dispatched_at IS NULL)
BEGIN
  UPDATE reports SET status = 'dispatched', updated_at = NOW()
  WHERE id = NEW.report_id;
END;
```

Then simplify the action:

```typescript
const { error: woError } = await supabase
  .from("work_orders")
  .update(update)
  .eq("id", workOrderId);

if (woError) return { ok: false, error: "work_order_not_found" };

// Report is now updated by trigger; no second query needed
return { ok: true, data: undefined };
```

---

## Backlog

1. **Simplify classify auth (P2, optional).** Remove redundant upfront select() check; rely on RLS for all authorization.
2. **Document dispatch race (P2, optional).** Add comment explaining that concurrent dispatches are idempotent at the report level.
3. **Consider DB trigger for dispatch (P2, future).** If dispatch becomes a hot path or audit log is added, use trigger to ensure atomic work_orders + reports sync.
