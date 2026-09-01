# docs/

Written context. Read the doc before the code. The design doc wins where it
and `agents.md` disagree, and that conflict is worth flagging rather than
quietly resolving.

```
decisions/    ADRs, choices that closed off alternatives
runbooks/     on-call procedures
planning/     product context, design, plans, shipped log
compliance/   SOC 2 and GovRAMP readiness notes
superpowers/  per-feature plans and specs, dated
images/       README and doc screenshots (generated, see below)
```

## Stale paths to know about

`agents.md` cites **`docs/CONTEXT.md`** and **`docs/DESIGN.md`**. Neither path
exists. The files are:

| Cited as | Actually at |
| --- | --- |
| `docs/CONTEXT.md` | `docs/planning/context.md` |
| `docs/DESIGN.md` | `docs/planning/design.md` |

Similarly, `planning/SHIPPED.md` opens by saying it complements `STATE.md` and
`REVAMP_PLAN.md`. Both were removed when session scaffolding was cleared out of
the repository; SHIPPED.md is now the only surviving member of that trio.

Neither is worth a silent redirect, noted here so the next reader stops
searching, and so whoever next edits `agents.md` fixes the citation at the
source.

## `decisions/`: ADRs

Eight, numbered and dated, each with a status:

| ADR | Subject |
| --- | --- |
| 0001 | fcamera image MIME correctness, reasoning hybrid, scalability posture |
| 0002 | Target segment |
| 0003 | Map clustering via supercluster |
| 0004 | SLA due dates and escalation |
| 0005 | Cross-jurisdiction routing |
| 0006 | Open311 API keys |
| 0007 | Open311 dual format (JSON + XML) |
| 0008 | CSP hash strategy |

Write one when a choice **closes off an alternative**. Not for every decision.
The test is whether a competent person arriving later would otherwise
reasonably ask "why not the obvious other thing?" Record the reasoning even for
calls later reversed; a project that logs only its successes teaches nobody
anything, including its own authors three days on.

## `runbooks/`: what to do when it breaks

`ai-pipeline`, `video-pipeline`, `open311-conformance`, `prod-cutover`,
`api-key-rotation`, `notification-delivery`, `routing-enablement`,
`sla-escalate`.

These document the system **as it is**, not as designed. The AI pipeline runbook
is explicit that the synchronous path is the default and the only one exercised
in the demo, and that the async path is flagged off and must behave
byte-identically when off. Keep that habit: a runbook describing the intended
system is worse than none, because it is consulted under pressure.

## `planning/`

`context.md` (problem, market, GTM, personas, business model) and `design.md`
(architecture, data model, AI pipeline, alternatives considered) are the two
that matter for substantive work.

`SHIPPED.md` is the chronological record of what actually landed, newest last,
indexed by PR. It is the honest answer to "does this exist yet?", the other
planning files describe intent, and intent and reality have diverged here
before.

The rest, `PLAN.md`, `NEXT_100.md` / `NEXT_100_v2.md`, `OUTFLANK.md`,
`ADVANCED_ROUTING.md`, `VIDEO_PIPELINE.md`, `ONBOARDING*.md`, the `F*` specs,
are working documents at varying ages. Treat them as proposals unless SHIPPED.md
confirms they landed.

## `superpowers/`

`plans/` and `specs/`, filenames date-prefixed (`2026-08-23-camera-liability-pipeline.md`).
Per-feature and frozen at their date. A historical record of how a feature was
approached, not a description of current behaviour. When one contradicts the
code, the code is right and the plan is simply old.

## `images/`

**Generated. Do not edit by hand.** Light and dark pairs of every README
screenshot, plus `demo.gif` and `social-preview.png`.

| To regenerate | Run |
| --- | --- |
| Every screenshot | `node scripts/shot-readme.mjs` |
| The demo loop GIF | `node scripts/shot-readme-gif.mjs` |
| The social card | `node scripts/shot-social-preview.mjs` |

All three drive a running app, so start `pnpm dev` and seed first. Screenshots
of an unseeded database are how a README ends up showing an empty dashboard.

## `compliance/`

`soc2-readiness.md` and `govramp-readiness.md`. Readiness assessments, gap
analyses against the controls. Not certifications, and nothing here should be
cited as though the project holds either.
