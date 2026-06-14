# Magic Values Audit

**Summary:** 38 total findings across 18 files. Critical issues: 5 values duplicated 2+ files (city coords, slug, bucket names, fallback severity—drift risk); priority score weights unextracted; status colors hardcoded as bare RGB tuples; time constants scattered 8+ files. Single most important: consolidate city config (Cumming coords/slug appear 4+ times).

---

## Findings by Severity

| ID | File:Line | Severity | Problem | Fix |
|---|---|---|---|---|
| M1 | `src/app/report/actions.ts:57` | P1 | Demo city center hardcoded (lat 34.2073, lng -84.1402); appears 4+ files — drift risk | Extract `DEMO_CITY_CENTER` to `src/lib/config/locations.ts` |
| M2 | `src/app/staff/map/page.tsx:9` | P1 | City slug "cumming" hardcoded; same value 3+ files | Extract `DEFAULT_CITY_SLUG = "cumming"` to `src/lib/config/locations.ts` |
| M3 | `src/app/report/actions.ts:29-30` | P1 | Bucket names `"photos-public"`, `"photos-raw"` hardcoded in 2+ files | Extract to `src/lib/config/storage.ts` |
| M4 | `src/lib/ai/work-order-rules.ts:155-159` | P1 | Priority weights × 2, × 1.5, × 3, × 50 unextracted; business logic as magic multipliers | Extract `PRIORITY_COEFFICIENTS` object to `src/lib/ai/config.ts` |
| M5 | `src/lib/ai/classify-pipeline.ts:143-148` + 2 more | P1 | Fallback classification (severity=3, radius=0, visibility="unknown") in 3 locations | Centralize to `createFallbackClassification(reason: string)` function |
| M6 | `src/components/map/report-map.tsx:95-99` | P1 | Status colors as bare RGB tuples [48,209,88], [10,132,255], etc. — no semantic names | Extract `STATUS_COLORS: Record<Status, RGB>` to config module |
| M7 | `src/components/map/report-map.tsx:98` | P1 | Severity threshold `>= 4` hardcoded for high-severity color logic | Extract `SEVERITY_HIGH_THRESHOLD = 4` to threshold config |
| M8 | `src/app/api/open311/v2/requests/route.ts:29, 54` | P1 | Rate limit max 60, pagination 200/100 hardcoded; no constants | Extract `OPEN311_RATE_LIMIT_MAX=60`, pagination bounds to config |
| M9 | `src/components/landing/shader-hero.tsx:36-46, 91-92` | P1 | Shader: 13 magic numbers (wave freq 10.0, amp 0.02, noise params, fade 0.28/0.78); 4 RGB tuples | Extract shader params to const object; move colors to theme |
| M10 | `src/components/map/report-map.tsx:72-85` | P1 | Map config: tileSize=128, maxzoom=19, fade-duration=100 unextracted | Extract `MAP_CONFIG` object to `src/lib/config/map.ts` |
| M11 | `src/app/city/[slug]/map/page.tsx:23-24` | P1 | Map center [-84.14, 34.21] + zoom 12 duplicated; precision mismatch with KNOWN_CITIES | Use KNOWN_CITIES lookup only; remove fallback override |
| M12 | `src/lib/filters/derive.ts:6` | P0 | DAY_MS=86_400_000 duplicated across 8+ files (rate-limiter, retention, analytics) | Consolidate to `src/lib/time-constants.ts`; export TIME_MS object |
| M13 | `src/lib/ai/rate-limiter.ts:57-59` | P1 | Gemini rate defaults 40/300/1500 hardcoded in function body; no comment | Extract to named consts in config; document why |
| M14 | `src/lib/privacy/blur.ts:59` | P1 | `maxDetectedFaces: 20` unextracted; hardcoded in API call | Extract `MAX_DETECTED_FACES = 20` to privacy config |
| M15 | `src/lib/privacy/blur.ts:78` | P1 | Fallback blur: divide height by 3 (thirds); brittle logic | Extract `BLUR_REGION_THIRDS = 3` constant with rationale comment |
| M16 | `src/lib/task-completion.ts:25` | P2 | Storage key `"civic.task_completion.v1"` hardcoded; no versioning strategy | Extract to `STORAGE_KEYS` object in config |
| M17 | `src/lib/demo-reports.ts:28` | P2 | Storage key `"civic.demo_reports.v1"` hardcoded; version bump requires code change | Extract to `STORAGE_KEYS` object in config |
| M18 | `src/lib/demo-reports.ts:46` | P2 | Demo tree offset (0.006 lng, 0.004 lat) magic deltas | Extract `DEMO_MARKER_OFFSET` to config |
| M19 | `src/components/report/photo-preview.tsx:28` | P2 | Preset tags ["School zone", "Blocking road", ...] hardcoded; no way to update without code | Extract to `PRESET_TAGS` config const |
| M20 | `src/app/report/page.tsx:18` | P2 | Blob→Base64 chunk size 0x8000 unextracted | Extract `BLOB_CHUNK_SIZE = 0x8000` to encoding config |
| M21 | `src/components/resident/upvote-button.tsx:22, 52` | P2 | Default severity 3, strokeWidth 2.25 hardcoded | Extract upvote defaults to component or theme |
| M22 | `src/app/staff/stats/page.tsx:21` | P2 | "Cumming, GA" hardcoded in page title; couples UI to demo city | Use city from props/db; format as `{city.name}, {city.state}` |
| M23 | `src/lib/dashboard-data.ts:309` | P2 | Seeded RNG params (127.1, 311.7, 43758.5453) hardcoded; also in analytics-data, resident-data | Consolidate 3 copies to single `src/lib/seeded-random.ts` |
| M24 | `src/lib/dashboard-data.ts:389-412` | P2 | Demo corpus: N=1100, span=180d, recency=1.6, pool=40; 8 magic numbers | Extract to `DEMO_CORPUS_CONFIG` object |
| M25 | `src/lib/ai/config.ts:24` | P2 | AI_RATE_LIMIT windowMs=60000, max=20 has magic milliseconds | Extract milliseconds to TIME_MS constant reference |
| M26 | `src/lib/privacy/blur.ts:29, 38-40` | ✓ | BLUR_RADIUS=24, MAX_OUTPUT_EDGE=1280, quality=0.8 already named | No action needed |
| M27 | `src/lib/privacy/retention.ts:13, 16` | ✓ | RAW_PHOTO_TTL_DAYS=30, RETENTION_CRON_SCHEDULE="0 3 *" already named | No action needed |
| M28 | `src/app/report/page.tsx:42` | ✓ | CLASSIFY_PENDING_TIMEOUT_MS=20000 already named | Reference in other files if using same timeout |

