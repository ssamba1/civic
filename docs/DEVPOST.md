# Civic: a resident photographs it, the work order writes itself

> Submission text for the Devpost project story field. It overlaps [`../SUBMISSION.md`](../SUBMISSION.md) on purpose, because Devpost wants a self-contained narrative rather than a link. Every figure quoted here was read from a real run, and `README.md` is the source of truth for all of them. When you update a number in one, grep for it in the others. They have drifted before.
>
> **Paste note:** the story below is deliberately not hard-wrapped. One line per paragraph and per bullet. Wrapped lines break list items into one bullet per line when pasted into a web form, and lost code fences let `==` inside `!==` get eaten as markdown highlight syntax.

## Inspiration

Every city has a version of the same broken loop. A resident notices something wrong (a pothole, a dead streetlight, a sidewalk that has heaved into a trip hazard), reports it, hears nothing, and concludes the city does not care.

The city usually does care. What it does not have is an hour.

We went looking for where the time actually goes, and it is not where you would guess. It is not the crews. Small public works departments are not generally sitting idle waiting for work. The bottleneck sits *in front* of the crews. A 311 report arrives as free text, *"there's a big hole on Dahlonega near the church"*, and a person has to read it, decide it is a pothole, guess how bad it is, work out that Streets & Roads owns it, check whether the same hole was already reported on Tuesday, and open a work order.

In a city the size of Cumming, Georgia, our pilot, that person is often also doing three other jobs. So reports pile up, and the backlog everyone blames on budget or on crews is really a backlog of **unstaffed triage**.

That is a strange thing to have discovered in 2026, because reading a photograph into a category is close to the single thing modern vision models are unambiguously good at. The interesting question was never whether AI could do the triage. It was **how much of the process you dare let it touch**, because the output here is not a recommendation feed. It is public money and a truck.

So the whole project is built around one line: **the model classifies, and it never dispatches.**

## What it does

A resident photographs a problem. Before the photo leaves the phone, faces and plate zones are blurred and EXIF is stripped. On the server, Gemini reads the image into a category, a severity and an emergency flag. Everything after that is deterministic code you can read and test:

- A duplicate check against open reports within 50 m from the last 30 days, so the twentieth report of one pothole raises that job's priority instead of creating a twentieth job.
- A work order carrying a department, crew type, materials, estimated minutes and a cost computed from a rules table.
- A crew chosen by a pure comparator, with no model call in it.
- An SLA clock, a public map, and the whole record exportable as Open311 GeoReport v2 in both XML and JSON.

A public works director opens the dashboard to *manage* work, not to *create* it. There is no inbox of unread reports on that screen, and that absence is the product.

## How we built it

**The boundary is the architecture.** Gemini decides what the photograph shows. Every allocation after that is a deterministic function of that answer.

Priority is arithmetic, not vibes, so two reports with identical inputs always rank the same way and a director can be told exactly why one outranked another:

$$\text{priority} = 2s + r + 50e$$

Here \\(s\\) is severity from 1 to 5, \\(r\\) is the recurrence count from the duplicate check, and \\(e\\) is 1 for an emergency and 0 otherwise. The weight of 50 means an active hazard cannot be outranked by accumulated nuisance reports.

Cost is equally boring, on purpose:

$$\text{cost} = \text{labor rate} \times \text{estimated minutes} + \text{material cost}$$

The moment a language model produces the dollar figure on a municipal work order, that figure has to be defended in a public meeting by someone who cannot explain how it was reached. A rules table can be printed and argued with.

**Deduplication happens in the database, before a work order exists.** Spherical distance in PostGIS against a GiST index, never haversine in application code:

```sql
SELECT id FROM reports
WHERE status = 'open'
  AND ST_DWithin(location, ST_MakePoint($1, $2)::geography, 50)
  AND created_at > now() - interval '30 days';
```

**Crew assignment is a five-criterion comparator.** Load is measured per capita, open minutes divided by crew size, so a six-person crew absorbs proportionally more than a two-person crew before it looks loaded. Ranking by raw queue depth would quietly punish small crews for being small. In order: staffed crews before empty shells, then lowest load per person, then shallowest queue, then least recently assigned, then crew name.

```ts
const sorted = [...candidates].sort((a, b) => {
  const aStaffed = a.memberCount > 0;
  const bStaffed = b.memberCount > 0;
  if (aStaffed !== bStaffed) return aStaffed ? -1 : 1;

  const loadA = loadPerCapita(a);   // openMinutes / members
  const loadB = loadPerCapita(b);
  if (loadA !== loadB) return loadA - loadB;

  if (a.openWorkOrders !== b.openWorkOrders)
    return a.openWorkOrders - b.openWorkOrders;

  const lastA = a.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
  const lastB = b.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
  if (lastA !== lastB) return lastA - lastB;
  return a.name.localeCompare(b.name);
});
```

