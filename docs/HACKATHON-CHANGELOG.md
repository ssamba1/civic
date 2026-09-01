# What was built during the event

A record of work done on 2026-08-31, the day of the HackSocial deadline. It
exists because "we found and fixed eight real defects today" is a claim that
should be checkable against `git log` rather than taken on trust.

Civic is built on an existing codebase, which [`SUBMISSION.md`](../SUBMISSION.md)
states plainly. This is the part that is not.

## The headline: eight defects, found by running the product

Every one was invisible to `pnpm typecheck`, `pnpm lint`, the unit suite, the
e2e specs and `pnpm build` — all of which were green throughout. Each was found
by opening the app, filing a real report, or calling the API, and each now has a
regression test that was verified to **fail** when the fix is reverted.

| # | Defect | How it presented |
|---|---|---|
| 1 | **AI classification dead for every filed report** | Pipeline read `{city}/{report}.jpg`; multi-photo had moved uploads to `{city}/{report}/{idx}.jpg`. Storage said "Object not found", a guard swallowed it, and every report came back `other` / confidence 0 / no crew. The unit test asserted the *old* path, so it had locked the bug in. |
| 2 | **`POST /api/open311/v2/requests` returned 500 to every request** | `photo_public_url` is NOT NULL and the route wrote `null`. A *correct* security fix — never store a caller-supplied `media_url` — left a required column with nothing to write. No test had ever posted a service request. |
| 3 | **`GET /requests/{id}` reported `other` for every report** | PostgREST returns a to-one embed as a bare object; the route read it with `[0]`. The list route had already been fixed for this; the sibling was missed. |
| 4 | **Open311 discarded the caller's `service_code`** | An agency filing `pothole` read back `other`, routed to General Services. |
| 5 | **Public status page unreachable for all 272 reports** | `public_token` is stamped lazily by the notifier; seeded reports are never notified, so every `/r/[token]` 404'd — taking the status page, share, CSAT and reopen with it. |
| 6 | **…and it threw on render once reachable** | A Server Component calling a `"use client"` snapshot. React throws, *after* headers streamed — so curl saw `200` and a browser saw "A server error occurred". |
| 7 | **Every light-theme delta chip failed WCAG AA** | All six pastel pairs measured 3.40–4.13:1 under the 4.5 floor, beneath a comment claiming they were "AA-tuned". |
| 8 | **Both PWA icons 404'd** | `manifest.json` declared `/icons/*`; `public/icons/` never existed. Every Add to Home Screen fell back to a browser glyph. |

Plus a live security exposure re-verified and written up rather than left in a
migration header nobody opens:
[`docs/runbooks/APPLY-068-NOW.md`](runbooks/APPLY-068-NOW.md).

## The common thread

Seed data writes classifications and work orders **directly**, bypassing the
pipeline, and never triggers a notification. So the dashboard looked perfect
while the paths a real resident and a real agency use were broken. Six of the
eight were invisible from the seeded demo.

That is now the centre of the submission's *What we learned*.

## What else landed

- **The README**, rewritten from a 349-line feature list into an argued case:
  14 screenshots captured from the running app in light and dark, a recorded
  demo loop, a generated social-preview card, mermaid pipeline and ER diagrams,
  the crew comparator quoted in full, and eight dispatch chains pulled from the
  database rather than invented.
- **`SUBMISSION.md`** — inspiration, tech stack, and seven learnings drawn from
  defects this repository actually shipped.
- **Accessibility to 100** on `/` and `/report` (mobile), 50 audits passed, 0
  failed.
- **Production runtime actually run**, not just built — standalone server
  booted, healthy, every route walked in a browser.
- **Repo hygiene**: MIT licence GitHub can detect, 14 MB of discarded design
  iterations removed, session scaffolding removed, a scratch probe removed, the
  contract file stopped pointing at two documents that never existed, and
  `.env.example` completed.

## Verify it yourself

```bash
git log --since="2026-08-31 00:00" --reverse --format='%h %ad %s' --date=format:'%H:%M'
```

Thirty-two commits, 17:29 to 22:12 EDT. Every fix above names its symptom, its
root cause, and why the existing checks missed it.