---

## Details: High-Priority Issues (P0/P1)

### P0: Time Constants Duplication Across 8+ Files

`DAY_MS=86_400_000` appears in:
- `src/lib/filters/derive.ts:6` (named, but duplicated below)
- `src/lib/filter-reports.ts:6` (same, `DAY_MS = 86_400_000`)
- `src/lib/ai/rate-limiter.ts:27-29` (hardcoded as `86_400_000`)
- `src/lib/dashboard-data.ts:392` (inline `86400000`)
- `src/lib/analytics-data.ts:107` (inline)
- `src/lib/resident-data.ts:90-91` (inline)
- Plus inline usages in components

**Why critical:** Every file that needs DAY_MS must know the exact value. Change risk is massive — if deployment copies an old value, drift happens silently. Unit is implicit (ms vs s guessed from context).

**Fix:**
```typescript
// src/lib/time-constants.ts (NEW)
export const TIME_MS = {
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
} as const;

// All files: import { TIME_MS } from "@/lib/time-constants"
// Then use TIME_MS.DAY instead of 86_400_000
```

---

### P1: City Config Spread Across 4+ Files (Drift Risk)

Cumming, GA center appears in:
- `src/app/report/actions.ts:57` → `{ lat: 34.2073, lng: -84.1402 }`
- `src/app/staff/map/page.tsx:19-20` → `[-84.14, 34.21]` (4 decimals, precision mismatch!)
- `src/app/city/[slug]/map/page.tsx:23` → `[-84.14, 34.21]`
- `src/lib/dashboard-data.ts:59-64` → `KNOWN_CITIES.cumming.center: [-84.1402, 34.2073]` (correct source)
- `src/lib/demo-reports.ts:46` → `C[0] + 0.006, C[1] + 0.004` (offset from center)

