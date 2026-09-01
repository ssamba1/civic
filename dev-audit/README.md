# dev-audit/

**A historical snapshot, not a live checklist.**

Thirty-six audit reports written on 2026-06-13 against a tree of ~202 `.tsx`
files with 11 unit tests, plus `_run.workflow.js`, the script that produced
them. `agents.md` describes this directory as "the audit output this project
was hardened against" — past tense, and that is the right way to read every
file in it. What actually landed since is recorded in
[`docs/planning/SHIPPED.md`](../docs/planning/SHIPPED.md).

Nothing here is a to-do list. The findings below are kept because the reasoning
is worth reading and because several of them explain why a piece of the code
looks the way it does — not because they are open.

## Status of the ship blockers

The four blockers this file used to open with, checked against the tree as it
stands:

| # | Finding | Status |
|---|---|---|
| P0 | Open311 `service_code` filter returned every category (LEFT JOIN + dot-notation filter) | **Fixed.** `src/app/api/open311/v2/requests/route.ts` now inner-joins classifications when `service_code` is present, with the reason in a comment at the join. |
| P1 | `dispatchWorkOrderForReport` silently updated zero rows | **Fixed.** `src/app/staff/actions.ts` uses verify-then-act — `.update().select("id")` and a row-count check — and returns `no_work_order_for_report` rather than flipping status for a work order that does not exist. |
| P1 | Missing `.catch()` on the classify fetch | **Fixed** in the same route. |
| P1 | Hydration mismatch in `reducedMotion()` | **Fixed.** `src/components/analytics/hover-tip.tsx` reads the preference inside a portal that only mounts on hover, so there is no SSR pass to diverge from. |

The other headline numbers are equally stale, and in the same direction. "Test
coverage 5.5%", "API endpoints 0%", "Auth/RLS 0%" and the "Setup GitHub Actions
CI/CD" item describe a repository with 11 test files and no CI. There are now
1,443 passing tests — 132 unit files colocated under `src/`, 13 RLS suites in
`tests/rls/`, 7 Playwright specs in `e2e/` — and two workflows in
`.github/workflows/`.

## What is actually in here

Two audit passes share this directory, which is why the numeric prefixes
collide — `05`, `06`, `07`, `08`, `09`, `10`, `11`, `12`, `13` and `14` each
appear twice, on unrelated topics, and there is no `17`. The prefix is not an
ordering; use the filename.

| File | Topic |
|---|---|
| `00-AUDIT-SUMMARY.md` | Cross-cutting summary of the second pass |
| `01-test-coverage-gaps.md` | Which `src/lib/**` modules had no colocated test |
| `02-any-and-loose-types.md` | `any` / `as any` / `@ts-ignore` inventory |
| `03-dead-code.md` | Unused exports, unreferenced files, stray root files |
| `04-accessibility.md` | Missing alt text, unlabelled icon buttons, focus states |
| `05-error-handling.md` | Swallowed errors and unguarded paths |
| `05-security.md` | Auth enforcement, secrets, injection surface |
| `06-performance.md` | Bundle weight and unaborted fetches |
| `06-todo-fixme-harvest.md` | In-code debt markers |
| `07-comprehensive-audit.md` | The 10-finding pass the blockers above came from |
| `07-readme-docs-drift.md` | README / `.env` / feature-list drift |
| `07-types.md` | Type-safety review |
| `08-dependency-audit.md` | Runtime + dev dependency review |
| `08-fix-implementations.md` | Diffs for the blockers above |
| `08-testing.md` | Test coverage review |
| `09-dependency-security.md` | Advisory scan |
| `09-repo-hygiene.md` | Committed-by-accident files, ignore rules |
| `10-debug-cruft.md` | Leftover logging and debug paths |
| `10-dependencies.md` | Dependency safety |
| `10-test-coverage-strategy.md` | The G1–G4 test plan |
| `11-magic-values.md` | Unnamed constants |
| `11-typescript.md` | Compiler strictness |
| `12-lint-format.md` | Lint and format configuration |
| `12-route-boundary-coverage.md` | `loading.tsx` / `error.tsx` coverage per route |
| `13-api-routes.md` | Per-route auth and validation |
| `13-open311-compliance.md` | GeoReport v2 conformance |
| `14-ai-pipeline-robustness.md` | Classification failure modes |
| `14-env-config.md` | Environment variable handling |
| `15-security-smells.md` | Pattern-level security scan |
| `16-naming-consistency.md` | Naming conventions |
| `18-privacy-module-review.md` | `lib/privacy/` review |
| `19-concurrency-and-state.md` | Shared-state hazards |
| `20-input-validation.md` | Zod coverage and normalisation |
| `21-toctou-race-conditions.md` | Check-then-act races |
| `22-database-and-security.md` | Schema and RLS review |
| `PHASE-1-IMPLEMENTATION.md` | The test-coverage implementation guide |

## `_run.workflow.js`

The generator: twenty read-only agents, one report file each, distinct output
paths so they could run at once. Kept as provenance for how these were produced.

Two things to know before running it. It hardcodes
`const ROOT = 'c:/Hackathon/-Social-Impact-'`, a path on the machine it was
written on and a directory layout this repository no longer has (see
`agents.md`, "Layout & current state"). And its task prompts embed the tree as
it was — "Repo has 202 ts/tsx files but only 11 `*.test.ts`" — so re-running it
unedited would brief every agent with counts that are off by an order of
magnitude.

It is also not standalone JavaScript: a Workflow script body ends in a top-level
`return`, which is the calling convention there and a parse error anywhere else.
`biome.json` excludes this directory for that reason.

## If you want to run an audit today

Start from the commands in `agents.md` — `pnpm typecheck`, `pnpm lint`,
`pnpm test`, `pnpm test:rls`, `pnpm audit:privacy` — and write findings
somewhere new. Adding a file here would put current findings in a directory
whose whole premise is that it is finished.
