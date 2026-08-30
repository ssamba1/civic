# NEXT 100 v2 — the roadmap after the first 100

> Compiled 2026-08-30 from a line-by-line code audit of `docs/planning/NEXT_100.md` (v1, 2026-07-08) against `main` @ `0d4782d`.
>
> **v1 scoreboard: 43 SHIPPED · 32 PARTIAL · 25 NOT BUILT.** v2 does not re-list the 43. It picks up the 32 partials (most are one wire away from real), the 25 unbuilt items still worth building, and — the bigger half — the **capabilities that landed since v1 and have no roadmap at all**: the video damage-mapping pipeline, fleet-camera ingest, liability→claims attribution, city documents + RAG, and the org_units routing engine. Those five shipped as demos on a golden path; none is operable by a city yet.
>
> **Legend:** Impact 1–5. Effort S/M/L/XL. Moat = defensibility. `→` = the file that already exists and needs finishing.

---

## The honest read

Three things are true about the codebase after v1:

1. **Breadth is done; depth is not.** 43 features shipped and ~70 routes exist. Almost nothing has an operations story — no queue, no worker, no deploy target, no alerting on the pipelines that now run AI inference on a request lifecycle.
2. **The strongest new assets are the least finished.** Video, camera, liability and claims are the only capabilities no competitor has *at all*. They exist as a scripted demo (`/demo/camera`) and a console over seeded data. Turning them into something a city can run against a real truck fleet is the highest-leverage work available.
3. **Two features are dark for want of a secret, not code.** Email/SMS delivery (v1 #1) and the golden-set eval gate (v1 #36) have complete implementations and no credentials/corpus. They are the cheapest wins on this list and have been blocked for seven weeks.

Priority order this implies: **finish the dark code → operationalize the vision pipelines → close the procurement gates → then breadth.**

---

## A. Ship the dark code (highest ROI — code exists, nothing runs)

1. **Turn on Resend + Twilio for real.** `deliver.ts`/`deliver-sms.ts` are wired into `status-notify.ts:188,205` and send nothing. Add `RESEND_API_KEY`, `TWILIO_*` to `.env.example`, a `/api/health` delivery probe, and a bounce/failure log table. Impact 5, Effort S. → `src/lib/notify/deliver.ts`
2. **Label the golden set and gate CI on it.** `tests/golden/images/` is empty; `scripts/eval-classify.ts` runs. 60–100 labeled photos + a CI job that fails under a per-category accuracy floor. Impact 4, Effort M. → `scripts/eval-classify.ts`
3. **Web Share Target POST handler.** `public/manifest.json` declares `share_target` at `/report` and no POST route exists — the manifest advertises a 405. Impact 3, Effort S. → `src/app/report/`
4. **Finish the connector scaffolds or delete them.** `connectors.ts` self-labels "SCAFFOLDS" for Cityworks/Accela/ArcGIS/Tyler/Salesforce, is env-gated, and is called on every status change. Pick Cityworks, build it against a real sandbox with retries + a dead-letter table; mark the rest explicitly unbuilt. Impact 5, Effort L, Moat high. → `src/lib/integrations/connectors.ts`
5. **Real SAML assertion validation.** `src/lib/auth/sso.ts:3` says no live IdP. Signature verify, clock skew, replay cache, IdP metadata parse — or gate `/admin/sso` behind a "not for production" flag. Impact 4, Effort M. *(security-critical: a half-SSO is worse than none)*
6. **Crew-dispatch SMS send path.** Phones stored (migration 029), sender exists, nothing calls it on assignment. Impact 3, Effort S. → `src/lib/notify/deliver-sms.ts`
7. **Resident-facing weather alerts.** `storm-advisory.ts` feeds `/api/admin/surge` only. Same signal → "flooding likely on your street" to subscribed residents. Impact 3, Effort M. → `src/lib/weather/storm-advisory.ts`
8. **Materials + labor entry UI.** Columns exist (`materials` jsonb, `actual_minutes`, `actual_cost`); no way for a crew to fill them, so every cost analytic runs on estimates. Impact 4, Effort M. → `src/app/city/[slug]/team/[teamId]/field/`
9. **Public CSAT trend surface.** `report_csat` collects ratings; no public rolling %. One card on `/city/[slug]` = accountability pressure. Impact 3, Effort S. → `src/lib/notify/csat.ts`
10. **Translate the intake form, not just the status page.** `translate.ts` is applied at `/r/[token]` only. Impact 4, Effort S. → `src/app/report/page.tsx`
11. **Offline submit queue.** The service worker caches reads; a report composed offline is lost. IndexedDB queue + background sync. Impact 4, Effort M. → `public/sw.js`
12. **Estimated-fix confidence band.** `/r/[token]` shows a hard `due_at`; show "usually 3–6 days for this category here" from real MTTR. Under-promising beats a missed date. Impact 4, Effort M. → `src/app/r/[token]/page.tsx:235`

## B. Video, camera & liability — from demo to operable (the uncontested moat)

13. **RTSP puller worker.** `VIDEO_PIPELINE.md` Phase 2. Long-running process outside Next.js chunking live streams into `video_clips`. Schema ready; this is deploy infra. Impact 5, Effort L, Moat very high.
14. **Move clip processing off `after()` onto a real queue.** Inference on the request lifecycle will fall over at volume; it also blocks retry-on-failure. Impact 5, Effort M. → `src/lib/video/pipeline.ts`
15. **Detector golden set + accuracy gate.** Mirror `pnpm eval` for the ONNX detector. No accuracy number exists today for the thing that files work orders automatically. Impact 5, Effort M. → `services/detector/`
16. **Phone-as-dashcam PWA.** `VIDEO_PIPELINE.md` Phase 3, kind `phone`. Turns every city truck into a sensor with zero hardware spend. Impact 4, Effort L, Moat very high.
17. **Camera-ingest operator console.** `/api/camera/frames` accepts frames; no UI shows fleet health, frame rate, drop rate, or per-camera last-seen. Impact 4, Effort M. → `src/lib/camera/ingest.ts`
18. **Human review queue before auto-filed reports go public.** Detector → report is currently trust-the-model. Confidence-banded review gate with one-tap accept/reject that feeds the correction corpus. Impact 5, Effort M.
19. **Liability sweep scheduling + notification.** `sweep.ts` runs on demand; attribution windows expire silently. Cron + a "3 claims lapse in 7 days" digest. Impact 4, Effort M. → `src/lib/liability/sweep.ts`
20. **Claim packet PDF export + certified-mail metadata.** `packet.ts` builds the evidence bundle in-app; a claim has to leave the building as a document. Impact 4, Effort M. → `src/lib/liability/packet.ts`
21. **Contractor claim-response portal.** Contractors can see work orders; they cannot see, contest, or accept a claim against them. One-sided attribution won't survive first contact. Impact 4, Effort M.
22. **Street-segment resolver.** `CAMERA_LIABILITY_PIPELINE.md:222` deferred it: v1 accepts a drawn line. Real segment matching (OSM/TIGER) makes attribution defensible. Impact 4, Effort L, Moat high.
23. **Damage-progression tracking across passes.** Same defect seen weekly → severity trend → "this crack became a pothole in 18 days." Nobody has this. Impact 4, Effort M, Moat very high.
24. **Video retention + privacy enforcement.** Clips are raw street footage with faces and plates. Blur must apply to video frames and a TTL must be enforced, same as `photos-raw`. Impact 5, Effort M. *(hard-rule adjacency — currently the largest privacy gap in the product)*

## C. Documents & institutional knowledge

25. **Document ingest UI (upload → chunk → embed).** `scripts/seed-city-documents.mjs` is the only path in; staff cannot add a PDF. Impact 4, Effort M. → `src/lib/documents/chunk.ts`
26. **Citations in the staff assistant's answers.** RAG retrieves; answers should point at the policy paragraph, with a link. Impact 4, Effort S. → `src/lib/documents/retrieve.ts`
27. **Documents in the work-order dossier.** `VIDEO_PIPELINE.md` Phase 2 names this: retrieve the maintenance spec into the stage-2 prompt so a work order cites the standard it is built against. Impact 4, Effort M.
28. **Contract-terms extraction → SLA auto-population.** Contractor docs already link (migration 066). Parse response-time obligations into enforceable SLA rows. Impact 4, Effort L, Moat high.
29. **Document freshness + supersede chain.** A 2019 manual answering as current is a liability. Effective dates, supersede links, staleness flags. Impact 3, Effort S.
30. **Hybrid full-text + semantic retrieval.** Currently one mode; hybrid materially beats either on policy corpora. Impact 3, Effort M.

## D. Resident trust & close-the-loop (v1 gaps that still bite)

31. **Editable submission.** Still the single most-requested 311 affordance; SeeClickFix forces a restart. Impact 3, Effort S.
32. **Web Push / VAPID.** `public/sw.js` has no `push` handler; the PWA is installed and silent. Impact 4, Effort M.
33. **"Fixed near you" weekly digest.** Re-engagement with zero new intake cost. Impact 3, Effort S.
34. **Resident notification preferences.** Channel + frequency + quiet hours, or the SMS work becomes a complaint generator. Impact 4, Effort S.
35. **Public neighborhood scorecard.** District rollups exist staff-side; residents cannot see "your area vs city average." Impact 3, Effort M, Moat med.
36. **Report timeline with named stages.** Beyond open/closed: triaged → scheduled → crew en route → done. The perceived-progress fix. Impact 4, Effort M.
37. **Resident-visible crew ETA on scheduled work.** Schedule data exists (migration 051) and never reaches the resident. Impact 4, Effort S.
38. **Better duplicate deflection at intake.** Show the existing report + "+1 this" before submit; measure the deflection rate. Impact 4, Effort M.
39. **Closure-quality scoring visible to staff leads.** `closure-quality.ts` grades every closure; nobody sees the aggregate. Impact 3, Effort S.
40. **Post-resolution follow-up at 30 days.** "Still fixed?" — catches bad repairs and feeds the repeat-offender registry. Impact 3, Effort S.

## E. Intake channels & accessibility

41. **Voice intake (STT).** Speak the problem, AI structures it. Still unbuilt after two roadmaps. Impact 4, Effort M.
42. **WCAG 2.1 AA audit with an artifact + CI gate.** Focus traps exist; no audit, no automated check. Procurement-mandatory. Impact 5, Effort M.
43. **Lighthouse in CI on `/city/cumming`.** The definition-of-done in `agents.md` names Perf>90 / A11y>95 / SEO>95 and it has never been measured on a prod build. Impact 4, Effort S.
44. **Plain-language form mode.** AI-simplified prompts for low-literacy and ESL residents. Impact 3, Effort S.
45. **Explicit consent flow at intake.** Zero `consent` matches in `src/`. Photo/location/contact consent is a GDPR-adjacent procurement question. Impact 3, Effort S.
46. **Kiosk mode.** Library / city-hall touchscreen, session reset, no keyboard assumptions. Impact 2, Effort M.
47. **Resident video intake.** The detector pipeline exists for fleet clips; residents still cannot attach one. Impact 3, Effort M.
48. **Photo quality coach pre-submit.** "Too dark / too far — retake?" cuts garbage classifications at the source. Impact 3, Effort S.
49. **IVR / phone bridge.** Denver's "Sunny": $0.35 vs $4 per call. Impact 3, Effort L.

## F. AI intelligence

50. **Abuse / spam classifier.** `moderate.ts` is length-and-shape only. One slur or injection on the public map is an incident. Impact 4, Effort S.
51. **Prompt-injection hardening on RAG + assistant.** Retrieved documents and resident free text both reach model context; nothing sanitizes either. Impact 5, Effort M. *(security)*
52. **Confidence-gated auto-close.** Trivial categories, full audit trail, resident override. Impact 3, Effort M.
53. **System-level cross-report clustering.** "These 12 reports = one failing storm drain." Dedup is not system diagnosis. Impact 4, Effort M, Moat high.
54. **Auto-fill address from photo landmarks.** GPS-off fallback beyond Nominatim reverse geocode. Impact 3, Effort M.
55. **Model cost + latency dashboard.** Gemini calls are unmetered per city; no unit-economics number exists. Impact 4, Effort S.
56. **Model fallback + circuit breaker.** Gemini down means intake classification down, with no degraded path. Impact 4, Effort S.
57. **Fine-tune run on the correction corpus.** `feedback-corpus.ts` emits JSONL and nothing consumes it — the compounding moat is one training run away. Impact 4, Effort M, Moat high.
58. **Eval harness for the assistant's tool-calling.** `chat/tools.ts` mutates data with no regression suite. Impact 4, Effort M.

## G. Analytics & forecasting

59. **Budget forecasting from report trends.** Named in v1, never built; the card a city manager actually takes to council. Impact 4, Effort L, Moat high.
60. **Predictive next-failure, not just recurrence.** `037_recurring_hotspots` detects repeats; predict the date. Impact 4, Effort L, Moat high.
61. **Weather-correlated demand forecast.** NWS is integrated and used only for advisories. Impact 3, Effort M.
62. **Census-tract + income equity, not just district.** `equity.ts` is district-level; the Title-VI story needs ACS joins. Impact 5, Effort M, Moat high.
63. **Real sentiment from resident text.** `getCityMorale` is throughput-derived — it cannot detect anger. Impact 3, Effort M.
64. **Scheduled analytics email to city leadership.** Monthly rollup pushed, not pulled. Impact 3, Effort S.
65. **Cohort analysis on reporter retention.** Do residents who get a good closure report again? The core product-health metric, unmeasured. Impact 3, Effort M.
66. **Analytics query performance budget.** `analytics-data.ts` is 18K and unbounded; no page-load budget or index audit. Impact 3, Effort M.

## H. Field ops & work orders

67. **Offline write queue on the field PWA.** `field/page.tsx` is read-only cached; a crew in a dead zone cannot mark complete. Impact 5, Effort M.
68. **Geo-stamped completion.** No `completed_lat`. Proof-of-presence is the audit answer to "was the crew there?" Impact 3, Effort M.
69. **Recurring / preventive maintenance work orders.** Reactive-only today; preventive is where Cityworks wins. Impact 4, Effort M.
70. **Parts / inventory table.** `materials_ready` is a boolean over nothing. Impact 3, Effort L.
71. **Per-city status state machine.** Config covers departments/SLA/cost but statuses are hardcoded. Blocks any city whose workflow is not ours. Impact 4, Effort L.
72. **Crew capacity + time-off calendar.** The route optimizer and the scheduler both assume everyone is available every day. Impact 3, Effort M.
73. **Work-order dependencies + blocking.** "Cannot pave until the utility cut is closed." Impact 3, Effort M.
74. **Field photo upload through the blur path.** Completion photos currently bypass the resident blur pipeline. Impact 4, Effort S. *(privacy hard-rule)*
75. **Supervisor crew-review view.** Per-crew analytics exist; no supervisor workflow over them. Impact 2, Effort S.

## I. Emergency, weather & sensors

76. **Disaster triage intake mode.** UI switch from routine reporting to rescue/hazard during a declared event. Impact 4, Effort L, Moat high.
77. **Real 911/EMA escalation routing.** The interstitial is a `tel:` link; life-safety needs an actual handoff with a receipt. Impact 5, Effort M.
78. **Generic sensor webhook API.** `/api/camera/frames` is fleet-specific; a vendor-agnostic ingest turns any IoT deployment into reports. Impact 4, Effort M, Moat high.
79. **Utility-outage overlay.** Cross-reference power/water outage feeds against open reports. Impact 2, Effort M.
80. **Smart-streetlight connector.** Auto-report outages from the lighting vendor. Impact 2, Effort L.
81. **Post-event aerial/satellite damage import.** Google SKAI classified Helene damage in hours. Impact 3, Effort XL.

## J. Integrations & ecosystem

82. **Cityworks/Unity connector verified against a sandbox.** (Depth on #4.) The Unity migration window is open now. Impact 5, Effort L, Moat high.
83. **ArcGIS live feature-layer export.** Ingest is real; export is a scaffold. Every GIS-forward city asks for this first. Impact 4, Effort M.
84. **Connector retry, dead-letter + replay UI.** Outbound sync fails silently today. Impact 4, Effort M.
85. **Self-serve export UI (CSV/Excel/scheduled email).** One admin CSV route exists; no user-facing export. Impact 3, Effort S.
86. **Zapier/Make app listing.** Webhooks ship; distribution does not. Impact 3, Effort M.
87. **Social-media intake bridge (X/Facebook).** Ingest tagged posts as reports. Impact 2, Effort L.

## K. Engagement & accountability

88. **Resident reputation / trusted reporter.** Reduces frivolous volume, rewards the 5% who file 60% of reports. Impact 3, Effort M.
89. **Adopt-a-drain / hydrant stewardship.** Residents claim an asset and check it before storms. Impact 2, Effort M.
90. **Gamified streaks + badges.** Cheap retention on an existing upvote/comment base. Impact 2, Effort M.
91. **Public roadmap fed by the feature-request board.** `/roadmap` is hand-curated; `/requests` has real votes. Wire them together. Impact 2, Effort S.

## L. Compliance, security & procurement gates

92. **SOC 2 Type II: controls tooling, not a doc.** `soc2-readiness.md` is 37 lines. Access review, change management, evidence collection. Unlocks the whole pipeline. Impact 5, Effort L, Moat high.
93. **Penetration test + threat model of the public surface.** Open311 API, webhooks, camera ingest, SMS inbound and the public token are all internet-facing and unreviewed as a set. Impact 5, Effort M. *(security)*
94. **Audit log across every staff mutation.** Scattered today; procurement asks for one immutable trail. Impact 4, Effort M.
95. **Data-processing agreement + subprocessor page.** Gemini, Supabase, Twilio and Resend all touch resident data; nothing discloses it. Impact 4, Effort S.

## M. Platform, operations & quality (unaddressed by either roadmap)

96. **Pick a deploy target and ship a prod deploy.** `agents.md` says "deploy target unresolved." Nothing else on this list matters until the app runs somewhere a city can reach. Impact 5, Effort M.
97. **Job queue + worker infra.** Video, camera, liability sweep, digests, connector retries and drift checks all need one; there is none. Impact 5, Effort L.
98. **Error budget + alerting on the AI pipelines.** Sentry captures exceptions; nothing alerts on classification failure rate, model latency, or a stalled detector. Impact 4, Effort M.
99. **Migration reconciliation + a shadow-DB CI check.** `33ec7d9` had to recover ghost DDL and fix duplicate numbering; nothing prevents a repeat. Fresh-deploy test on every PR touching `supabase/migrations/`. Impact 5, Effort M.
100. **Load test the public dashboard + realtime.** Supabase Realtime soft-caps around 200 subscribers per channel (`agents.md`); the shard-by-city plan is untested. A viral report is the launch risk. Impact 4, Effort M.

---

## TOP 15 — build these first

Ranked by (Impact × Moat) ÷ Effort, weighted toward unblocking a real pilot.

| # | Item | Why now | Impact | Effort |
|---|------|---------|--------|--------|
| 96 | Prod deploy target | Nothing else ships until this does | 5 | M |
| 1 | Resend/Twilio live | Complete code, dark 7 weeks; trust dies in silence | 5 | S |
| 24 | Video privacy: blur + TTL on frames | Raw street footage with faces/plates is the biggest open risk | 5 | M |
| 97 | Job queue + worker | Five pipelines run on `after()` with no retry | 5 | L |
| 99 | Migration CI (fresh-deploy check) | Already broke once; recovery cost a full commit | 5 | M |
| 18 | Human review gate on auto-filed reports | The model files work orders unsupervised today | 5 | M |
| 13 | RTSP puller worker | Turns the video demo into a running system | 5 | L |
| 2 | Golden set + eval gate | No accuracy number backs the core AI claim | 4 | M |
| 62 | Census-tract equity analytics | Strongest procurement differentiator, half-built | 5 | M |
| 42 | WCAG AA audit + CI gate | Procurement-mandatory, never measured | 5 | M |
| 4 | One real connector (Cityworks) | The Unity migration window is open now | 5 | L |
| 67 | Field PWA offline writes | Crews work where there is no signal | 5 | M |
| 51 | Prompt-injection hardening | RAG + resident text both reach model context | 5 | M |
| 8 | Materials/labor entry UI | Every cost analytic currently runs on estimates | 4 | M |
| 77 | Real 911/EMA escalation | The life-safety path is a `tel:` link | 5 | M |

**The week-one five:** #1 (secrets), #43 (Lighthouse run), #3 (share-target 405), #9 (public CSAT), #91 (roadmap wiring) — all S, all removable from this list in a day.

---

## What v2 deliberately drops from v1

Built and no longer roadmap items: SMS/WhatsApp inbound, QR walk-up, hazard grading, damage-dimension estimation, drift monitor, equity panel, district rollups, peer benchmark, leaderboard, hotspots, open-data API, report pack, field portal, scheduling, route optimization, bulk actions, contractor dispatch, surge mode, fleet detection, webhooks, embed widget, legacy importer, trending feed, OG cards, comments, PII redaction, privacy dashboard, compliance PDF, retention UI, RLS suite. **43 items — status evidence per item is in the audit trail below.**

Dropped as not worth building now: digital-twin feed (v1 #72, 24+ months out), GTFS routing (v1 #85, no demand signal), GovRAMP (v1 #95, follows SOC 2 by a year).

---

## v1 audit trail (2026-08-30, `main` @ `0d4782d`)

**SHIPPED (43):** 2, 3, 5, 7, 9, 13, 14, 16, 20, 26, 27, 28, 33, 37, 38, 39, 40, 41, 43, 47, 48, 49, 50, 51, 52, 54, 55, 57, 62, 63, 70, 79, 80, 81, 86, 87, 92, 93, 96, 97, 98, 99, 100

**PARTIAL (32):** 1, 4, 6, 12, 17, 18, 19, 22, 29, 31, 32, 36, 44, 45, 46, 53, 56, 58, 59, 66, 67, 73, 74, 75, 76, 77, 78, 82, 83, 90, 94, 95

**NOT BUILT (25):** 8, 10, 11, 15, 21, 23, 24, 25, 30, 34, 35, 42, 60, 61, 64, 65, 68, 69, 71, 72, 84, 85, 88, 89, 91

Per-theme shipped rate: A 7/14 · B 2/11 · C 6/12 · D 12/14 · E 6/11 · F 1/6 · G 1/5 · H 3/12 · I 5/8 · J 5/7. The weak themes — intake channels (B), emergency (F), sensors (G) and integrations (H) — are where v2 concentrates.

### Capabilities that shipped with no roadmap entry

Not in v1 at all, and therefore not re-listed above: the fleet-camera → liability → claims pipeline (migrations 062–064, `src/lib/liability/*`, `/admin/liability`, `/admin/claims`); the video damage-mapping pipeline (migration 056, `src/lib/video/*`, `services/detector/`, `/city/[slug]/video`); camera frame ingest + clustering (`src/lib/camera/*`, `/api/camera/frames`, `/demo/camera`); city documents + RAG (migrations 065–066, `src/lib/documents/*`, `/city/[slug]/documents`); the org_units routing tree and decision engine (migrations 042, 056–061, `/admin/org-tree`, `/city/[slug]/routing`); the Cesium 3D globe / deck.gl map stack; the full Open311 GeoReport v2 server; TIGER-boundary city onboarding; the staff duplicate-merge console (migration 052); crew-types AI auto-assign (migrations 030/031/067); plus the automation-rules engine, API-key issuance, feature-request board, AG-Grid work-order explorer, staff AI assistant with tool-calling, CSP inline-script hashing, and the analytics heatmap. Sections B, C and M above are the follow-on work these created.

---

*Grounded in a file-level audit of `main` @ `0d4782d` (2026-08-29). Cross-reference `NEXT_100.md` (v1), `OUTFLANK.md` (the original 50), `VIDEO_PIPELINE.md` and `CAMERA_LIABILITY_PIPELINE.md` (phase plans this list absorbs), and `SHIPPED.md` (PR index).*