**Why critical:** Multiple coordinate representations. If default city changes to e.g. Atlanta, 4+ edits needed, one will be forgotten. Also precision variation (4 vs 5 decimals) suggests historical drift.

**Fix:**
```typescript
// src/lib/config/locations.ts (NEW)
export const DEMO_CITY = {
  slug: "cumming",
  center: { lng: -84.1402, lat: 34.2073 },
  state: "GA",
} as const;

export const DEMO_MARKER_OFFSET = { lng: 0.006, lat: 0.004 };

// src/app/report/actions.ts:57
const coord = location ?? DEMO_CITY.center;
.eq("slug", DEMO_CITY.slug)

// src/lib/demo-reports.ts:46
location: { 
  lng: C[0] + DEMO_MARKER_OFFSET.lng, 
  lat: C[1] + DEMO_MARKER_OFFSET.lat 
}
```

---

### P1: Storage Buckets Duplicated

`PUBLIC_BUCKET="photos-public"` and `RAW_BUCKET="photos-raw"` appear in:
- `src/app/report/actions.ts:29-30` (named const, good)
- `src/lib/ai/classify-pipeline.ts:93` (hardcoded string `"photos-raw"`)
- Comments in `src/lib/privacy/retention.ts:4, 51` (string literal)

**Fix:**
```typescript
// src/lib/config/storage.ts
export const STORAGE_BUCKETS = {
  photosPublic: "photos-public",
  photosRaw: "photos-raw",
} as const;
```

---

### P1: Priority Score Weights Unextracted

`src/lib/ai/work-order-rules.ts:155-159`:
```typescript
priority_score =
  classification.severity * 2 +           // ← magic 2
  meta.footTrafficWeight * 1.5 +          // ← magic 1.5
  schoolZoneBonus * 3 +                   // ← magic 3
  meta.recurrenceCount * 1 +              // ← magic 1 (explicit but magic)
  emergencyOverride * 50;                 // ← magic 50
```

**Why critical:** Formula is business policy. Testing tuning requires grep + hex edit. Audit trail lost. No comment explaining why these values.

**Fix:**
```typescript
export const PRIORITY_WEIGHTS = {
  severity: 2,        // Baseline hazard assessment
  footTraffic: 1.5,   // Public exposure adjustment
  schoolZone: 3,      // Legal/liability multiplier
  recurrence: 1,      // Trend signal (1:1 count)
  emergency: 50,      // Override all other signals
} as const;

const priority_score =
  classification.severity * PRIORITY_WEIGHTS.severity +
  meta.footTrafficWeight * PRIORITY_WEIGHTS.footTraffic +
  schoolZoneBonus * PRIORITY_WEIGHTS.schoolZone +
  meta.recurrenceCount * PRIORITY_WEIGHTS.recurrence +
  emergencyOverride * PRIORITY_WEIGHTS.emergency;
```

---

### P1: Status Colors as Bare RGB Arrays

`src/components/map/report-map.tsx:95-99`:
```typescript
function statusColor(status: ReportStatus, severity: number): [number, number, number] {
  if (status === "closed") return [48, 209, 88];     // What color is this?
  if (status === "dispatched") return [10, 132, 255]; // Blue?
  if (status === "in_progress") return [90, 200, 250]; // Light blue?
  if (severity >= 4) return [255, 69, 58];            // Red
  return [255, 159, 10];                              // Orange
}
```

