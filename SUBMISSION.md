# Civic — HackSocial submission

**Track: AI/ML**

Repository: <https://github.com/ssamba1/civic> · Full technical write-up: [`README.md`](README.md)

---

## Inspiration

Every city has a version of the same broken loop. A resident notices something
wrong — a pothole, a dead streetlight, a sidewalk that has heaved into a trip
hazard — reports it, hears nothing, and concludes the city does not care.

The city usually does care. What it does not have is an hour.

We went looking for where the time actually goes, and it is not where you would
guess. It is not the crews. Small-city public works departments are not
generally sitting idle waiting for work. The bottleneck is the step *in front*
of the crews: a 311 report arrives as free text — *"there's a big hole on
Dahlonega near the church"* — and a person has to read it, decide it is a
pothole, guess how bad it is, work out that Streets & Roads owns it, check
whether the same hole was already reported on Tuesday, and open a work order.

In a city the size of Cumming, Georgia — our pilot — that person is often also
doing three other jobs. So the reports pile up, and the backlog everyone blames
on budget or on crews is really a backlog of **unstaffed triage**.

That is a strange thing to have discovered in 2026, because reading a
photograph and putting it in a category is close to the single thing modern
vision models are unambiguously good at. The interesting question was not
whether AI could do the triage. It was **how much of the process you dare let
it touch** — because the output here is not a recommendation feed, it is public
money and a truck.

So the whole project is built around one line: **the model classifies, and it
never dispatches.**

## What it does

A resident photographs a problem. Before the photo leaves the phone, faces and
plate zones are blurred and EXIF is stripped. On the server, Gemini reads the
image into a category, a severity and an emergency flag. Everything after that
is deterministic code you can read:

- a duplicate check against open reports within 50 m from the last 30 days, in
  PostGIS, so the twentieth report of one pothole raises that job's priority
  instead of creating a twentieth job;
- a work order with a department, crew type, materials, estimated minutes and a
  cost computed from a rules table — never from the model;
- a crew picked by a pure comparator: staffed crews first, then lowest workload
  *per person*, then queue depth, then least-recently-assigned;
- an SLA clock, a public map, and the whole record exportable as Open311
  GeoReport v2 in XML and JSON.

A public works director opens the dashboard to *manage* work, not to *create*
it. There is no inbox of unread reports on that screen, and that absence is the
product.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript strict, React Server Components by default |
| AI | Vercel AI SDK + **Gemini 2.5 Flash-Lite** for vision classification; full Flash for the help assistant |
| Database | Supabase Postgres + **PostGIS**, `geography(POINT,4326)` with a GiST index |
| Auth & storage | Supabase Auth; two buckets — `photos-public` (blurred) and `photos-raw` (restricted, 30-day TTL) |
| Maps | MapLibre GL + deck.gl (no Mapbox token, no per-view billing) |
| UI | Tailwind CSS v4, shadcn/ui (Radix), AG Grid for the work-order table, GSAP |
| Interop | Open311 GeoReport v2, XML + JSON |
| Quality | Vitest (1,419 tests), Playwright, SQL row-level-security suites, Biome, Sentry |

Server components are not a style preference here — they are what keeps the
model API key server-side by construction. `"use client"` is the exception, and
`/api/ai/*` is the only path that talks to Gemini.

## What we learned

**1. A model in a money-spending workflow needs a hard boundary, not a
confidence threshold.** Our first instinct was to gate on confidence — below
some number, route to a human. It is the wrong control. It drops exactly the
reports a person most needs to see, and it makes the system's behaviour depend
on a number nobody can defend. Confidence is now *displayed* to staff and never
gates anything. A pothole in our seeded data routes correctly at 0.60. A
misclassification delays a job; it can never invent one, misprice one, or
silently drop one.

**2. Green checks tell you the code agrees with itself, not that the product
works.** We shipped a bug class where lookup tables written as
`Record<ReportCategory, …>` were indexed at runtime with a city's own
`custom_` category. The worst instance: a report was saved, then the work-order
lookup threw on `undefined`, *after* the classification had been persisted — so
the report existed, no job was ever created, nothing was dispatched, and the
resident saw a thank-you screen. Type-check, lint, 1,419 tests and the
production build were all green the entire time. It was found by opening the
app and reading a screenshot. The fix was three accessors with an `other`
fallback, not twenty patches.

**3. Every one of our real bugs failed silently.** A `200 OK` with an empty
array. A saved report with no job. An email that rendered the literal word
`undefined` to a resident. A build that *warned* instead of failing and wrote
its entry point to the wrong directory. None of them threw where anyone was
looking. We now distrust any code path whose failure mode is "returns nothing".

**4. Verify with the command CI runs, not a friendlier version of it.** We
checked lint with `biome check --write`, which fixes problems and then reports
success. CI runs `biome check`, which reports them and exits 1. The difference
turned a "verified" push into a red badge.

**5. The database decides your data's shape at runtime, and TypeScript cannot
help.** PostgREST returns an embedded relation as an array for to-many and a
bare object for to-one — and the shape flips the day a migration adds a unique
constraint. Our Open311 export validated arrays only, so every row failed
validation and the public feed returned `200 OK` and an empty list while the
table was full. For a public accountability record, that is the worst possible
failure: indistinguishable from a city that has never filed anything.

## Honest limits

Stated in full in the [README](README.md#6-honest-limits). The short version:
there is no live deployment, the seeded reports are synthetic (no resident of
Cumming has filed anything here and the city has not adopted this), the
analytics figures are labelled sample data in the product itself, and the
privacy blur is a heuristic that leaves the middle third of the frame
unblurred — a deliberate trade, documented in the source, because blurring the
whole frame would hide the defect the photo exists to report.

## Team

**Sricharan Samba · Soham Gugale · Shritan Kommareddy · Siddartha Guntupalli**
