# e2e/

Playwright smoke specs. Seven files, run with `pnpm test:e2e`.

These are smoke tests, deliberately. They prove a screen mounts, a route
answers, and an auth gate holds, the class of breakage that unit tests cannot
see because it only appears once the real server, the real bundle and the real
database are in the same process. Anything that can be asserted without a
browser belongs in a vitest file next to the code instead.

## Ownership boundary

Playwright owns `e2e/`. Vitest owns `src/**/*.test.ts`. Neither picks up the
other's files, and that separation is load-bearing: a Playwright spec under
`src/` would be run by vitest without a browser and fail confusingly.

## Running them

```bash
pnpm test:e2e                       # boots a dev server if one isn't up
E2E_PORT=3100 pnpm test:e2e         # when another checkout holds 3000
E2E_BASE_URL=https://… pnpm test:e2e  # against an already-deployed target
```

`reuseExistingServer` is on outside CI, which is a convenience with one sharp
edge worth knowing before it costs you an afternoon: with a hardcoded port, the
suite silently *attaches* to whatever dev server already holds 3000, including
a fork of this checkout, and reports that app's results as this one's. That is
why the port is environment-driven. If results look impossible, check what is
actually listening before you debug the test.

CI retries once; local runs do not retry, so a local failure is a real failure.
Traces are retained on failure only.

## The specs

| Spec | What it protects |
| --- | --- |
| `submit-report.spec.ts` | `/report` mounts its capture step, and exposes the file-upload fallback when no camera is available. The fallback is the path most residents on desktop actually take. |
| `dedup-deflection.spec.ts` | Uploading a photo advances capture → preview, the transition dedup runs behind. |
| `staff-triage.spec.ts` | `/teams` renders the picker, `/city/cumming` loads without a client crash, and the `sla-escalate` / `notify-drain` admin endpoints 401 without a session and reject a wrong bearer token. |
| `open311-api.spec.ts` | GeoReport v2 conformance over HTTP: the service list in JSON, XML content negotiation, a single service definition plus its 404, the request array, an unknown token 404, and `POST /requests` rejected 401 without an `api_key`. |
| `globe-map.spec.ts` | The Cesium globe renders pins at `/city/cumming/map`, the controls swap back to the MapLibre renderer, and no CSP violation is logged while doing it. |
| `video-console.spec.ts` | The clip theater: transport bar, populated rail, playhead advancing on Play, seeking from a rail item, a settled detection expanding its report, and the detector overlay drawing boxes during playback. |
| `assistant.spec.ts` | The landing page renders and the assistant launcher matches its feature flag. |

## Conditional skips

Two kinds, and the difference matters when reading a green run.

**Flag-shaped.** `assistant.spec.ts` asserts the launcher is *absent* when
`NEXT_PUBLIC_HELP_ASSISTANT` is off, and only skips the interaction tests. Both
deploy shapes are therefore checked rather than one being waved through.

**Data-shaped.** `video-console.spec.ts` skips individual assertions when the
seeded corpus has no cluster with a signed frame URL. A green run of that file
against an unseeded database is not evidence the video console works, seed
first (`pnpm demo:seed`) if that is what you are trying to establish.

## Adding one

Assert on user-visible text and roles rather than class names; the landing and
dashboard styling churns and selector-coupled specs rot within a week. If a
spec needs seeded rows, guard it with an explicit `test.skip` and a reason
string, so a skip on a bare database reads as a skip and not as a pass.