**Why critical:** Colors not connected to design system. Hex equivalents unknown (is [10,132,255] = #0a84ff Civic accent?). Hard to theme or audit contrast for WCAG.

**Fix:**
```typescript
// src/lib/config/colors.ts
export const STATUS_COLORS = {
  closed: { rgb: [48, 209, 88] as [R,G,B], hex: "#30d158", name: "Green" },
  dispatched: { rgb: [10, 132, 255] as [R,G,B], hex: "#0a84ff", name: "Civic Blue" },
  in_progress: { rgb: [90, 200, 250] as [R,G,B], hex: "#5ac8fa", name: "Light Blue" },
  open: { rgb: [255, 159, 10] as [R,G,B], hex: "#ff9f0a", name: "Orange" },
  high_severity: { rgb: [255, 69, 58] as [R,G,B], hex: "#ff453a", name: "Red" },
} as const;

// report-map.tsx
function statusColor(status: ReportStatus, severity: number): [number, number, number] {
  if (severity >= SEVERITY_HIGH_THRESHOLD && status === "open") {
    return STATUS_COLORS.high_severity.rgb;
  }
  return STATUS_COLORS[status].rgb;
}
```

---

### P1: Shader Parameters Scattered Across Uniforms

`src/components/landing/shader-hero.tsx:36-46, 91-92`: 13 magic numbers in GLSL (wave freqs, noise params, fade) + 2 RGB color uniforms hardcoded in JS.

```glsl
uv.y += sin(uv.x * 10.0 + time) * 0.02 * intensity;  // freq=10, amp=0.02
uv.x += cos(uv.y * 8.0 + time * 1.5) * 0.012 * intensity; // freq=8, scale=1.5, amp=0.012
float noise = sin(uv.x * 41.0 + time) * cos(uv.y * 31.0 + time * 0.8);  // 41, 31, 0.8
float alpha = 1.0 - smoothstep(0.28, 0.78, d);  // fade threshold 0.28→0.78
gl_uniform3f(uColor1, 0.039, 0.518, 1.0); // RGB for #0a84ff (Civic accent)
```

**Why critical:** Tuning is by trial, constants are unsemantic. If designer wants to tweak wave frequency or fade sharper, no constant name to guide the edit.

**Fix:**
```typescript
// src/lib/config/shader.ts
export const SHADER_HERO = {
  wave: {
    frequencyX: 10.0,
    amplitudeX: 0.02,
    frequencyY: 8.0,
    amplitudeY: 0.012,
    timeScaleY: 1.5,
  },
  noise: {
    frequency1: 41.0,   // Coarse detail
    frequency2: 31.0,
    timeDamping1: 0.8,
    frequency3: 70.0,   // Fine detail
    timeScale3: 2.0,
    amplitudeScale3: 1.2,
    mixRatio: 0.5,
  },
  fade: { near: 0.28, far: 0.78 },
  colors: {
    primary: { r: 0.039, g: 0.518, b: 1.0 },  // #0a84ff Civic accent
    secondary: { r: 0.6, g: 0.78, b: 1.0 },   // Sky blue
  },
} as const;

// shader-hero.tsx
gl.uniform3f(uColor1, SHADER_HERO.colors.primary.r, SHADER_HERO.colors.primary.g, SHADER_HERO.colors.primary.b);
```

---

## Root Causes & Recommendations

### 1. **Time Constants Duplication** (CRITICAL)
- `DAY_MS = 86_400_000`, `HOUR_MS = 3_600_000`, `MINUTE_MS = 60_000` duplicated across:
  - src/lib/filters/derive.ts:19-20
  - src/lib/dashboard-data.ts:392
  - src/lib/analytics-data.ts:107
  - src/lib/resident-data.ts:90-91
  - src/lib/filter-reports.ts:6
  - src/lib/delegation-history.ts:17-18
  - src/lib/ai/rate-limiter.ts:27-29
  - Plus inline usages in components (60_000, 3_600_000, 86_400_000)

**Fix:** Create `src/lib/time-constants.ts`:
```typescript
export const TIME_MS = {
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
} as const;
```
Replace all duplicates with named imports.

### 2. **Seeded Random PRNG Constants** (HIGH)
- Magic numbers `127.1`, `311.7`, `43758.5453` appear 3 times in:
  - src/lib/dashboard-data.ts:309
  - src/lib/analytics-data.ts:75
  - src/lib/resident-data.ts:100

**Fix:** Extract to `src/lib/seeded-random.ts`:
```typescript
const SEEDED_RNG_PARAMS = { a: 127.1, b: 311.7, c: 43758.5453 } as const;
export function seeded(i: number, salt: number): number {
  const x = Math.sin(i * SEEDED_RNG_PARAMS.a + salt * SEEDED_RNG_PARAMS.b) * SEEDED_RNG_PARAMS.c;
  return x - Math.floor(x);
}
```

### 3. **Hardcoded UI Colors** (MEDIUM)
- Hex values scattered across:
  - src/app/user/my-reports/[reportId]/page.tsx (status colors)
  - src/app/city/[slug]/analytics/error.tsx (button)
  - src/app/layout.tsx (theme colors)
  - src/components/analytics/analytics-bento.tsx (chart accents)
  - src/app/page.tsx (landing page CSS vars)

**Fix:** Consolidate to `src/lib/design-system/colors.ts` and reference from Tailwind config.

### 4. **Priority Scoring & Formula Coefficients** (MEDIUM)
- Work order priority: `severity * 2 + footTraffic * 1.5 + schoolZone * 3 + recurrence * 1 + emergency * 50`
- Hardcoded in src/lib/ai/work-order-rules.ts:122-127

**Fix:** Extract to const:
```typescript
export const PRIORITY_COEFFICIENTS = {
  severity: 2,
  footTraffic: 1.5,
  schoolZone: 3,
  recurrence: 1,
  emergency: 50,
} as const;
```

### 5. **Demo Data Generation Parameters** (MEDIUM)
- src/lib/dashboard-data.ts:389-396: N=1100, SPAN_DAYS=180, RECENCY=1.6, lngSpread=0.048, latSpread=0.048
- src/lib/dashboard-data.ts:412: reporterPool=40, houseNum range 100-900

**Fix:** Group in config object:
```typescript
export const DEMO_CORPUS_CONFIG = {
  reportCount: 1100,
  spanDays: 180,
  recencyPower: 1.6,
  lngSpread: 0.048,
  latSpread: 0.048,
  reporterPool: 40,
  houseNumMin: 100,
  houseNumMax: 1000,
} as const;
```

### 6. **Face Detection & Image Processing** (MEDIUM)
- Face detector: `maxDetectedFaces: 20, fastMode: true` in src/lib/privacy/blur.ts:59
- Detection padding: `* 0.1` in src/lib/privacy/blur.ts:107
- Image quality: `0.8` (blur), `0.7` (after-photo) scattered across src/lib/privacy/blur.ts and src/lib/utils/downscale-image.ts

**Fix:** Create `src/lib/privacy/image-config.ts`:
```typescript
export const IMAGE_PROCESSING = {
  maxDetectedFaces: 20,
  fastMode: true,
  detectionPadRatio: 0.1,
  maxEdge: 1280,
  blurredQuality: 0.8,
  originalQuality: 0.8,
  afterPhotoQuality: 0.7,
} as const;
```

### 7. **Rate Limiting** (LOW)
- AI rate limit: `windowMs: 60000, max: 20` in src/lib/ai/config.ts:24
- API rate limit: `windowMs: 60_000` in src/app/api/open311/v2/

**Fix:** Move to env with fallbacks:
```typescript
export const AI_RATE_LIMIT = {
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS ?? "60000"),
  max: parseInt(process.env.AI_RATE_LIMIT_MAX ?? "20"),
} as const;
```

### 8. **Synthetic Data Formulas** (LOW)
- Time-to-resolution: `12 + severity * 18` in src/lib/dashboard-data.ts:483
- Considered correct as it's a deterministic formula, but extract to const for clarity:
```typescript
const SYNTHETIC_TTR_BASE_HOURS = 12;
const SYNTHETIC_TTR_SEVERITY_MULTIPLIER = 18;
```

---

## Clean Areas (No Action Required)

- ✓ `CATEGORY_META` (hardcoded colors in dashboard-data.ts) — colors are part of category definition; OK to keep
- ✓ `CATEGORY_SLA_TARGETS` (72h pothole, 24h water leak, etc.) — operational policy; OK to keep but document why per-category
- ✓ Demo session cookie name `"civic_demo_session"` in src/lib/demo-auth.ts:29 — single usage, not a magic number
- ✓ Demo account usernames (`"usertest"`, `"admintest"`) — part of demo credential schema, OK hardcoded
- ✓ OAuth brand colors in login-form.tsx — correct to use brand-accurate hex values
- ✓ Intersection Observer thresholds (0.5, 0.02) — low impact, but still candidate for extraction
- ✓ Resolution buckets in derive.ts (24h, 3d, 7d, 2w) — policy-driven; extract if changing frequently

---

## Backlog: Ordered by Impact

### Critical (unblocks scale)

1. **M12: Time constants** — consolidate DAY_MS duplication across 8 files → `src/lib/time-constants.ts`
   - Affects: rate-limiter, retention cron, analytics, filters
   - Effort: 1h (create file, update 8 imports)
   - Payoff: eliminates drift risk; makes time-related tuning auditable

2. **M1/M2/M3: City config consolidation** → `src/lib/config/locations.ts`
   - Coordinates appear 4 times with precision variation; slug 3 times
   - Effort: 1h (extract + update 5 imports)
   - Payoff: demo→prod migrations safe; single city source of truth

3. **M4: Priority weights extraction** → `src/lib/ai/config.ts`
   - Formula is business policy (severity×2, emergency×50); no comments
   - Effort: 30m (extract 5 constants, 1 import)
   - Payoff: audit trail; product can tune without eng; unit testable formula

### High (improves readability)

4. **M6/M7: Status colors → config**
   - [48,209,88] unexplained; precision mismatch vs hex
   - Effort: 1h (extract, add hex equivalents, WCAG audit)

5. **M5: Fallback classification consolidation**
   - Duplicated in 3 files with slight variations (severity=3, subcategory difference)
   - Effort: 30m (extract function, update 3 call sites)

6. **M9: Shader parameters → config**
   - 13 magic numbers in GLSL + 2 unidentified RGB colors
   - Effort: 1.5h (extract, document intent for each param)

7. **M23: Seeded RNG deduplication**
   - Constants (127.1, 311.7, 43758.5453) in dashboard-data, analytics-data, resident-data
   - Effort: 1h (consolidate to seeded-random.ts, update 3 imports)

### Medium (tech debt)

8. **M8: Open311 pagination & rate limits** → config object
9. **M10: Map config** (tileSize, maxzoom, fade) → `src/lib/config/map.ts`
10. **M11: Map center hardcode** — remove fallback overrides, use KNOWN_CITIES only
11. **M14/M15: Privacy config** (maxDetectedFaces, blur region logic) → privacy config
12. **M13: Gemini rate limit defaults** — document why 40/300/1500
13. **M16–M22: Storage keys, tags, chunk size, defaults** — group in config modules

### Low (one-off cleanups when touching files)

14. **M22: "Cumming, GA" hardcoded in UI** — pass city from props
15. **M24: Demo corpus magic numbers** — extract to DEMO_CORPUS_CONFIG object
16. **M19: Preset tags** — move to config or env for future i18n

