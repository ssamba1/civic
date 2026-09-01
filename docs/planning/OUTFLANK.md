# OUTFLANK: 50 Builds to Beat the Incumbents

> **Codename rationale:** We do not win a feature-for-feature war against SeeClickFix (CivicPlus), Accela, or Cityworks. They own procurement channels and 15 years of backend depth. We **outflank**: attack where they are structurally weak (AI-native intake, privacy-by-default, small/mid-city GTM) and *integrate* where they are strong instead of rebuilding it. Every build below must pass one test: **does it deepen the wedge or is it just parity?** Parity work is deprioritized or cut.

**Related docs:** `PLAN.md` (routes/layouts/phases), `BUILD_PLAN_2026-07.md` (active WS0 gate), `ONBOARDING.md`, `agents.md` (hard rules). Where OUTFLANK conflicts with `docs/DESIGN.md`, DESIGN wins, flag it.

## The Five Wedges (every build maps to ≥1)

- **W1. AI-native intake.** Photo → filed work order in seconds, zero staff triage. Incumbents have *none* of this natively. This is the moat.
- **W2, Privacy-by-default.** Mandatory client-side blur + dual-bucket TTL. A free feature for us, an expensive retrofit for them, becoming legally mandatory.
- **W3, Accountability pressure.** Public dashboards, SLA visibility, resident re-engagement. Our civic brand.
- **W4, Small/mid-city GTM.** Cities priced out of Accela and underserved by SeeClickFix. Cumming pilot is the beachhead.
- **W5. Integrate, don't replace.** Open311 + connectors feed their existing systems. Removes the "rip out our stack" objection that kills startups.

**Scoring:** each build tagged `[Wedge] · Effort(S/M/L) · Impact(1-5)`. Build order = Impact/Effort, wedge-weighted. Cut list at bottom is as important as the build list.

---

## Phase 1: Make the AI Undeniable (builds 1-12)
*Goal: the demo that makes a city manager say "wait, it did that automatically?" This phase alone is the pitch.*

1. **Zero-touch work-order generation.** `[W1] · L · 5` Gemini vision fills category, severity, dept, geo, suggested crew, description. Staff approve, never type. Quantify "6 sec vs 8 min" on screen.
2. **Confidence-scored auto-dedup.** `[W1] · M · 5` Embedding + PostGIS `ST_DWithin` merge: "3 residents, one pothole." Auto-collapse with an override. Biggest staff-hour saver = the procurement number.
3. **AI severity/urgency queue ranking.** `[W1] · M · 5` Safety hazard > cosmetic. Water main > graffiti. Powers the gov admin triage view.
4. **Cost + SLA estimate per report.** `[W1] · M · 4` Predict $ range + fix-by date from category + historical closes. No incumbent does this. Budget hook for the finance office.
5. **Smart dept/crew routing.** `[W1] · M · 4` Category → correct team, auto-assign by zone + current load. Backend value without becoming Cityworks.
6. **Classification eval harness in CI.** `[W1] · S · 4` Extend `pnpm eval` + `tests/golden/`. Gate merges on accuracy regression. Trust = we can *prove* the AI is right.
7. **Human-in-the-loop correction feedback.** `[W1] · M · 4` Staff overrides feed a fine-tune/few-shot set. Model improves per-city over time. A compounding moat incumbents can't copy without our data loop.
8. **Markdown-fence-safe JSON parsing hardening.** `[W1] · S · 3` Gemini returns fenced JSON intermittently (known pitfall). Bulletproof the parser + schema-validate. Reliability = adoption.
9. **Multi-photo + video intake fusion.** `[W1] · M · 3` Multiple angles → one classification. Richer than single-shot incumbents.
10. **AI-suggested duplicate-of-existing at capture time.** `[W1] · M · 4` Before submit: "This looks like report #482 filed 2h ago. Add your upvote?" Cuts noise at the source, delights residents.
11. **Voice + text natural-language intake.** `[W1] · S · 3` "There's a downed tree on Main." AI structures it. Photo already language-free.
12. **Offline-first PWA + Web Share Target capture.** `[W1] · L · 4` Report in dead zones, sync later; iOS camera-permission workaround (known pitfall). Field reliability drives real adoption over demo-ware.

