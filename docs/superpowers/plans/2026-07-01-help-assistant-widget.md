# Help Assistant Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a floating, help-first AI assistant (bottom-right, all pages) that answers help/FAQ, reads the current user's RLS-scoped data, and opens screens. Read + navigate only, no writes.

**Architecture:** A client widget uses the Vercel AI SDK `useChat` hook to stream from a server route `/api/ai/chat`. The route authenticates with the user's own cookie-scoped Supabase client (so Postgres RLS enforces all data access), runs Gemini via `@ai-sdk/google`, and exposes read/navigate tools. Retrieval over a small static help corpus is lexical (no pgvector). No data mutations.

**Tech Stack:** Next.js 16 (App Router, Node runtime), React 19, TypeScript strict, Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/react`), Gemini 2.5 Flash, Supabase SSR (RLS), Zod v4, Tailwind v4 + existing design system, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-01-help-assistant-widget-design.md`

---

## Conventions (read before starting)

- Import zod as `import { z } from "zod/v4";` (repo standard, see `src/lib/env.ts`).
- Server AI calls only. The widget never calls Gemini; it only calls `/api/ai/chat`.
- Data tools use the **cookie-scoped SSR client** (`createSSRClient()` / the client from `resolveChatContext`), **never** the service-role client in `src/lib/db/client.ts`.
- Tagged results `{ ok: true, data } | { ok: false, error }` for server helpers that can fail (repo style).
- Run tests from the app root: `cd "-Social-Impact-"`. Commands below assume that cwd.
- Commit after each task. Commit messages end with the repo's normal style (no co-author trailer needed unless your workflow adds one).

## File Structure

Create:
- `src/lib/ai/help-corpus.ts`: static help/FAQ corpus.
- `src/lib/ai/chat/retrieval.ts`: lexical `searchCorpus`.
- `src/lib/ai/chat/navigation.ts`: `ALLOWED_ROUTES`, `isRouteAllowed` (pure, server-shared).
- `src/lib/ai/chat/scope.ts`: `ChatRole`, `ChatScope`, `deriveScope` (pure).
- `src/lib/ai/chat/context.ts`: `resolveChatContext` (I/O: auth + scope + client).
- `src/lib/ai/chat/tools.ts`: `buildChatTools(ctx)`.
- `src/lib/ai/chat/system-prompt.ts`: `buildSystemPrompt(scope)`.
- `src/app/api/ai/chat/route.ts`: streaming endpoint.
- `src/components/assistant/pick-navigation.ts`: pure client helper to extract a pending navigation from messages.
- `src/components/assistant/assistant-message.tsx`: renders one message's parts.
- `src/components/assistant/assistant-widget.tsx`: launcher + panel + `useChat`.
- Tests colocated as `*.test.ts`, plus `e2e/assistant.spec.ts`.

Modify:
- `src/lib/ai/config.ts`: add chat constants + feature flag.
- `src/app/layout.tsx`: mount the widget.

---

## Task 1: Dependencies + config constants

**Files:**
- Modify: `src/lib/ai/config.ts`
- Test: `src/lib/ai/config.test.ts` (create)

- [ ] **Step 1: Install dependencies**

Run (from `-Social-Impact-`):
```bash
pnpm add ai @ai-sdk/google @ai-sdk/react react-markdown
```
Expected: `package.json` gains the four deps; `pnpm-lock.yaml` updates. No new env var required. The Google provider is constructed with the existing `GEMINI_API_KEY`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/ai/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CHAT_HISTORY_LIMIT, CHAT_MAX_STEPS, CHAT_MODEL } from "./config";

