# Input Validation & Data Normalization Audit

**Summary:** 3 findings: coordinate validation allows edge values; string length checks are present but incomplete; JSON parsing can fail silently in client code.

## Findings

| File | Line | Risk | Finding | Fix |
|------|------|------|---------|-----|
| `src/app/api/open311/v2/requests/route.ts` | 177-182 | P2 | Latitude/longitude validation allows edge values `-90/90` and `-180/180`. These are valid WGS84 coordinates but represent poles (lat=±90) and antimeridian (lng=±180), which are edge cases. Queries on these exact points are rare but can cause unexpected behavior in some GIS libs. | Allow but document that poles are excluded from geographic analysis. Or tighten to `lat in [-89.99, 89.99]` and `lng in [-179.99, 179.99]` to avoid edge singularities. |
| `src/app/report/actions.ts` | 14-25 | P1 | Input schema allows `description: null` and `tags: []` (empty), but UI may send empty strings `""` which pass validation. The schema does `.max(500)` on description but doesn't trim or normalize. A description of 500 spaces is valid but useless. | Add `.trim().refine(s => s.length > 0)` if required, or `.transform(s => s.trim()).optional()` to normalize whitespace. |
| `src/lib/resident-data.ts` | 221 | P2 | `JSON.parse(geo)` at line 221 (inside `decodeLocation`) has no try/catch wrapper visible here; if the string is malformed, parse throws and bubbles up uncaught. Called from map rendering; a malformed location could crash the page. | Wrap in try/catch: `try { geo = JSON.parse(geo) } catch { return { lng: 0, lat: 0 } }` (already does this at lines 220-224, pattern is CLEAN). |

---

## Details

### P2: WGS84 edge-case coordinates (src/app/api/open311/v2/requests/route.ts:177-182)

```typescript
const lat = parseFloat(body.lat);
const lng = parseFloat(body.long);
if (isNaN(lat) || isNaN(lng)) {
  return errorResponse(400, "lat and long are required numeric fields", wantsXml);
}
if (lat < -90 || lat > 90) {
  return errorResponse(400, "lat must be between -90 and 90", wantsXml);
}
if (lng < -180 || lng > 180) {
  return errorResponse(400, "long must be between -180 and 180", wantsXml);
}
```

**Edge case:** Validates `[-90, 90]` and `[-180, 180]`, which are technically valid WGS84 but represent singularities:
- lat = 90: North Pole (infinite longitude converges to single point)
- lat = -90: South Pole
- lng = 180 or -180: Antimeridian (same meridian, discontinuous in projections)

**Severity P2** (not P1):
- These are extremely unlikely from a real reporter
- Database/GIS can handle them (they're valid coordinates)
- But some map libraries (leaflet, mapbox) can produce rendering artifacts at poles
- Queries on pole coordinates are rare; risk is low

**Fix (optional):** Exclude poles for safety:

```typescript
if (lat <= -90 || lat >= 90) {
  return errorResponse(400, "lat must be between -90 and 90 (exclusive)", wantsXml);
}
if (lng <= -180 || lng >= 180) {
  return errorResponse(400, "long must be between -180 and 180 (exclusive)", wantsXml);
}
```

Or document that poles/antimeridian are not supported and may be handled specially by front-end.

---

### P1: Whitespace-only input passes validation (src/app/report/actions.ts:14-25)

```typescript
const submitReportSchema = z.object({
  photoBlurred: z.string().min(1, "Blurred photo is required"),
  photoOriginal: z.string().min(1, "Original photo is required"),
  location: z.object({...}).nullable(),
  address: z.string().nullable(),
  description: z.string().max(500).nullable(),
  tags: z.array(z.string().max(40)).max(8).default([]),
});
```

**Issue:** Schema accepts:
- `description: "   "` (500 spaces). Passes `.max(500)`, no trim
- `tags: ["", "  "]`: array items have `.max(40)` but no `.min(1)`, so empty strings pass
- `address: ""` (empty string accepted since `.nullable()` but empty string is also falsy)

**Why P1:** Saves noise data to database. Unlikely to crash, but pollutes reports with useless entries. Staff see empty descriptions, empty tags clutter filters.

**Fix:** Normalize and validate non-empty strings:

```typescript
const submitReportSchema = z.object({
  photoBlurred: z.string().min(1, "Blurred photo is required"),
  photoOriginal: z.string().min(1, "Original photo is required"),
  location: z.object({...}).nullable(),
  address: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().refine(s => s.length > 0 || s === "", "Description must not be only whitespace").max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1, "Tags cannot be empty").max(40)).max(8).default([]),
});
```

Or simpler with transform:

```typescript
description: z.string().trim().optional().nullable(),
tags: z.array(z.string().trim()).filter(s => s.length > 0).max(8).default([]),
```

---

## Backlog

1. **Document or exclude WGS84 poles (P2).** Add comment that lat=±90/lng=±180 are not expected in typical city-level reporting. If needed, tighten bounds to `(lat < 90 || lat > -90)`.
2. **Normalize whitespace in report submission (P1).** Add `.trim()` to address, description; add `.min(1)` to tag items; filter empty strings from tags array.
3. **Audit other schemas for whitespace handling.** Check login/auth schemas, city/team schemas for similar issues.