## Phase 2: Accountability as Brand (builds 13-23)
*Goal: residents and politicians *want* this in their town. Public pressure is the growth engine incumbents structurally avoid.*

13. **Sharp public city dashboard.** `[W3] · M · 5` Live map, open/closed counts, median resolution time by category. Shareable, fast (Lighthouse Perf >90). The accountability artifact.
14. **SLA breach alerts, public + staff.** `[W3] · M · 4` Overdue reports flag red publicly. Pressure incumbents won't build; residents trust it.
15. **Response-time leaderboard by category/dept.** `[W3] · S · 3` Transparent performance. Drives internal improvement.
16. **Council-district / ward rollups.** `[W3] · M · 4` Per-district stats; each council member gets their turf report. Sells to politicians, not just public works.
17. **Resident status timeline + push notifications.** `[W3] · M · 5` Reported → triaged → dispatched → fixed, with proof photo. Auto-notify reporter. Drives re-engagement + word of mouth.
18. **Fix-proof before/after photo pairs.** `[W3] · S · 4` Closing a report requires an after-photo. Public proof = trust, and closes the accountability loop.
19. **Trending-issues surfacing from upvotes.** `[W3] · S · 3` Extend existing upvote. Demand-ranked priority feed. Democratic signal for gov.
20. **Resident reputation / self-heal profile.** `[W3] · S · 2` Extend the existing self-heal reporter profile. Trusted reporters' reports weighted higher; reduces spam.
21. **Public API + embeddable widgets.** `[W3] · M · 3` City can embed the map/stats on their own `.gov` site. Distribution via the city's own audience.
22. **Shareable social cards per resolved issue.** `[W3] · S · 3` Auto-OG-image "Fixed in 3 days." Organic reach; every fix markets the platform.
23. **Sentiment + civic-trust trend tracking.** `[W3] · M · 2` Aggregate resident satisfaction over time. Mayor-facing narrative metric.

## Phase 3: Kill the "We Already Have a System" Objection (builds 24-33)
*Goal: W5. Be the smart intake layer feeding their stack, not a rip-and-replace. This is how we close mid-size cities that own Cityworks/Accela.*

24. **Open311 GeoReport v2 two-way sync.** `[W5] · L · 5` Full inbound + outbound conformance (never touch `lib/open311/` without ask). Table stakes done *better* than incumbents.
25. **Cityworks connector.** `[W5] · L · 4` Push work orders into Cityworks; pull status back. Directly neutralizes the biggest objection.
26. **Accela connector.** `[W5] · L · 4` Same for Accela shops.
27. **CSV / Excel / email-digest export.** `[W5] · S · 4` The city with no system at all still gets value day one.
28. **Webhook + Zapier/Make outbound events.** `[W5] · M · 3` Report lifecycle events → any downstream tool. Integration surface without bespoke builds.
29. **GIS / Esri ArcGIS layer export.** `[W5] · M · 3` Reports as a live ArcGIS feature layer (ArcGIS is the GA ingest channel per onboarding spike). Public-works GIS teams speak this.
30. **SSO / SAML / municipal identity.** `[W5] · M · 3` Cities require it for procurement. Parity, but a hard gate. Without it we don't get in the door.
31. **Multi-tenant city onboarding self-serve.** `[W4] · L · 5` Boundary import (TIGER verified), synthetic fallback, `parent_id` tenancy (per onboarding spike §6). A city stands itself up in a day, the small-city GTM engine.
32. **Data migration importer from SeeClickFix/legacy.** `[W5] · M · 4` One-click import of historical reports. Removes switching cost, the incumbent's stickiest lock-in.
33. **Configurable per-city service catalog + workflows.** `[W5] · M · 3` Map their existing categories/routing rules. Fits their org chart, not ours.

## Phase 4: Privacy & Trust as a Sold Feature (builds 34-40)
*Goal: W2. Turn the mandatory blur pipeline from an internal rule into a compliance product cities' legal teams ask for.*