That last tiebreak on the crew's name exists so that re-running the pipeline picks the same crew. A dispatcher that shuffles on every retry is one no operator can reconcile against yesterday's list.

**Categories and divisions are data, not code.** Twelve categories ship built in. A city adds its own as rows through an onboarding wizard, and the classifier is offered the union of the builtins and that city's own types on every request.

**The video vertical exists to make the cost argument.** A city can mount a phone on a truck that already drives every street, which produces far denser pavement data than residents ever will, and a ruinous model bill if every frame goes to a vision model. So the model runs last, not first. A local ONNX detector scans frames for free, Postgres clusters the detections, and only a cluster that survives a confidence threshold costs a model call. Model calls scale with clusters, not with frames:

$$\text{model calls} \le |\text{clusters}| \ll |\text{frames}| \qquad (33 \ll 375)$$

On the seeded clip, 375 frames produced 531 detections, which collapsed to 33 spatial clusters and 27 dispatched reports, because the same pothole appears in dozens of consecutive frames and the clustering knows it is one defect.

The stack: Next.js 16 App Router with React Server Components by default, TypeScript strict, Supabase Postgres with PostGIS, Gemini 2.5 Flash-Lite through the Vercel AI SDK, MapLibre GL and deck.gl for maps (no Mapbox token, so no per-view billing), Tailwind v4 and shadcn/ui, AG Grid for the work-order table.

Server components are not a style preference here. They are what keeps the model API key server-side by construction. `"use client"` is the exception, and `/api/ai/*` is the only path that talks to Gemini.

## Challenges we ran into

**Every single one of our real bugs failed silently.** Not one threw where anyone was looking.

**The demo was healthy while the product was broken.** Hours before submitting, we filed a report through the UI for the first time in a while. It came back classified `other`, confidence 0, no crew, "queued for manual triage". The pipeline was downloading the photo from `{city}/{report}.jpg`, but multi-photo submission had moved uploads to `{city}/{report}/{idx}.jpg` some time earlier. Storage answered "Object not found", a guard written to stop a missing photo from killing the pipeline swallowed it exactly as designed, and **every report filed by a human lost its AI classification**, while the dashboard looked perfect. The dashboard looked perfect because the seed script writes classifications directly instead of going through the pipeline. The unit test asserted the old path, so it had not missed the bug so much as locked it in. Both sides now derive the path from the same function the uploader uses. Same photo after the fix: `pothole`, confidence 0.95, routed to public works, paving, 30 minutes, `$98`.

**The public feed returned `200 OK` and an empty list while the table was full.** PostgREST returns an embedded relation as an array for to-many and a bare object for to-one, and the shape flips the day a migration adds a unique constraint, which `work_orders.report_id UNIQUE` is. Our Open311 row schema accepted arrays only, so every row failed validation and was silently dropped. For a public accountability record that is the worst available failure, because it is indistinguishable from a city that has never filed anything.

**Lookup tables typed as complete were indexed with keys that did not exist.** Tables written as `Record<ReportCategory, ...>` were indexed at runtime with a city's own `custom_` category. The worst instance saved the report, then threw on `undefined` in the work-order lookup *after* the classification had been persisted. The report existed, no job was ever created, nothing was dispatched, and the resident saw a thank-you screen. The fix was three accessors with an `other` fallback, not twenty patches.

**We verified with a friendlier command than CI runs.** We checked lint with `biome check --write`, which fixes problems and then reports success. CI runs `biome check`, which reports them and exits 1. That difference turned a "verified" push into a red badge.

## What we learned

**A model in a money-spending workflow needs a hard boundary, not a confidence threshold.** Our first instinct was to gate on confidence: below some number, route to a human. It is the wrong control. It drops exactly the reports a person most needs to see, and it makes the system's behaviour depend on a number nobody can defend. Confidence is now displayed to staff and gates nothing. A pothole in our seeded data routes correctly at 0.60. A misclassification delays a job. It can never invent one, misprice one, or silently drop one.

**Green checks tell you the code agrees with itself, not that the product works.** Type-check, lint, 1,420 tests and a production build were green through every bug above. All of them were found by opening the app and reading a screenshot.

**Distrust any code path whose failure mode is "returns nothing."** A `200 OK` with an empty array, a saved report with no job, an email that rendered the literal word `undefined` to a resident, a build that warned instead of failing and wrote its entry point to the wrong directory.

