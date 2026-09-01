# In-Code Debt Markers: Complete Harvest

**Summary:** 3 explicit markers found across src/ and docs/. All shipped + unfinished. Top priority: Open311 API key lookup (blocks external integrations). Secondary: cross-jurisdiction report handling (design debt), fence-stripping fallback (cleanup candidate).

---

## Markers Table

| File:Line | Severity | Effort | Category | Marker Text | Status |
|-----------|----------|--------|----------|-------------|--------|
| `src/app/api/open311/v2/requests/route.ts:228` | P1 | M | incomplete-feature | TODO: Replace with a real api_key → user lookup table. | Shipped |
| `docs/planning/design.md:402` | P1 | L | design-debt | "Manual override for now. Real solution unclear.", Cross-jurisdiction reports (pothole on county road in city limits) | Shipped |
| `docs/planning/PLAN.md:330` | P2 | S | cleanup | "delete fence hack", Structured output migration (Gemini 2.5 Flash responseMimeType + responseSchema) not yet implemented; still using fence-stripping fallback | Shipped |

---

## Details

### P1: Open311 API Key → User Lookup (src/app/api/open311/v2/requests/route.ts:228)

**Context:**
```typescript
// Line 227-236
// Reporter ID. Use system user for external Open311 submissions.
// TODO: Replace with a real api_key → user lookup table.
const reporterId = process.env.OPEN311_SYSTEM_USER_ID;
if (!reporterId) {
  return errorResponse(
    500,
    "Server misconfigured: OPEN311_SYSTEM_USER_ID not set",
    wantsXml
  );
}
```

**What's unfinished:**
Open311 POST endpoint accepts an `api_key` parameter (per Open311 spec) but doesn't resolve it to a reporter identity. All external submissions are attributed to a fixed system user (`OPEN311_SYSTEM_USER_ID` env var). When external systems (city 311 backends, monitoring tools, partner apps) submit reports via Open311, there's no audit trail of which system submitted what.

**Why it matters:**
- **Open311 API contract:** Clients expect per-API-key reporter attribution.
- **Audit trail:** No way to trace which integration submitted a report.
- **Duplicate prevention:** Dedup logic (planned in design.md §20) can't correlate reports from the same external source.

**Fix:**
Add a `api_keys` table (or column on a users/integrations table) that maps `api_key` → `user_id`. In the POST handler:
```typescript
// Look up the user for this API key
const { data: apiKey } = await supabase
  .from("api_keys")
  .select("user_id")
  .eq("key", body.api_key)
  .maybeSingle();

const reporterId = apiKey?.user_id || process.env.OPEN311_SYSTEM_USER_ID;
```

**Effort:** M (1-2 hours: table schema + lookup query + tests)

---

### P1: Cross-Jurisdiction Report Handling (docs/planning/design.md:402)

**Context:**
From design.md, §8 (Unresolved Design Questions):
```
2. **What happens when a report straddles jurisdictions?** A pothole on a county road
   inside city limits. Manual override for now. Real solution unclear.
```

**What's unfinished:**
The app assumes each report belongs to exactly one city. But Forsyth County (the hosting jurisdiction for Cumming, GA) owns infrastructure inside Cumming's boundaries. A pothole on a county road inside city limits cannot be routed programmatically. No parent-child relationship exists between county and city.

**Why it matters:**
- **Resident confusion:** Report goes to the wrong team or doesn't dispatch at all.
- **Audit trail:** No record of *which* jurisdiction owns the infrastructure.
- **Scale risk:** Once expanded beyond Cumming, the problem multiplies (every US city is nested in a county).

**Fix options:**
1. **Parent-child city model:** Add a `parent_city_id` column, allow routing to parent jurisdiction.
2. **Infrastructure ownership layers:** Store infrastructure assets with explicit ownership (city vs. county vs. state), route based on asset ownership, not report location alone.
3. **Escalation rule:** If a report can't route to city, escalate to county via Open311.

**Effort:** L for decision (design meeting); M, L for implementation (depends on chosen approach).

---

### P2: Fence-Stripping Fallback (docs/planning/PLAN.md:330 + src/lib/ai/gemini.ts:25-29)

**Context:**
From PLAN.md, §12 (AI strategy):
```
- **Structured output**: generationConfig.responseMimeType="application/json" + responseSchema
  (per-field description, enum category, required) → guaranteed valid JSON;
  delete fence hack; keep Zod as *semantic* backstop.
```

**What exists:**
```typescript
// src/lib/ai/gemini.ts:18-30
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}
```

**What's unfinished:**
Gemini 2.5 Flash now supports structured output (`responseMimeType="application/json"` + `responseSchema`), which guarantees clean JSON without markdown fences. The code DOES use structured output (line 59-60 of gemini.ts), so the fence-stripping fallback is a belt-and-suspenders safety net.

**Why it's still here:**
The comment in the code says: "with structured output (responseMimeType + responseSchema) the model already returns clean JSON, but we keep this as a belt-and-suspenders parse in case a response slips through fenced."

**Why it matters (for cleanup):**
- Dead code risk if structured output ever becomes 100% reliable.
- Test coverage for fence-stripping adds maintenance burden.

**Fix:**
Once structured output has 30+ days of zero fence-wrapped responses in production (track via metrics), delete:
- `stripCodeFences()` function
- The test case `"parses fenced ```json output via the stripCodeFences fallback"` (src/lib/ai/gemini.test.ts:85-99)
- The comment about fallback parsing (gemini.ts:21-23)

**Effort:** S (1-2 files, ~30 lines, quick PR once confidence is high).

---

## Backlog (Prioritized)

### Immediate (Before next release)
1. **Implement Open311 API key → user lookup** (P1, M effort)
   - Blocks external integrations and audit trail.
   - Touches only `src/app/api/open311/v2/requests/route.ts` and schema.
   - 2-3 hour task.

### Short-term (Roadmap Phase A)
2. **Resolve cross-jurisdiction report routing** (P1, L, M effort)
   - Design decision first (1 hour): choose parent-child vs. asset ownership vs. escalation.
   - Implement once city/county relationship is clarified (2-4 hours).

### Nice-to-have (Cleanup)
3. **Remove fence-stripping fallback** (P2, S effort)
   - Only after 30+ days of zero fence-wrapped responses in production.
   - Cleanup only, no functional change.

---

## Search Methodology

- **Grep patterns:** TODO, FIXME, HACK, XXX, @todo, "temporary", "for now", "placeholder", "stub", "mock" (in comments), "hardcoded" (in context), "remove this", "revisit", "urgent", "WIP", "BROKEN", "BUG", "KNOWN", "disabled", "fire-and-forget"
- **Scope:** `src/` and `docs/` entire trees
- **Context:** Read surrounding code for each hit to classify effort/priority/impact
- **False positives filtered:** Test mocks, placeholder attributes in UI (e.g., `placeholder="Enter address"`), harmless uses of "known" (KNOWN_CITIES), "disabled" in HTML, "cleanup" in domain language (crew_type: "cleanup")

---

## Verification Checklist

- No implicit incomplete patterns found (migrations are guarded, feature flags are intentional).
- Fire-and-forget classify pipeline is correctly implemented (uses `next/server`'s `after()` for Vercel serverless safety).
- All 3 markers are in shipped code (ASYNC_CLASSIFY, cross-jurisdiction, Open311 lookup).
- No NEXT_PUBLIC_* feature flags hiding incomplete features.
