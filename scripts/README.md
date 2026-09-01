# scripts/

Operational scripts. Thirty-eight files, and only a handful of them are things
you are expected to run. The rest are one-off repairs and capture tools kept
because the thing they produced is committed and someone will eventually need
to regenerate it.

Nothing here is imported by the app. `src/` never reaches into this directory.

## The ones wired into `package.json`

These have a `pnpm` alias, which is the signal that they are supported.

| Command | Script | What it does |
| --- | --- | --- |
| `pnpm test:rls` | `test-rls.mjs` | Sets `RUN_RLS_TESTS=1` and forwards to vitest, so `tests/rls/*` leaves skip mode. Dep-free for Windows/posix parity. |
| `pnpm eval` | `eval-classify.ts` | Golden-set classification eval against `tests/golden/`, using the real production prompt and schema. |
| `pnpm audit:privacy` | `audit-privacy.ts` | The privacy gate from `agents.md`. Cross-references every city's `photos-public` bucket against `photos-raw`. |
| `pnpm db:tokens` | `backfill-public-tokens.ts` | Stamps `reports.public_token` on rows without one. Dry runs unless passed `--apply`. |
| `pnpm demo:seed` | `seed-demo.mjs` | One command to make a fresh deployment look like the demo, wraps the dozen seed steps that used to be run by hand. |
| `pnpm db:apply-012` | `apply-012.mjs` | No-CLI fallback that applies only migration `012` over a direct Postgres connection. |
| (`postinstall`, `prebuild`) | `copy-cesium-assets.mjs` | Copies Cesium's prebuilt runtime into `public/cesium` so the browser can fetch it at `CESIUM_BASE_URL`. Runs automatically. |

`db:tokens` is the one people miss. Seeded reports are never notified, so the
notifier never lazily stamps a token, so `/r/[token]`, the only door to the
public status page, 404s on a freshly seeded database while every other
screen looks complete.

## Seeding the demo corpus

Run `pnpm demo:seed` instead of these individually; they are listed so you know
what it is orchestrating.

- `seed-demo-video.mjs`: the "Demo footage" upload feed and its clusters, keyed
  idempotently on the feed name.
- `seed-demo-video-clusters.mjs`: rebuilds those clusters from the *real*
  detector output rather than the three hand-picked ones the original seed used.
- `seed-demo-video-reports.mjs`: carries settled clusters through to dispatched
  reports, doing what `src/lib/video/decide.ts` does on a `dispatch` decision.
- `seed-demo-contractor.mjs`: the Northside Paving LLC story: vendor row,
  completed capital job, live 24-month warranty, matching crew.
- `seed-city-documents.mjs`: municipal source documents backing the
  "under warranty" thread in the camera demo.
- `redate-demo-corpus.mjs`: shifts work-order dates so the staff calendar's
  current month is populated. The calendar plots `work_orders`, not `reports`.
- `create-demo-admin.mjs`, `set-passwords.mjs`: deterministic demo logins.
  **Demo only.** Both write known credentials; never point them at production.

## Media capture

Everything these produce is committed under `docs/images/` or
`public/landing-shots/`, so run them only when the corresponding screen changed.

- `shot-readme.mjs`: every README screenshot, light and dark.
- `shot-readme-gif.mjs`: the demo loop at the top of the README.
- `shot-social-preview.mjs`: the repository social card.
- `shot-theme.mjs`: forces a theme *before first paint* via `addInitScript`, so
  the capture is the real themed render rather than a flash-corrected one.
- `shot.mjs`: generic helper. Waits for the MapLibre canvas plus a settle delay;
  capturing a tile-loading map too early yields a blank basemap.
- `capture-hero-map.mjs`: bakes the live hero map to a static plate so the
  landing page ships an image instead of ~1.85 MB of maplibre + deck.gl.
- `gen-clay.mjs`: regenerates the claymorphism set in `public/landing-clay/`.

## Database and Open311 admin

- `run-migrations.mjs`: one-off runner reading `DATABASE_URL` from the
  environment. `pnpm db:migrate` (`supabase db push`) is the normal path.
- `apply-pending-and-backfill-ledger.mjs`, `fix-extras.mjs`, `setup-dashboard.mjs`,
  `setup-features.mjs`: historical repairs for migrations that partially rolled
  back against the pooler role. Idempotent, but they exist for a database that
  has already drifted; a database built from `supabase/migrations/` in order does
  not need them.
- `issue-api-key.mjs` / `revoke-api-key.mjs`: mint and revoke per-partner
  Open311 keys in the `api_keys` table (migration `028`).
- `fetch-video-model.mjs`: pulls the ONNX road-damage model the detector runs.
  Weights are deliberately not vendored.

## Verification

- `verify-classify.mjs`: headless end-to-end of the AI pipeline: create report,
  upload a raw JPEG, `POST /api/ai/classify`, read back the classification and
  work order, clean up.
- `deploy-vercel.mjs`: one-shot deploy for the hosted demo. Needs an
  interactive `npx vercel login` first.

## Ad-hoc probes: unmaintained

Kept for reference, not wired to anything, and not worth trusting without
reading first:

- `csp-probe.mjs`: collects CSP violations off `/city/cumming`. Genuinely handy
  when a new third-party script gets added.
- `inspect-local.mjs`, `verify-landing.mjs`: Windows-only paths baked in
  (`process.env.TEMP`, `C:\tmp\...`). They will fail on Linux and macOS as written.
- `inspect-riven.mjs`: points at an unrelated external site. Design-reference
  leftover; delete it the next time anyone is in here.
- `test3d.mjs`: the empirical check on whether Carto's free basemap carries
  building heights for Cumming. Standalone maplibre from a CDN; does not touch
  the app.

## Conventions

- `.mjs` for operational scripts, `.ts` (run through `tsx`) when the script needs
  to import real application types. `audit-privacy.ts` and `eval-classify.ts`
  both import from `src/` on purpose, so that a schema change breaks them.
- Credentials come from the environment. No script here reads a committed secret,
  and none should start.
- Anything that writes to the database is idempotent, or says in its header
  comment that it is a one-shot owner action.