**Applying migrations one at a time to a live database hides a whole class of defect.** We now replay all 77 migrations into an empty PostGIS database in CI on every push, because that is what standing up a new city actually does. It needs no secrets, so it runs on forks too.

## Accomplishments we are proud of

Open311 is the product, not an integration. Checked live rather than asserted: 153 service requests in both JSON and XML across 12 service codes and 6 responsible agencies, with `expected_datetime` computed from the per-category SLA. An export that works is the difference between a city owning its own record and renting it from a vendor.

The rest of the evidence: 1,420 unit tests across 136 files, 45 row-level security assertions across 11 suites, 7 Playwright specs, 96 routes compiling with 42 prerendered, and Lighthouse at 100/100/100 for accessibility, best practices and SEO on the landing and report pages. We deliberately do not quote a performance score, because our only Lighthouse run was against a dev server, where the number measures the bundler rather than the product.

The resident side needs no account. The public status page is keyed on an opaque salted token, never a report id, because requiring a login is how a city loses the reporter, and it is translated into six languages.

## Honest limits

We would rather you heard these from us.

- **The seeded reports are synthetic.** They are realistic, with real street names and real classifications produced by the real pipeline, but no resident of Cumming has filed anything here and the city has not adopted this.
- **A hosted demo exists only if a URL is linked from the repository README.** The database, seed data, build and running app are all real, and the production standalone server has been run and smoke-tested, but we are not claiming a deployment that is not there.
- **The analytics figures are labelled sample data inside the product itself,** because peer benchmarking has no real peer dataset behind it yet.
- **The privacy blur is a heuristic, not face detection,** on every browser that matters. `FaceDetector` is absent on iOS Safari, Firefox and unflagged Chrome. The fallback blurs the top and bottom thirds, so a centre-framed face can reach the public bucket. That is a deliberate trade, documented at the top of the source file, because blurring the whole frame would hide the defect the photo exists to report.
- **There is no offline capture.** A resident with no signal cannot file yet.

## What's next

Offline capture with client-minted ids, a real face detector behind the heuristic, and a pilot with an actual city so the numbers on the analytics page stop being labelled sample data.

## Team

Sricharan Samba, Soham Gugale, Shritan Kommareddy, Siddartha Guntupalli.

---

<!-- Reference for the other Devpost form fields. Not part of the Project Story text. -->

## Form field reference

### If the code blocks still break when pasted

Devpost's editor may strip fences. Check the preview for two things before you submit:

1. `!==` must still read `!==` in the comparator. If it shows as `!`, the fence was lost and `==` was parsed as highlight syntax. Re-add the fences in the editor, or delete the two code blocks and keep the prose, which describes both without them.
2. `$98` and the `$1, $2` in the SQL must not be swallowed by math mode. They are wrapped in backticks and a fence for that reason.

### Built with (25 tags)

```
next.js, react, typescript, supabase, postgresql, postgis, google-gemini,
vercel-ai-sdk, tailwindcss, shadcn-ui, radix-ui, maplibre, deck.gl, cesium,
open311, playwright, vitest, biome, sentry, ag-grid, gsap, onnx, fastapi,
python, twilio
```

### Try it out links

- Source code: `https://github.com/ssamba1/civic`
- Technical write-up: `https://github.com/ssamba1/civic/blob/main/README.md`
- Add a live deployment link only if one is actually running. The Honest limits section says there is none unless the README links one, so a dead link here would contradict the story.

### Image gallery order

Devpost asks for a 3:2 ratio. The desktop captures are 2880x1800 (8:5), which crops cleanly. The two phone shots are portrait and will letterbox.

| # | File | Why it is in this position |
| --- | --- | --- |
| 1 | `docs/images/landing.jpg` | The live map with real pins and the two pipeline callouts. Reads in one second. |
| 2 | `docs/images/dashboard.png` | Eleven divisions with queue depth, oldest open item and mean time to repair. The one screen that explains the product. |
| 3 | `docs/images/demo.gif` | Motion, 3.3 MB, under the 5 MB cap. The routing page fanning reports into divisions. |
| 4 | `docs/images/routing.png` | Live counts on every node, drawn from the same tables dispatch reads. |
| 5 | `docs/images/video.jpg` | The 375 frames to 27 reports argument, with detector boxes on the playhead. |
| 6 | `docs/images/grid.png` | Where a public works director actually lives. |
| 7 | `docs/images/report.png` | Resident intake on a phone, camera first. |
| 8 | `docs/images/status.png` | The public status page, no account required, six languages. |
| 9 | `docs/images/analytics.png` | Carries its own sample-data banner, which supports the honesty claim. |
| 10 | `docs/images/map.jpg` | 199 reports on the real street network with the dispatch panel. |