34. **Privacy audit dashboard.** `[W2] · M · 4` Prove no raw photos in `photos-public`, blur ran, TTL enforced. Exportable for city legal. (Extend `pnpm audit:privacy`.)
35. **Automated compliance report generation.** `[W2] · M · 3` One-click "privacy posture" PDF for records requests / audits.
36. **RLS regression coverage expansion + public report.** `[W2] · M · 3` Extend `tests/rls/`; surface "default-deny on every table" as a trust badge. (Never merge schema changes without RLS pass.)
37. **On-device blur model upgrade + QA harness.** `[W2] · L · 3` Better face/plate detection, golden-set validated. Never touch `lib/privacy/blur.ts` without ask. Plan the change, get sign-off.
38. **Configurable data-retention policies per city.** `[W2] · M · 3` City sets raw-photo TTL to match their records law. Compliance flexibility incumbents lack.
39. **PII redaction in text fields.** `[W2] · M · 3` AI strips names/phones from free-text descriptions before they hit public views. Enforces the "no PII" hard rule automatically.
40. **Consent + accessibility (WCAG) intake flow.** `[W2/W3] · M · 3` A11y >95 target; explicit consent capture. Equity + legal coverage.

## Phase 5: Deepen Moat & Enterprise Trust (builds 41-50)
*Goal: compounding advantages and the analytics upsell that turns a $/city license into a per-seat expansion.*

41. **Recurring-problem / predictive detection.** `[W1/W3] · L · 4` "This drain floods every heavy rain." Pattern-mine history + weather (storm-advisory modules already exist). Pre-empt problems = the mayor pitch.
42. **Heatmaps + spatial-cluster analytics.** `[W3] · M · 3` deck.gl density layers; supercluster at the data layer (>5k points pitfall). Where-is-it-worst at a glance.
43. **Budget-forecasting from report trends.** `[W1] · M · 3` Project next-quarter repair spend by category. Finance-office upsell tier.
44. **Crew/asset performance analytics.** `[W3] · M · 3` Throughput, backlog, cost-per-close by crew. Ops value that raises switching cost.
45. **Realtime multi-city sharding.** `[W4] · M · 3` Shard Supabase Realtime by city beyond ~200 subscribers/channel (known cap). Scale without falling over.
46. **Storm / emergency surge mode.** `[W3] · M · 3` Auto-reprioritize + batch-classify during weather events. Extend existing storm-config. The day a city needs us most.
47. **Anonymous / QR-code walk-up reporting.** `[W4] · S · 3` QR on a bus stop → report, no account. Lowers the reporting barrier to zero; expands coverage.
48. **Gamified civic-engagement layer.** `[W3] · S · 2` Badges/streaks for active reporters. Retention; use lightly to avoid gaming the queue.
49. **AI civic assistant (resident chatbot).** `[W1] · M · 3` "What's the status of my street?" Natural-language over the report DB. Modern UX incumbents can't match.
50. **Benchmark / peer-city comparison analytics.** `[W3/W4] · M · 3` "Cumming resolves potholes 40% faster than the state median." A GTM weapon. Every prospect wants to know their rank, and it markets itself.

---

## Cut List (do NOT build: these are how we lose)

- **Full permitting / licensing engine**: Accela's home turf. Integrate (24-26), never rebuild.
- **GIS asset-management system of record**: Cityworks depth we can't and shouldn't match.
- **General-purpose 311 for every request type on day one**: stay narrow on infrastructure repair until the wedge is proven.
- **Native mobile apps (iOS/Android) up front**: PWA + Web Share Target first (12); native only after pull is proven.
- **Custom BI / dashboard builder**: export to their tools (27-29); don't become Tableau.
- **Any client-side Gemini call**: hard rule violation, and no strategic value.

## Prioritization Summary

| Build now (Impact 5, unblocks demo/GTM) | 1, 2, 3, 13, 17, 24, 31 |
|---|---|
| Fast follow (Impact 4) | 4, 5, 7, 10, 12, 14, 16, 18, 25, 26, 27, 32, 34, 41 |
| Depth / upsell (Impact 3) | most of Phases 3-5 |
| Trust gates (parity, but door-openers) | 6, 30, 36 |

**The single sentence for the pitch:** *"Residents photograph a problem; our AI files the work order, dedupes it, prices it, routes it to the right crew, and hands the city a public accountability dashboard, then syncs it all into the system they already own."* Builds 1, 2, 4, 5, 13, and 24. Everything else compounds those.