describe("chat config", () => {
  it("uses gemini-2.5-flash for chat (not flash-lite)", () => {
    expect(CHAT_MODEL).toBe("gemini-2.5-flash");
  });
  it("bounds tool steps and history", () => {
    expect(CHAT_MAX_STEPS).toBeGreaterThanOrEqual(3);
    expect(CHAT_HISTORY_LIMIT).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- config.test`
Expected: FAIL, `CHAT_MODEL`/`CHAT_MAX_STEPS`/`CHAT_HISTORY_LIMIT` are not exported.

- [ ] **Step 4: Add the constants**

Append to `src/lib/ai/config.ts`:
```ts
/**
 * Model for the help assistant chat. Uses gemini-2.5-flash (not flash-lite):
 * multi-turn tool-calling benefits from the stronger model, and the chat path
 * is not on the latency-critical submit flow. Classification stays on
 * GEMINI_MODEL (flash-lite).
 */
export const CHAT_MODEL = "gemini-2.5-flash";

/** Max tool-calling steps per assistant turn (bounds runaway tool loops). */
export const CHAT_MAX_STEPS = 5;

/** Max prior messages forwarded to the model (bounds token cost). */
export const CHAT_HISTORY_LIMIT = 12;

/**
 * When "1", the help assistant widget + /api/ai/chat route are enabled.
 * Default OFF so the feature ships dark and is turned on deliberately.
 * NEXT_PUBLIC_ so the client widget can read it too.
 */
export const HELP_ASSISTANT = process.env.NEXT_PUBLIC_HELP_ASSISTANT === "1";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- config.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/ai/config.ts src/lib/ai/config.test.ts
git commit -m "feat(assistant): add AI SDK deps + chat config constants"
```

---

## Task 2: Help corpus

**Files:**
- Create: `src/lib/ai/help-corpus.ts`
- Test: `src/lib/ai/help-corpus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/help-corpus.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { HELP_CORPUS } from "./help-corpus";

describe("HELP_CORPUS", () => {
  it("has multiple entries", () => {
    expect(HELP_CORPUS.length).toBeGreaterThanOrEqual(7);
  });
  it("has unique ids and non-empty bodies", () => {
    const ids = new Set(HELP_CORPUS.map((d) => d.id));
    expect(ids.size).toBe(HELP_CORPUS.length);
    for (const d of HELP_CORPUS) {
      expect(d.body.trim().length).toBeGreaterThan(0);
      expect(d.tags.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- help-corpus.test`
Expected: FAIL, module not found.

- [ ] **Step 3: Create the corpus**

Create `src/lib/ai/help-corpus.ts` (seeded from `src/components/landing/faq.tsx` + `docs/planning/context.md`/`design.md`):
```ts
/**
 * Static help/FAQ corpus for the help assistant. Small enough to keep in
 * memory; retrieved lexically (see chat/retrieval.ts). When this grows past
 * ~50-100 entries or needs semantic recall, migrate retrieval to pgvector
 * (already roadmapped for dedup) behind the searchCorpus interface.
 */
export interface HelpDoc {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

export const HELP_CORPUS: HelpDoc[] = [
  {
    id: "ai-classification",
    title: "How does Civic classify a photo?",
    tags: ["ai", "gemini", "classification", "accuracy", "how it works"],
    body: "When you submit a photo, Gemini 2.5 Flash analyzes it in about 1.5 seconds and assigns a category (pothole, streetlight, graffiti, etc.), a severity from 1 to 5, and a confidence score. Staff can override the AI and every override is logged so the model can be evaluated.",
  },
  {
    id: "privacy-blur",
    title: "What happens to my photo and location data?",
    tags: ["privacy", "blur", "faces", "license plate", "data", "retention"],
    body: "Faces and license plates are detected and blurred on your device before the photo ever leaves it. The blurred copy is public; the original is stored only while the report is open and is purged after it is resolved. Public map locations are rounded to about 30 meters so an exact address is never exposed.",
  },
  {
    id: "open311",
    title: "Does Civic replace the city's 311 system?",
    tags: ["open311", "integration", "311", "export", "city"],
    body: "No. Civic complements existing systems. Every report is exportable in Open311 GeoReport v2 (JSON and XML), and external clients can push reports in, so a city can adopt Civic without ripping out its current 311 tooling.",
  },
  {
    id: "cost-free",
    title: "Is Civic free for residents?",
    tags: ["cost", "free", "pricing", "residents"],
    body: "Yes. Reporting is always free for residents and never requires an account. Cities pay for the staff console and analytics.",
  },
  {
    id: "status-updates",
    title: "How do I know when my report is fixed?",
    tags: ["status", "notifications", "updates", "tracking", "resolved"],
    body: "You get a tracking link and status updates as the report moves from open to dispatched to in progress to resolved. When it is closed you can see the crew's after photo and rate the resolution.",
  },
  {
    id: "accountability",
    title: "What if the city ignores a report?",
    tags: ["accountability", "sla", "dashboard", "public", "equity"],
    body: "Every report is on a public dashboard with timestamps and SLA badges, and a neighborhood equity view surfaces underserved areas. That public record is the accountability pressure. Reports do not quietly disappear.",
  },
  {
    id: "which-cities",
    title: "Which cities use Civic?",
    tags: ["cities", "coverage", "cumming", "availability"],
    body: "Civic is piloting in Cumming, Georgia, and any city can be onboarded because reports are Open311-compatible. You can browse a city dashboard to see live stats for your area.",
  },
  {
    id: "how-to-report",
    title: "How do I report a problem?",
    tags: ["report", "submit", "photo", "how to", "pothole"],
    body: "Open the report screen, take or attach a photo of the problem, optionally add a short description or tags, and submit. The AI classifies it and routes it to the right city crew. It takes under 10 seconds and no account is needed.",
  },
  {
    id: "anonymous",
    title: "Do I need an account to report?",
    tags: ["account", "anonymous", "login", "sign up"],
    body: "No account is required to submit or track a report. You get a private tracking link. You can optionally add an email later to link your reports to an account and get email updates.",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- help-corpus.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/help-corpus.ts src/lib/ai/help-corpus.test.ts
git commit -m "feat(assistant): add static help corpus"
```

---

## Task 3: Lexical retrieval

**Files:**
- Create: `src/lib/ai/chat/retrieval.ts`
- Test: `src/lib/ai/chat/retrieval.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/chat/retrieval.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { searchCorpus } from "./retrieval";

describe("searchCorpus", () => {
  it("ranks the privacy doc first for a blur query", () => {
    const results = searchCorpus("how are faces blurred in my photo", 3);
    expect(results[0]?.id).toBe("privacy-blur");
  });
  it("returns at most k results", () => {
    expect(searchCorpus("civic", 2).length).toBeLessThanOrEqual(2);
  });
  it("returns [] for an empty query", () => {
    expect(searchCorpus("   ", 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- retrieval.test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement retrieval**

Create `src/lib/ai/chat/retrieval.ts`:
```ts
import { HELP_CORPUS, type HelpDoc } from "@/lib/ai/help-corpus";

const STOP = new Set([
  "the", "a", "an", "is", "are", "do", "does", "how", "what", "my", "i",
  "in", "to", "of", "and", "or", "for", "on", "it", "me", "can", "you",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function docTerms(doc: HelpDoc): string[] {
  return tokenize(`${doc.title} ${doc.tags.join(" ")} ${doc.body}`);
}

/**
 * Lexical top-k over the help corpus. Scores by query-term overlap, weighting
 * title/tag matches higher than body matches. Pure and synchronous. The seam
 * a future pgvector implementation would replace.
 */
export function searchCorpus(query: string, k = 3): HelpDoc[] {
  const qTerms = new Set(tokenize(query));
  if (qTerms.size === 0) return [];

  const scored = HELP_CORPUS.map((doc) => {
    const titleTags = new Set(tokenize(`${doc.title} ${doc.tags.join(" ")}`));
    const all = docTerms(doc);
    let score = 0;
    for (const term of qTerms) {
      if (titleTags.has(term)) score += 3;
      else if (all.includes(term)) score += 1;
    }
    return { doc, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.doc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- retrieval.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/chat/retrieval.ts src/lib/ai/chat/retrieval.test.ts
git commit -m "feat(assistant): lexical help-corpus retrieval"
```

---

## Task 4: Route allow-list (navigation)

**Files:**
- Create: `src/lib/ai/chat/navigation.ts`
- Test: `src/lib/ai/chat/navigation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/chat/navigation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isRouteAllowed } from "./navigation";

describe("isRouteAllowed", () => {
  it("allows resident-safe routes for residents", () => {
    expect(isRouteAllowed("/report", "resident")).toBe(true);
    expect(isRouteAllowed("/user/my-reports", "resident")).toBe(true);
    expect(isRouteAllowed("/city/cumming", "anon")).toBe(true);
    expect(isRouteAllowed("/city/cumming/map", "resident")).toBe(true);
  });
  it("blocks staff routes for residents and anon", () => {
    expect(isRouteAllowed("/staff", "resident")).toBe(false);
    expect(isRouteAllowed("/staff/map", "anon")).toBe(false);
  });
  it("allows staff routes for staff roles", () => {
    expect(isRouteAllowed("/staff", "staff_dispatcher")).toBe(true);
    expect(isRouteAllowed("/staff/settings", "admin")).toBe(true);
  });
  it("rejects off-site, protocol-relative, and unknown routes", () => {
    expect(isRouteAllowed("https://evil.com", "resident")).toBe(false);
    expect(isRouteAllowed("//evil.com", "resident")).toBe(false);
    expect(isRouteAllowed("/does-not-exist", "resident")).toBe(false);
    expect(isRouteAllowed("/report?email=a@b.com", "resident")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- navigation.test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the allow-list**

Create `src/lib/ai/chat/navigation.ts`:
```ts
import type { ChatRole } from "@/lib/ai/chat/scope";

/**
 * Server-authoritative navigation allow-list for the navigateTo tool. Only
 * these path shapes may be returned to the client for router.push. No query
 * strings are permitted (no PII in URLs, AGENTS.md rule 4).
 */
const RESIDENT_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/report$/,
  /^\/login$/,
  /^\/user\/my-reports$/,
  /^\/user\/my-reports\/[a-zA-Z0-9-]+$/,
  /^\/user\/pulse$/,
  /^\/user\/updates$/,
  /^\/city\/[a-z0-9-]+$/,
  /^\/city\/[a-z0-9-]+\/(map|browse|analytics)$/,
  /^\/r\/[a-zA-Z0-9-]+$/,
];

const STAFF_ROUTES: RegExp[] = [
  /^\/staff$/,
  /^\/staff\/(map|grid|stats|settings)$/,
];

const STAFF_ROLES: ChatRole[] = ["staff_dispatcher", "staff_supervisor", "admin"];

export function isRouteAllowed(route: string, role: ChatRole): boolean {
  // Reject anything with a query string or fragment (no PII in URLs) and any
  // non-absolute / protocol-relative path.
  if (!route.startsWith("/") || route.startsWith("//")) return false;
  if (route.includes("?") || route.includes("#")) return false;

  if (RESIDENT_ROUTES.some((re) => re.test(route))) return true;
  if (STAFF_ROLES.includes(role) && STAFF_ROUTES.some((re) => re.test(route))) {
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- navigation.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/chat/navigation.ts src/lib/ai/chat/navigation.test.ts
git commit -m "feat(assistant): server-authoritative navigation allow-list"
```

---

## Task 5: Chat scope (pure role/city derivation)

**Files:**
- Create: `src/lib/ai/chat/scope.ts`
- Test: `src/lib/ai/chat/scope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/chat/scope.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { deriveScope, isStaffRole } from "./scope";

describe("deriveScope", () => {
  it("maps a null user row to anon", () => {
    expect(deriveScope(null)).toEqual({
      userId: null,
      role: "anon",
      citySlug: null,
    });
  });
  it("maps a resident row", () => {
    const scope = deriveScope({
      id: "u1",
      role: "resident",
      cities: { slug: "cumming" },
    });
    expect(scope).toEqual({ userId: "u1", role: "resident", citySlug: "cumming" });
  });
  it("maps a staff row and flags staff", () => {
    const scope = deriveScope({
      id: "u2",
      role: "admin",
      cities: { slug: "cumming" },
    });
    expect(scope.role).toBe("admin");
    expect(isStaffRole(scope.role)).toBe(true);
    expect(isStaffRole("resident")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- scope.test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement scope**

Create `src/lib/ai/chat/scope.ts`:
```ts
export type ChatRole =
  | "anon"
  | "resident"
  | "staff_dispatcher"
  | "staff_supervisor"
  | "admin";

export interface ChatScope {
  userId: string | null;
  role: ChatRole;
  citySlug: string | null;
}

/** Shape of the joined users+cities row (RLS-scoped read). */
export interface UserRow {
  id: string;
  role: ChatRole;
  cities: { slug: string } | null;
}

const STAFF: ChatRole[] = ["staff_dispatcher", "staff_supervisor", "admin"];

export function isStaffRole(role: ChatRole): boolean {
  return STAFF.includes(role);
}

/** Pure mapping from a fetched user row (or null) to a ChatScope. */
export function deriveScope(row: UserRow | null): ChatScope {
  if (!row) return { userId: null, role: "anon", citySlug: null };
  return {
    userId: row.id,
    role: row.role,
    citySlug: row.cities?.slug ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- scope.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/chat/scope.ts src/lib/ai/chat/scope.test.ts
git commit -m "feat(assistant): pure chat scope derivation"
```

---

## Task 6: Chat context (auth + scoped client)

**Files:**
- Create: `src/lib/ai/chat/context.ts`
- Test: none (thin I/O wrapper; the pure logic is tested in Task 5). Verified via typecheck + the route test in Task 8.

- [ ] **Step 1: Implement resolveChatContext**

Create `src/lib/ai/chat/context.ts`:
```ts
import { type ChatScope, deriveScope, type UserRow } from "@/lib/ai/chat/scope";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatContext extends ChatScope {
  /** Cookie-scoped SSR client. RLS enforces all reads. NEVER service-role. */
  supabase: SupabaseClient;
}

/**
 * Resolve the per-request chat context: the user's own RLS-scoped Supabase
 * client plus their role + city. Anonymous callers get role "anon" and a
 * client that can still read public data (cities, dashboard_reports_view).
 */
export async function resolveChatContext(): Promise<ChatContext> {
  const supabase = await createSSRClient();
  const user = await getAuthUser();
  if (!user) {
    return { supabase, ...deriveScope(null) };
  }

  // RLS: users_select_own returns only the caller's own row; cities is public.
  const { data } = await supabase
    .from("users")
    .select("id, role, cities(slug)")
    .eq("id", user.id)
    .maybeSingle<UserRow>();

  return { supabase, ...deriveScope(data ?? null) };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS (no errors in `context.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/chat/context.ts
git commit -m "feat(assistant): per-request chat context resolver"
```

---

## Task 7: Tools

**Files:**
- Create: `src/lib/ai/chat/tools.ts`
- Test: `src/lib/ai/chat/tools.test.ts`

The tools are built from a `ChatContext`. Data tools call the scoped client; unit tests inject a fake client that records calls, proving each tool queries the intended table with the intended filters (RLS itself is covered by `tests/rls`). `navigateTo` and `searchHelpDocs` need no client.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/chat/tools.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { ChatContext } from "./context";
import { buildChatTools } from "./tools";

/** Minimal chainable fake of the supabase query builder. */
function fakeSupabase(rows: unknown[]) {
  const calls: { table?: string; filters: [string, unknown][]; limit?: number } = {
    filters: [],
  };
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      calls.filters.push([col, val]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn((n: number) => {
      calls.limit = n;
      return Promise.resolve({ data: rows, error: null });
    }),
    maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
  };
  const supabase = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return builder;
    }),
  };
  return { supabase: supabase as unknown as ChatContext["supabase"], calls };
}

function ctx(overrides: Partial<ChatContext>, rows: unknown[] = []): {
  context: ChatContext;
  calls: ReturnType<typeof fakeSupabase>["calls"];
} {
  const { supabase, calls } = fakeSupabase(rows);
  return {
    context: {
      supabase,
      userId: "u1",
      role: "resident",
      citySlug: "cumming",
      ...overrides,
    },
    calls,
  };
}

describe("buildChatTools", () => {
  it("getMyReports filters by the caller's id and is bounded", async () => {
    const { context, calls } = ctx({ userId: "u1" }, [
      { id: "r1", status: "open", address: "1 Main", created_at: "2026-06-01" },
    ]);
    const tools = buildChatTools(context);
    const out = await tools.getMyReports.execute({}, {} as never);
    expect(calls.table).toBe("reports");
    expect(calls.filters).toContainEqual(["reporter_id", "u1"]);
    expect(typeof calls.limit).toBe("number");
    expect(JSON.stringify(out)).toContain("r1");
  });

  it("getMyReports tells anon users to sign in and never queries", async () => {
    const { context, calls } = ctx({ userId: null, role: "anon" });
    const tools = buildChatTools(context);
    const out = (await tools.getMyReports.execute({}, {} as never)) as {
      error?: string;
    };
    expect(out.error).toMatch(/sign in/i);
    expect(calls.table).toBeUndefined();
  });

  it("navigateTo returns the route when allowed for the role", async () => {
    const { context } = ctx({ role: "resident" });
    const tools = buildChatTools(context);
    const ok = (await tools.navigateTo.execute({ route: "/user/my-reports" }, {} as never)) as {
      navigate?: string;
    };
    expect(ok.navigate).toBe("/user/my-reports");
  });

  it("navigateTo refuses a staff route for a resident", async () => {
    const { context } = ctx({ role: "resident" });
    const tools = buildChatTools(context);
    const denied = (await tools.navigateTo.execute({ route: "/staff" }, {} as never)) as {
      error?: string;
    };
    expect(denied.error).toBeTruthy();
    expect((denied as { navigate?: string }).navigate).toBeUndefined();
  });

  it("searchHelpDocs returns corpus snippets", async () => {
    const { context } = ctx({});
    const tools = buildChatTools(context);
    const out = (await tools.searchHelpDocs.execute({ query: "blur faces" }, {} as never)) as {
      results: { id: string }[];
    };
    expect(out.results[0]?.id).toBe("privacy-blur");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tools.test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the tools**

Create `src/lib/ai/chat/tools.ts`:
```ts
import { tool } from "ai";
import { z } from "zod/v4";
import type { ChatContext } from "@/lib/ai/chat/context";
import { isRouteAllowed } from "@/lib/ai/chat/navigation";
import { isStaffRole } from "@/lib/ai/chat/scope";
import { searchCorpus } from "@/lib/ai/chat/retrieval";

const REPORT_LIMIT = 20;

/**
 * Build the read/navigate tool set bound to a request's ChatContext. All data
 * reads use ctx.supabase (RLS-scoped); no tool mutates data. Tool execute
 * functions never throw. They return a structured `{ error }` so the model can
 * recover conversationally.
 */
export function buildChatTools(ctx: ChatContext) {
  return {
    searchHelpDocs: tool({
      description:
        "Search Civic's help/FAQ knowledge base for how the product works (privacy, blur, Open311, cost, status updates, how to report). Use this for any 'how does X work' question before answering.",
      inputSchema: z.object({
        query: z.string().describe("the user's help question, in their words"),
      }),
      execute: async ({ query }) => {
        const results = searchCorpus(query, 3).map((d) => ({
          id: d.id,
          title: d.title,
          body: d.body,
        }));
        return { results };
      },
    }),

    getMyReports: tool({
      description:
        "List the reports the current signed-in user has filed, with status. Use when they ask about 'my reports' or 'my pothole'. Only works for signed-in users.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.userId) {
          return { error: "The user is not signed in. Ask them to sign in to see their own reports." };
        }
        const { data, error } = await ctx.supabase
          .from("reports")
          .select("id, status, address, description, created_at")
          .eq("reporter_id", ctx.userId)
          .order("created_at", { ascending: false })
          .limit(REPORT_LIMIT);
        if (error) return { error: "Could not load reports right now." };
        return { reports: data ?? [] };
      },
    }),

    getReportStatus: tool({
      description:
        "Get the current status and timeline of one report by its id. RLS ensures only reports the user is allowed to see are returned.",
      inputSchema: z.object({
        reportId: z.string().describe("the report UUID"),
      }),
      execute: async ({ reportId }) => {
        const { data, error } = await ctx.supabase
          .from("reports")
          .select("id, status, address, created_at, updated_at")
          .eq("id", reportId)
          .maybeSingle();
        if (error) return { error: "Could not load that report." };
        if (!data) return { error: "No report with that id is visible to you." };
        return { report: data };
      },
    }),

    getCityStats: tool({
      description:
        "Get public headline stats (total, open, resolved report counts) for a city by its slug (e.g. 'cumming'). Reads the public dashboard view.",
      inputSchema: z.object({
        slug: z.string().describe("the city slug, e.g. 'cumming'"),
      }),
      execute: async ({ slug }) => {
        const base = ctx.supabase
          .from("dashboard_reports_view")
          .select("id", { count: "exact", head: true })
          .eq("city_slug", slug);
        const [total, open, closed] = await Promise.all([
          base,
          ctx.supabase
            .from("dashboard_reports_view")
            .select("id", { count: "exact", head: true })
            .eq("city_slug", slug)
            .eq("status", "open"),
          ctx.supabase
            .from("dashboard_reports_view")
            .select("id", { count: "exact", head: true })
            .eq("city_slug", slug)
            .eq("status", "closed"),
        ]);
        if (total.error) return { error: "Could not load city stats." };
        return {
          city: slug,
          total: total.count ?? 0,
          open: open.count ?? 0,
          resolved: closed.count ?? 0,
        };
      },
    }),

    navigateTo: tool({
      description:
        "Open a screen for the user by navigating to an in-app route (e.g. '/report', '/user/my-reports', '/city/cumming/map'). Use when the user asks to go somewhere or when it helps them complete a task. Only in-app routes are allowed.",
      inputSchema: z.object({
        route: z
          .string()
          .describe("an in-app path beginning with '/', no query string"),
      }),
      execute: async ({ route }) => {
        if (!isRouteAllowed(route, ctx.role)) {
          return {
            error: `Cannot navigate to "${route}" for this user. Suggest an allowed screen instead.`,
          };
        }
        return { navigate: route };
      },
    }),
  };
}

/** Whether the current scope may use staff-only reads (future staff tier). */
export function scopeAllowsStaffReads(ctx: ChatContext): boolean {
  return isStaffRole(ctx.role);
}
```

> Note: `getCityStats` uses head+count queries; the `.eq(...)` chain there returns
> a thenable that resolves to `{ count, error }`. The fake in the test only
> exercises `getMyReports`/`navigateTo`/`searchHelpDocs`; `getCityStats` and
> `getReportStatus` are covered by the route smoke test + manual verification.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tools.test`
Expected: PASS. If the fake builder needs another method for a tool you touched, add it to the fake. Do not add methods to production code to satisfy the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/chat/tools.ts src/lib/ai/chat/tools.test.ts
git commit -m "feat(assistant): read + navigate chat tools (RLS-scoped)"
```

---

## Task 8: System prompt + streaming route

**Files:**
- Create: `src/lib/ai/chat/system-prompt.ts`
- Create: `src/app/api/ai/chat/route.ts`
- Test: `src/lib/ai/chat/system-prompt.test.ts`, `src/app/api/ai/chat/route.test.ts`

- [ ] **Step 1: Write the failing system-prompt test**

Create `src/lib/ai/chat/system-prompt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt", () => {
  it("names the role and city and forbids off-topic answers", () => {
    const p = buildSystemPrompt({ userId: "u1", role: "resident", citySlug: "cumming" });
    expect(p).toMatch(/resident/i);
    expect(p).toMatch(/cumming/i);
    expect(p).toMatch(/civic/i);
    expect(p.toLowerCase()).toContain("do not");
  });
  it("does not claim it can submit or change data", () => {
    const p = buildSystemPrompt({ userId: null, role: "anon", citySlug: null });
    expect(p.toLowerCase()).toMatch(/cannot (submit|change|edit|create)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- system-prompt.test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the system prompt**

Create `src/lib/ai/chat/system-prompt.ts`:
```ts
import type { ChatScope } from "@/lib/ai/chat/scope";

/**
 * Build the assistant's system prompt for a given scope. Help-first, read-only,
 * on-topic. The RLS-scoped tools are the security boundary; the prompt sets
 * behaviour and refusals.
 */
export function buildSystemPrompt(scope: ChatScope): string {
  const who =
    scope.role === "anon"
      ? "an anonymous visitor"
      : `a signed-in ${scope.role.replace("_", " ")}`;
  const city = scope.citySlug ? `Their city is "${scope.citySlug}".` : "";

  return [
    "You are Civic's in-app help assistant. Civic is an AI-native civic infrastructure reporting product: residents photograph broken infrastructure (potholes, streetlights, graffiti), AI classifies it, and city staff dispatch and fix it.",
    `You are talking to ${who}. ${city}`.trim(),
    "",
    "Your job (help-first):",
    "- Answer questions about how Civic works using the searchHelpDocs tool. Prefer retrieved facts over guessing.",
    "- Look up the user's own data with getMyReports / getReportStatus, and public stats with getCityStats.",
    "- Open the right screen for the user with navigateTo when it helps them.",
    "",
    "Hard rules:",
    "- You are READ-ONLY. You cannot submit, change, edit, or create reports, work orders, or any data. If asked to do so, explain that you cannot, then offer to open the relevant screen (e.g. navigateTo '/report') so they can do it themselves.",
    "- Only discuss Civic and the user's civic reports. Do not give general civic, legal, or political advice; for off-topic requests, briefly decline and steer back to Civic.",
    "- Never invent report data or statuses. If a tool returns nothing, say so plainly.",
    "- Keep answers short and concrete. Use the user's own words back to them.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- system-prompt.test`
Expected: PASS.

- [ ] **Step 5: Write the failing route test**

Create `src/app/api/ai/chat/route.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

// The route reads HELP_ASSISTANT at import time via config; mock it OFF here.
vi.mock("@/lib/ai/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/ai/config")>();
  return { ...actual, HELP_ASSISTANT: false };
});

describe("POST /api/ai/chat (feature flag off)", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns 404 when the assistant is disabled", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test -- "route.test"`
Expected: FAIL. `./route` module not found.

- [ ] **Step 7: Implement the route**

Create `src/app/api/ai/chat/route.ts`:
```ts
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import {
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_STEPS,
  CHAT_MODEL,
  HELP_ASSISTANT,
} from "@/lib/ai/config";
import { resolveChatContext } from "@/lib/ai/chat/context";
import { buildChatTools } from "@/lib/ai/chat/tools";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const logger = createLogger("[chat-api]");

export async function POST(request: Request) {
  if (!HELP_ASSISTANT) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const rl = checkRateLimit(`chat:${clientIp(request)}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limited" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      );
    }

    const body = (await request.json()) as { messages?: UIMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const recent = messages.slice(-CHAT_HISTORY_LIMIT);

    const ctx = await resolveChatContext();
    const google = createGoogleGenerativeAI({ apiKey: serverEnv.GEMINI_API_KEY });

    const result = streamText({
      model: google(CHAT_MODEL),
      system: buildSystemPrompt(ctx),
      messages: convertToModelMessages(recent),
      tools: buildChatTools(ctx),
      stopWhen: stepCountIs(CHAT_MAX_STEPS),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    logger.error("Unhandled error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test -- "route.test"`
Expected: PASS (404 when flag off).

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/chat/system-prompt.ts src/lib/ai/chat/system-prompt.test.ts src/app/api/ai/chat/route.ts src/app/api/ai/chat/route.test.ts
git commit -m "feat(assistant): system prompt + streaming chat route"
```

---

## Task 9: Client navigation helper (pure)

**Files:**
- Create: `src/components/assistant/pick-navigation.ts`
- Test: `src/components/assistant/pick-navigation.test.ts`

The widget must turn a `navigateTo` tool output into a single `router.push`. Extract that as a pure function so it is unit-testable and idempotent (each navigation fires once).

- [ ] **Step 1: Write the failing test**

Create `src/components/assistant/pick-navigation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { pickPendingNavigation } from "./pick-navigation";

const msg = (id: string, parts: unknown[]) => ({ id, role: "assistant", parts });

describe("pickPendingNavigation", () => {
  it("returns the route + a stable key from a completed navigateTo part", () => {
    const messages = [
      msg("m1", [
        { type: "tool-navigateTo", toolCallId: "c1", state: "output-available", output: { navigate: "/report" } },
      ]),
    ];
    expect(pickPendingNavigation(messages as never)).toEqual({
      key: "c1",
      route: "/report",
    });
  });
  it("ignores incomplete or errored parts", () => {
    const messages = [
      msg("m1", [{ type: "tool-navigateTo", toolCallId: "c1", state: "input-available" }]),
      msg("m2", [{ type: "tool-navigateTo", toolCallId: "c2", state: "output-available", output: { error: "no" } }]),
    ];
    expect(pickPendingNavigation(messages as never)).toBeNull();
  });
  it("returns the most recent navigation when several exist", () => {
    const messages = [
      msg("m1", [{ type: "tool-navigateTo", toolCallId: "c1", state: "output-available", output: { navigate: "/report" } }]),
      msg("m2", [{ type: "tool-navigateTo", toolCallId: "c2", state: "output-available", output: { navigate: "/user/my-reports" } }]),
    ];
    expect(pickPendingNavigation(messages as never)?.route).toBe("/user/my-reports");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- pick-navigation.test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the helper**

Create `src/components/assistant/pick-navigation.ts`:
```ts
import type { UIMessage } from "ai";

export interface PendingNavigation {
  /** toolCallId, stable, so the widget fires each navigation exactly once. */
  key: string;
  route: string;
}

/**
 * Scan messages (latest first) for a completed navigateTo tool output and
 * return the route to push, or null. Pure so the widget can dedupe on `key`.
 */
export function pickPendingNavigation(messages: UIMessage[]): PendingNavigation | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]?.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j] as {
        type?: string;
        state?: string;
        toolCallId?: string;
        output?: { navigate?: string };
      };
      if (
        part.type === "tool-navigateTo" &&
        part.state === "output-available" &&
        typeof part.output?.navigate === "string" &&
        part.toolCallId
      ) {
        return { key: part.toolCallId, route: part.output.navigate };
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- pick-navigation.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/assistant/pick-navigation.ts src/components/assistant/pick-navigation.test.ts
git commit -m "feat(assistant): pure pending-navigation extractor"
```

---

## Task 10: Message renderer + widget

**Files:**
- Create: `src/components/assistant/assistant-message.tsx`
- Create: `src/components/assistant/assistant-widget.tsx`
- Test: none unit (streaming UI verified in e2e, Task 12). Verified via typecheck.

- [ ] **Step 1: Implement the message renderer**

Create `src/components/assistant/assistant-message.tsx`:
```tsx
"use client";

import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils/cn";

const TOOL_LABEL: Record<string, string> = {
  "tool-searchHelpDocs": "Searching help…",
  "tool-getMyReports": "Looking up your reports…",
  "tool-getReportStatus": "Checking that report…",
  "tool-getCityStats": "Reading city stats…",
  "tool-navigateTo": "Opening a screen…",
};

export function AssistantMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-[var(--color-primary)] text-white"
            : "bg-white/5 text-[var(--color-foreground)]",
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={`${message.id}-t${i}`}
                className="prose prose-invert prose-sm max-w-none [&_p]:my-1"
              >
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            const label = TOOL_LABEL[part.type];
            const done =
              (part as { state?: string }).state === "output-available";
            if (!label || done) return null;
            return (
              <div
                key={`${message.id}-tool${i}`}
                className="my-1 text-xs italic text-[var(--color-muted)]"
              >
                {label}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the widget**

Create `src/components/assistant/assistant-widget.tsx`:
```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LiquidGlassCard } from "@/components/ui/liquid-glass";
import { cn } from "@/lib/utils/cn";
import { AssistantMessage } from "./assistant-message";
import { pickPendingNavigation } from "./pick-navigation";

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const router = useRouter();
  const navigatedKey = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
  });

  // Fire each navigateTo exactly once (dedupe on toolCallId).
  useEffect(() => {
    const pending = pickPendingNavigation(messages);
    if (pending && pending.key !== navigatedKey.current) {
      navigatedKey.current = pending.key;
      router.push(pending.route);
    }
  }, [messages, router]);

  // Autoscroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-50 sm:bottom-6">
      {open ? (
        <LiquidGlassCard
          blurIntensity="xl"
          className="flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col"
          contentClassName="flex h-full flex-col"
        >
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-muted)]">
              Ask Civic
            </span>
            <button
              type="button"
              aria-label="Close help"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            >
              <X className="size-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                Ask how Civic works, check your reports, or say “take me to report a
                problem.”
              </p>
            ) : (
              messages.map((m) => <AssistantMessage key={m.id} message={m} />)
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask a question…"
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-[var(--color-muted)]"
            />
            <button
              type="button"
              aria-label="Send"
              onClick={submit}
              disabled={busy || input.trim().length === 0}
              className={cn(
                "rounded-full p-2 text-white transition",
                busy || input.trim().length === 0
                  ? "bg-white/10 text-[var(--color-muted)]"
                  : "bg-[var(--color-primary)] active:translate-y-px",
              )}
            >
              <Send className="size-4" />
            </button>
          </div>
        </LiquidGlassCard>
      ) : (
        <button
          type="button"
          aria-label="Open Civic help"
          onClick={() => setOpen(true)}
          className="flex size-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg transition active:translate-y-px"
        >
          <MessageCircle className="size-6" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS. If `lucide-react` icon names differ in the installed version, swap to available icons.

- [ ] **Step 4: Commit**

```bash
git add src/components/assistant/assistant-message.tsx src/components/assistant/assistant-widget.tsx
git commit -m "feat(assistant): help widget UI (launcher + streaming panel)"
```

---

## Task 11: Mount the widget (flag-gated)

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the gated mount**

In `src/app/layout.tsx`, add the import near the other component imports:
```ts
import { HELP_ASSISTANT } from "@/lib/ai/config";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
```
Then render it as a sibling after `<BottomTabBar />`:
```tsx
        <div className="page-enter flex flex-1 flex-col">{children}</div>
        <BottomTabBar />
        {HELP_ASSISTANT ? <AssistantWidget /> : null}
      </body>
```

- [ ] **Step 2: Verify build/typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(assistant): mount help widget in root layout (flag-gated)"
```

---

## Task 12: E2E smoke test (widget shell + request wiring)

**Files:**
- Create: `e2e/assistant.spec.ts`

This asserts the widget shell works and posts to `/api/ai/chat`. Without depending on a live Gemini key. The route is intercepted and fulfilled with a minimal streamed UI-message response so the assertion is deterministic. The full model+tool loop is checked in manual verification (Task 13).

- [ ] **Step 1: Write the e2e test**

Create `e2e/assistant.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

// The widget only mounts when NEXT_PUBLIC_HELP_ASSISTANT=1 at build/runtime.
test.describe("help assistant widget", () => {
  test("opens, sends a message, and posts to the chat API", async ({ page }) => {
    let posted: string | null = null;

    // Intercept the streaming endpoint and return a tiny valid UI-message stream.
    await page.route("**/api/ai/chat", async (route) => {
      posted = route.request().postData();
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body:
          'data: {"type":"start"}\n\n' +
          'data: {"type":"text-start","id":"t1"}\n\n' +
          'data: {"type":"text-delta","id":"t1","delta":"Reports are free."}\n\n' +
          'data: {"type":"text-end","id":"t1"}\n\n' +
          'data: {"type":"finish"}\n\n' +
          "data: [DONE]\n\n",
      });
    });

    await page.goto("/");
    await page.getByLabel("Open Civic help").click();
    await page.getByPlaceholder("Ask a question…").fill("Is Civic free?");
    await page.getByLabel("Send").click();

    await expect(page.getByText("Reports are free.")).toBeVisible();
    expect(posted).toContain("Is Civic free?");
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run (build with the flag on, then test):
```bash
NEXT_PUBLIC_HELP_ASSISTANT=1 pnpm build
NEXT_PUBLIC_HELP_ASSISTANT=1 pnpm test:e2e -- assistant
```
Expected: PASS. If the AI SDK's UI-message stream chunk shape differs in the installed version, capture one real response body from `/api/ai/chat` in dev and paste its event lines into `body` above (keep the interception; only the chunk format is version-specific).

- [ ] **Step 3: Commit**

```bash
git add e2e/assistant.spec.ts
git commit -m "test(assistant): e2e smoke for widget open + chat request"
```

---

## Task 13: Full verification + gate

- [ ] **Step 1: Run the whole suite**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test
```
Expected: all green. Fix any biome complaints (import order, `any`) in the new files.

- [ ] **Step 2: Manual end-to-end (real Gemini)**

With `NEXT_PUBLIC_HELP_ASSISTANT=1` and a real `GEMINI_API_KEY`, `pnpm dev`, then as the seeded `usertest` (resident) and `admintest`:
- Ask "how does the photo blur work?" → cites the privacy answer.
- Ask "what are my reports?" → returns only that user's reports (sign in first).
- Ask "take me to report a problem" → widget navigates to `/report`.
- As a resident, ask "take me to the staff console" → assistant declines (allow-list blocks `/staff`).
- Ask "submit a pothole report for me" → assistant explains it can't submit, offers to open `/report`.
- Confirm the launcher clears the mobile bottom tab bar (safe-area) on a phone viewport.

- [ ] **Step 3: RLS regression**

Run: `pnpm test:rls`
Expected: PASS (no schema changed, but confirm the tools didn't prompt any policy changes).

- [ ] **Step 4: Final commit / branch is ready**

```bash
git add -A
git commit -m "chore(assistant): verification pass for help widget"
```

---

## Definition of Done

- All of Tasks 1-13 committed; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls` green.
- Widget mounts only when `NEXT_PUBLIC_HELP_ASSISTANT=1`; route 404s when off.
- Data tools proven to query as the user (reporter_id filter) and to refuse anon; navigation allow-list proven per role.
- No service-role client used anywhere in `src/lib/ai/chat/*`.
- Manual E2E behaviours in Task 13 verified.

## Known limitation: demo mode (decide before Phase 2)

`resolveChatContext` uses `getAuthUser()`, which returns null under the demo
cookie-persona (`src/lib/demo-auth.ts`) because there is no real Supabase JWT.
So in `NEXT_PUBLIC_DEMO_MODE`, the assistant treats users as **anon**: help
answers and public city stats work, but `getMyReports` / `getReportStatus`
return the "sign in" message instead of the persona's data. This is safe (no
service-role bypass) but diverges from the spec's "scope to persona" line.

If demo personas must see "their" reports through the bot, add a demo branch in
`resolveChatContext` that reads the persona from `demo-auth.ts` and scopes reads
by the persona's `reporter_id`/city **without** the service-role client, a
small, self-contained follow-up. Left out of MVP deliberately; confirm with the
product owner.

## Notes / deferred (do NOT build now)

- Staff read tier (`queryWorkOrders`), submit-assist + staff write tools (behind confirm-preview via existing server actions), pgvector semantic help, conversation persistence, all Phase 2 per the spec.
```
