# src/components/

153 components across 23 groups. One concern per file, tests beside the code.

Grouped by **the surface they appear on**, not by shape. There is no
`molecules/`, and a component used by exactly one route lives in that route's
group rather than in a shared bucket.

## Groups

| Group | For |
| --- | --- |
| `ui/` | The primitive layer. Radix-backed and unaware of Civic. |
| `landing/riven/` | The public landing page. Self-contained; see below. |
| `report/` | Resident intake. Camera capture, chat intake, duplicate check, emergency interstitial, comment thread. |
| `resident/` | The signed-in resident surface, bottom tab bar, my reports, notifications feed, community pulse, trending. |
| `map/` | MapLibre and Cesium views, popups, pin icons, clustering glue. |
| `dashboard/`, `city/` | The `/city/[slug]` shell: sidebar, stat cards, category chart, work-order grid, explorer, detail. |
| `teams/`, `crews/`, `members/` | Team routing matrix, delegation, crew panels, rosters, member detail and badges. |
| `staff/` | Bulk action bar, duplicate merge panel, route plan, schedule calendar. |
| `analytics/` | The bento analytics page and its primitives, heatmaps, district rollups. |
| `admin/` | Platform admin panels, API keys, automation rules, boundary map, compliance, contractors, import wizard. |
| `liability/`, `camera-demo/`, `contractor/` | The claims queue, the fixed-camera demo, the vendor dashboard. |
| `routing/` | The routing flow diagram, drawn from the same tables dispatch reads. |
| `assistant/`, `calendar/`, `filters/`, `qr/`, `auth/`, `legal/` | Single-purpose, small. |

Seven files sit at the root, `city-header`, `city-nav`, `city-sidebar`,
`theme-toggle`, `view-switch`, `env-switch`, `print-button`. Cross-surface chrome
that belongs to no single group.

## `ui/` is the only group anything may import freely

`ui/` holds primitives: `button`, `card`, `input`, `select`, `modal`, `drawer`,
`toast`, `switch`, `field`, `badge`, `stepper`, `bottom-sheet`, plus a few
heavier ones (`resizable-split`, `projects-table`, `liquid-glass`, `map`).

Nothing in `ui/` may import from a domain group, know about a report, or reach
for a Supabase client. The dependency arrow points one way: domain groups import
`ui/`, never the reverse. That is what keeps the primitives reusable rather than
quietly coupled to the dashboard.

## `landing/riven/` breaks the naming convention on purpose

Everything in this repository is kebab-case. That folder is PascalCase,
`BentoHero.tsx`, `ZampSections.tsx`, `MapPinStory.tsx`: and carries its own CSS
files (`zamp.css`, `bento-hero.css`, `riven-landing.css`) rather than using
Tailwind utilities throughout.

It was built as a self-contained marketing surface and kept that way. Don't
"fix" the casing in a drive-by: the folder is imported as a unit by `/` and the
rename is pure churn. Don't copy the convention outward either.

`ZampMapBackdropLazy.tsx` exists because the live map is ~1.85 MB of JS; the
landing page ships a static plate by default and only mounts the real map behind
a tweak flag.

## Client vs server

133 of 153 components are `"use client"`. That is high, and it is honest to say
why rather than pretend otherwise: this is a dashboard product, and maps, grids,
filters and live-updating panels all need the browser.

It is still not a licence. `"use client"` at the top of a file makes everything
it imports client code too, so the marginal cost of one more is small but the
cost of putting it too high in the tree is not. Push the directive **down** to
the interactive leaf, and let the page above it stay a server component that
fetches data.

## Conventions

- Components take props. A component that reaches for a Supabase client directly
  is a smell; the route segment owns fetching.
- Co-locate tests as `foo.test.tsx`. Coverage here is thin (three files). Most
  logic is tested in `lib/`, which is the right place for it, but a component
  with real branching deserves its own test.
- Tailwind v4 utilities and shadcn/ui patterns, except in `landing/riven/`.
- MapLibre GL via `react-map-gl`, plus deck.gl for data layers. **Not Mapbox**.
  There is no Mapbox token anywhere in this project.
- Marker clustering goes through supercluster at the data layer; naive clustering
  breaks past a few thousand points.
