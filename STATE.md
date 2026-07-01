# Loop State — Civic / Social Impact

Last run: 2026-07-01 (daily-triage, L1 report-only)
Branch scanned: `civic-ahilyanagar`

## High Priority (loop is acting or waiting on human)

- **Large uncommitted working tree at risk of loss.** 11 modified files + ~7 new untracked features sitting on `civic-ahilyanagar`: whole `src/lib/currency.ts` + `use-currency.ts`, `src/app/staff/grid/`, `src/app/teams/`, `src/components/staff/work-order-grid.tsx`, `src/components/map/satellite-style.{ts,test.ts}`, plus edits to `report-map.tsx`, `dashboard-queries.ts`, `reasoning/route.ts`.
  - *Why:* a full currency subsystem + staff work-order grid + teams route are unversioned. One bad `git checkout` loses a day+ of work.
  - *Next action (human):* commit in logical chunks (currency / staff-grid / map-satellite / teams) or stash. No loop auto-commit at L1.
  - *Effort:* 15 min.

- **No CI test gate on pushes.** Only 1 workflow run in repo history (a Copilot agent, 2026-05-29). The 102 vitest tests exist but nothing runs them on push to `main`. Solo-commits-to-main + no CI = regressions ship silently.
  - *Why:* every merge to main is untested in CI; the Ahilyanagar live-DB drift bugs (root-caused 6-30) are exactly the class CI would catch.
  - *Next action (human):* add `.github/workflows/test.yml` running `pnpm test` + `pnpm build` on push/PR.
  - *Effort:* 20 min.

## Watch List

- **`civic-ahilyanagar` diverging from `main`.** Demo branch has 8 commits (6-30) not on main. Decide: merge back, or is main frozen for the demo? Longer it sits, harder the reconcile.
- **`supabase/.temp/` is untracked.** Supabase CLI scratch dir — likely belongs in `.gitignore`, not committed.
- **Issue #6 stale ~3 weeks** — `feat(classifier): make issue types data-driven so custom categories route end-to-end` (open since 2026-06-08). Real feature debt; not urgent.
- **Live-DB drift pattern (from memory).** DB `gisoowyezwhdrozettbg` needed manual reconcile migration 021 on 6-30 (missing cols 010–018). Watch for the same drift on next feature that adds columns.

## Recent Noise (ignored this run)

- Loop scaffold files (`STATE.md`, `LOOP.md`, `loop-*.md`, `.claude/`) — untracked, expected, this run created them.
- Gemini 503s — transient Google-side overload, not actionable (seed data carries the dashboard).

---
Run log: 2026-07-01 — items_found: 6 (2 high / 4 watch), actions_taken: 0, outcome: report-only
