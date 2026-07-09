# NEXT 100 — Features to Make Civic Best-on-Market

> Research-backed roadmap. Compiled 2026-07-08 from (a) full codebase feature inventory and (b) deep market/competitor research (SeeClickFix/CivicPlus, Accela, Cityworks/Unity, Zencity, QScend, FixMyStreet, CitySourced, Salesforce Agentforce, ArcGIS, OpenGov 311, GOGov). Every item here is something we **do NOT already have** (or only have as a stub), and each is justified by a competitor gap or resident/staff pain point. See `OUTFLANK.md` for the original 50-build plan — this is the next 100.
>
> **Legend:** Impact 1–5 (5 = highest). Effort S/M/L/XL. Moat = how defensible. Wedge maps to OUTFLANK W1–W5.

---

## How to read this

The market research surfaced five durable white-spaces no incumbent fills well:
1. **The "black hole" problem** — residents submit and hear nothing; no ETA, generic closures. (Universal complaint: Philly, DC, Port Arthur.)
2. **Duplicate ticket storms** — 3 residents → 3 tickets → 3 dispatches. No incumbent dedups well.
3. **No equity analytics** — zero commercial platform shows response-time-by-neighborhood. Grant/Title-VI angle.
4. **Frontier vision AI at intake** — incumbents added *basic* photo hints in Jan 2026; nobody runs a frontier vision model. We run Gemini 2.5 Flash.
5. **Privacy blur** — no US platform advertises face/plate blur. Only CivicSpot (EU/GDPR).

The 100 below are grouped by theme and sorted roughly by priority within each. **Top 15 picks** are called out at the end.

---

## A. Close-the-Loop & Resident Trust (attack the "black hole")

1. **Live SMS/email delivery turned on end-to-end.** Wire `RESEND_API_KEY`/SES so status + CSAT emails actually send (delivery code exists, dark today). Impact 5, Effort S, Wedge W3. — *DC data: residents default to phone because apps are unreliable; nothing kills trust faster than silence.*
2. **SMS INBOUND intake.** Accept a report by text (photo MMS + location). Only chatbot-adjacent tools do this. Impact 5, Effort M, Moat high (accessibility). — *Reaches feature-phone / senior / low-income residents excluded by app-only tools.*
3. **WhatsApp inbound intake.** Production in Brazil/South Africa; US white space. Impact 4, Effort M, Moat high.
4. **Proactive "we saw it" instant ack.** Sub-second confirmation with human-readable next-step + ETA at submit, not hours later. Impact 4, Effort S.
5. **No-generic-closures rule.** Force staff to attach a reason + after-photo on close; AI drafts a plain-language explanation from the work order. Impact 5, Effort M. — *Kills the "no evidence observed" complaint.*
6. **Estimated-fix-date confidence band.** Show "usually fixed in 3–6 days for this category in your area" from historical MTTR, not a hard date. Impact 4, Effort M.
7. **Resident follow-up / re-open button.** "Still broken?" one-tap re-open from the status page (SeeClickFix can't edit/reopen). Impact 4, Effort S.
8. **Editable submission.** Let resident fix address/details after submit (SeeClickFix forces a full restart). Impact 3, Effort S.
9. **Multi-language resident status pages.** Auto-translate the `/r/[token]` page via Gemini to the reporter's language. Impact 4, Effort S, Moat med.
10. **Push notifications (Web Push / PWA).** Real push, not just email; wire the registered-but-dead service worker. Impact 4, Effort M.
11. **Digest mode.** Weekly "here's what got fixed near you" email/SMS to re-engage. Impact 3, Effort S.
12. **Resident satisfaction trend on public page.** Show rolling CSAT % publicly = accountability pressure. Impact 3, Effort S, Moat med.
13. **"Report received by [Dept]" transparency.** Name the actual owning team publicly so it feels routed to a human. Impact 3, Effort S.
14. **Anonymous-but-trackable.** Opaque token gives follow-up without an account, solving the "anonymous dead end." Impact 3, Effort S (mostly done — extend to SMS).

## B. Intake Channels & Accessibility (widen the funnel)

15. **Voice / natural-language intake.** Speak the problem; AI structures it. OUTFLANK #11, still unbuilt. Impact 4, Effort M.
16. **QR walk-up reporting.** Printed QR on a bus stop/park sign → pre-tagged location report. OUTFLANK #47 partial. Impact 4, Effort S, Moat med. — *Turns physical infrastructure into intake points; no competitor does this.*
17. **Web Share Target API.** "Share photo → Civic" from the OS share sheet (iOS PWA camera-permission workaround). Impact 3, Effort M.
18. **Multi-photo + short video intake.** Fuse several angles / a 5-sec clip. SeeClickFix forces one-at-a-time. OUTFLANK #9. Impact 3, Effort M.
19. **Offline-first PWA queue.** Capture offline, sync when back online (rural/low-connectivity). OUTFLANK #12. Impact 4, Effort M, Moat med.
20. **AI resident chatbot for intake (not just Q&A).** Extend existing assistant to *file* a report conversationally. Impact 4, Effort M.
21. **Phone/IVR bridge.** AI voice line that files a report (Denver "Sunny" model: $0.35 vs $4/call). Impact 3, Effort L.
22. **Full WCAG 2.1 AA audit + fixes.** Screen-reader, voice-nav, high-contrast, plain-language. Procurement-mandatory. Impact 4, Effort M.
23. **Plain-language / low-literacy form mode.** AI simplifies prompts. Impact 2, Effort S.
24. **Explicit consent + accessibility intake flow.** OUTFLANK #40. Impact 2, Effort S.
25. **Kiosk mode.** Library/city-hall touchscreen intake for the digital-divide segment. Impact 2, Effort M.

## C. AI Intelligence (widen the vision-model lead)

26. **Human-in-the-loop feedback → fine-tune set.** Close the loop: staff overrides feed a labeled corpus. Schema exists (`classification_feedback`); pipeline open. OUTFLANK #7. Impact 4, Effort M, Moat high.
27. **AI severity from image (hazard grading).** Grade danger level (e.g. exposed rebar vs cosmetic crack) — CivicSpot does hazard detection. Impact 4, Effort M, Moat high.
28. **Damage-dimension estimation.** Estimate pothole size / area from photo → better cost + crew. Cal DOT hit 97% pothole accuracy. Impact 3, Effort L.
29. **Spam / abuse / inappropriate-content filter.** OpenGov flags this; we should too. Impact 3, Effort S.
30. **Auto-fill address from photo landmarks + EXIF-free geo.** When GPS is off, infer location. Impact 3, Effort M.
31. **Multilingual AI translation at intake.** Detect + translate any language inbound. OpenGov has it; LLM-native for us. Impact 4, Effort S.
32. **Cross-report clustering beyond dedup.** "These 12 reports = one failing storm drain system." Impact 3, Effort M, Moat high.
33. **AI-drafted staff response templates.** One-click, tone-consistent replies. Impact 3, Effort S.
34. **Confidence-gated auto-close for trivial categories.** Low-risk categories auto-resolve with audit trail. Impact 3, Effort M.
35. **Photo quality coach.** "Too dark / too far — retake?" before submit to cut bad classifications. Impact 2, Effort S.
36. **Golden-set labeled photos + CI accuracy gate live.** Harness exists (`pnpm eval`); needs labeled corpus + threshold gate. OUTFLANK #6. Impact 3, Effort M.
37. **Classification drift monitor.** Alert when model accuracy on staff-corrected data drops. Impact 2, Effort M.

## D. Equity & Analytics (the biggest white space)

38. **Equity dashboard: response time by census tract / income quartile.** NO commercial platform has this. Title-VI + grant compliance hook. Impact 5, Effort M, Moat high. — *Single strongest procurement differentiator found.*
39. **Council-district / ward rollups.** Per-district scorecards for councilmembers. OUTFLANK #16. Impact 4, Effort M.
40. **Benchmark / peer-city comparison analytics.** "You resolve potholes faster than 70% of GA cities." OUTFLANK #50. Impact 4, Effort M, Moat high.
41. **Response-time leaderboard by category/dept.** Internal accountability. OUTFLANK #15. Impact 3, Effort S.
42. **Budget forecasting from report trends.** Project next-quarter repair spend by category. OUTFLANK #43. Impact 4, Effort L, Moat high.
43. **Crew / asset performance analytics.** Throughput, MTTR, cost per crew. OUTFLANK #44. Impact 3, Effort M.
44. **Sentiment + civic-trust trend tracking.** Zencity's whole business, as one card. OUTFLANK #23. Impact 3, Effort M.
45. **Predictive maintenance signals from 311 history.** "This block will pothole again in ~40 days." San Jose does it internally; no SaaS. OUTFLANK #41 extends. Impact 4, Effort L, Moat high.
46. **Seasonal / weather-correlated forecasting.** Tie NWS data (already integrated) to demand spikes. Impact 3, Effort M.
47. **SLA-breach predictive alerts.** Warn *before* breach, not after. Impact 3, Effort M.
48. **Repeat-offender asset registry.** Auto-track infrastructure that keeps failing. Impact 3, Effort M.
49. **Cost-per-resolution benchmarking by category.** Impact 2, Effort S.
50. **Open-data / public API export of anonymized analytics.** NYC-311-style open dataset builds civic goodwill + research cred. Impact 3, Effort M.
51. **Downloadable council-meeting PDF report.** Auto-generate the monthly infra report a city manager presents. Impact 3, Effort M, Moat med.

## E. Work Order & Field Ops (own the intake→dispatch loop)

52. **Field-crew mobile app / PWA.** Offline work-order list, mark-complete with photo, in low-connectivity areas. Impact 4, Effort L, Moat high. — *SeeClickFix explicitly lacks native work order; this is the wedge.*
53. **Materials & labor-hour tracking on work orders.** Cityworks' core strength; SeeClickFix has none. Impact 4, Effort L.
54. **Crew scheduling / calendar dispatch.** Drag work orders onto a crew calendar. Impact 3, Effort M.
55. **Route optimization for crew runs.** Cluster nearby open orders into an efficient route. Impact 3, Effort L, Moat med.
56. **Parts / inventory linkage.** Flag when a fix needs a part not in stock. Impact 2, Effort L.
57. **Bulk actions on work-order grid.** Multi-select assign/close/reprioritize. Impact 3, Effort S.
58. **Configurable per-city workflows / statuses.** Beyond category config; full state-machine per city. OUTFLANK #33. Impact 3, Effort L.
59. **Automated crew notifications (SMS to field staff).** Member phones already stored. Impact 3, Effort S.
60. **Time-on-site / completion verification with geo-stamp.** Prove the crew was there. Impact 2, Effort M.
61. **Recurring / scheduled maintenance work orders.** Not just reactive — preventive schedules. Impact 3, Effort M.
62. **Contractor / third-party dispatch.** Assign to external vendors with a limited portal. Impact 2, Effort L.

## F. Emergency, Weather & Surge

63. **Storm/emergency surge mode (auto-reprioritize).** Config exists; auto-reprioritize unwired. OUTFLANK #46. Impact 4, Effort M, Moat high. — *Zero competitors have purpose-built disaster mode.*
64. **Disaster triage intake mode.** Switch UI from routine reporting to rescue/hazard triage during declared events. Impact 4, Effort L, Moat high.
65. **Satellite/aerial damage import (post-event).** Google SKAI classified Helene/Milton damage in hours. Impact 3, Effort XL.
66. **Auto-escalation to 911/EMA for life-safety.** Emergency interstitial exists; add real routing. Impact 4, Effort M.
67. **Weather-triggered proactive alerts.** "Flooding likely on these known-problem drains." NWS integrated. Impact 3, Effort M.
68. **Utility-outage overlay.** Cross-reference power/water outages. Impact 2, Effort M.

## G. IoT & Sensors (long-term moat, nobody closes this loop)

69. **IoT sensor → auto-work-order.** Water-leak/sewer-pressure/streetlight sensors file reports. No commercial platform closes this. OUTFLANK-adjacent. Impact 4, Effort XL, Moat very high.
70. **Fleet-vehicle road-defect detection.** Accelerometer/dashcam on city trucks geo-tags defects. Cal DOT model. Impact 3, Effort XL, Moat very high.
71. **Smart-streetlight integration.** Auto-report outages. Impact 2, Effort L.
72. **Digital-twin asset feed.** 311 report → twin update → predicted maintenance. Academic today; 24+ mo. Impact 3, Effort XL, Moat very high.
73. **Generic sensor webhook ingestion API.** Let any IoT vendor POST an event that becomes a report. Impact 3, Effort M.

## H. Integrations & Ecosystem (Wedge W5: integrate, don't replace)

74. **Cityworks / Unity Maintain connector.** Feed the dominant CMMS. OUTFLANK #25. Impact 5, Effort L, Moat high. — *Migration crisis (Unity rebrand) = perfect timing to be the modern intake layer.*
75. **Accela connector.** OUTFLANK #26. Impact 4, Effort L.
76. **Esri/ArcGIS live layer export.** Push reports as a live feature layer (ingest exists; export doesn't). OUTFLANK #29. Impact 4, Effort M.
77. **Tyler Technologies ERP connector.** Financials/ERP is the #1 city integration ask. Impact 4, Effort L.
78. **Salesforce connector.** For cities already on Agentforce. Impact 3, Effort L.
79. **Webhooks + Zapier/Make outbound.** OUTFLANK #28. Impact 4, Effort M, Moat med.
80. **Embeddable widgets.** Drop-in "Report an issue" widget for any city website. OUTFLANK #21. Impact 4, Effort M.
81. **SeeClickFix / legacy data migration importer.** De-risk switching. OUTFLANK #32. Impact 4, Effort M, Moat high. — *Removes the #1 switching barrier: "we'd lose our history."*
82. **Self-serve CSV/Excel/email-digest export.** Impact 3, Effort S.
83. **SSO / SAML / municipal identity.** Procurement gate for larger cities. OUTFLANK #30. Impact 4, Effort M.
84. **Social-media intake bridge.** Ingest tagged posts (X/Facebook) as reports. Impact 2, Effort L.
85. **GTFS / transit-agency routing.** Route transit-stop issues to the right agency. Impact 2, Effort M.

## I. Engagement & Public Accountability (Wedge W3)

86. **Trending-issues demand feed from upvotes.** Upvote button exists; demand-ranked public feed doesn't. OUTFLANK #19. Impact 4, Effort S.
87. **Auto social cards per resolved issue.** "Fixed in 3 days" OG image. Share code exists; auto-OG doesn't. OUTFLANK #22. Impact 3, Effort S, Moat med.
88. **Resident reputation / trusted-reporter profile.** Reduce frivolous reports; reward good reporters. OUTFLANK #20. Impact 3, Effort M.
89. **Gamified civic engagement.** Badges/streaks for neighborhood stewardship. OUTFLANK #48. Impact 2, Effort M.
90. **Neighborhood scorecards.** Public "your area vs city average." Impact 3, Effort M, Moat med.
91. **"Adopt-a-drain/hydrant" stewardship.** Residents claim assets to monitor. Impact 2, Effort M.
92. **Public roadmap / "what we're working on this month."** Impact 2, Effort S.
93. **Comment / corroborate on existing reports.** "+1 I see this too" without a new ticket (dedup assist). Impact 3, Effort S.

## J. Privacy, Security, Compliance & Trust (procurement gates)

94. **SOC 2 Type II readiness.** First cert to pursue; table-stakes for procurement. Impact 5, Effort L, Moat high.
95. **GovRAMP (StateRAMP) Ready status.** Next gate for state/federal grant money. Impact 4, Effort XL.
96. **PII redaction in free-text fields.** OUTFLANK #39 / REVAMP #39 — unbuilt. Impact 4, Effort M. — *Hard rule adjacency; strong trust story.*
97. **Privacy audit dashboard (browser UI).** `pnpm audit:privacy` exists as a script only. OUTFLANK #34. Impact 3, Effort M.
98. **Automated compliance report PDF (public trust badge).** OUTFLANK #35/#36. Impact 3, Effort M, Moat med.
99. **Configurable per-city data-retention policies (UI).** `retention.ts` exists; no UI. OUTFLANK #38. Impact 3, Effort S.
100. **Full RLS regression coverage + public "we don't sell your data" trust page.** OUTFLANK #36. Impact 3, Effort M. — *No US competitor markets privacy; make it a brand pillar.*

---

## TOP 15 — Build these first

Ranked by (Impact × Moat) ÷ Effort, weighted toward things that (a) attack a universal pain point, (b) no incumbent solves, and (c) unblock the Cumming pilot / procurement.

| # | Feature | Why now | Impact | Effort |
|---|---------|---------|--------|--------|
| 1 | Live SMS/email delivery (#1) | Trust dies in silence; code already exists, just dark | 5 | S |
| 38 | Equity analytics dashboard (#38) | Strongest procurement differentiator; zero competitors | 5 | M |
| 5 | No-generic-closures + AI explanation (#5) | Kills the #1 resident complaint industry-wide | 5 | M |
| 2 | SMS inbound intake (#2) | Reaches the excluded (senior/low-income/feature-phone) | 5 | M |
| 74 | Cityworks/Unity connector (#74) | Migration crisis = perfect timing; W5 wedge | 5 | L |
| 26 | Human-in-loop feedback → fine-tune (#26) | Compounding AI moat; schema already there | 4 | M |
| 52 | Field-crew mobile PWA (#52) | Owns intake→dispatch; SeeClickFix can't | 4 | L |
| 81 | Legacy data migration importer (#81) | Removes #1 switching barrier | 4 | M |
| 16 | QR walk-up reporting (#16) | Cheap, unique, demo-friendly | 4 | S |
| 40 | Peer-city benchmark analytics (#40) | Sells itself to city managers | 4 | M |
| 63 | Storm/emergency surge mode (#63) | Config exists; no competitor has it | 4 | M |
| 94 | SOC 2 Type II readiness (#94) | Unlocks the whole procurement pipeline | 5 | L |
| 31 | Multilingual AI intake+status (#9/#31) | LLM-native for us; OpenGov's headline feature | 4 | S |
| 27 | AI hazard-grade from image (#27) | Extends our vision lead nobody else has | 4 | M |
| 86 | Trending-issues demand feed (#86) | Upvotes already there; W3 accountability | 4 | S |

---

## Strategic framing (one paragraph)

Incumbents split into two failing camps: **citizen-friendly but operationally shallow** (SeeClickFix — great intake, no work order, PE-squeezed, locked-down admin) and **operationally deep but citizen-hostile** (Accela/Cityworks — powerful back-office, dated UX, 6–18 mo implementations, security incidents). Civic wins by being the only platform that is *both* — frontier-vision AI intake + privacy-by-default + a real accountability dashboard on the front, and Open311-native connectors feeding (not replacing) the CMMS/ERP on the back. The uncontested white spaces to plant flags in **now**: equity analytics (#38), close-the-loop trust (#1/#5), and the Cityworks-migration moment (#74). Small/mid Georgia cities ($15K–$40K/yr) are the beachhead Salesforce and Accela can't economically serve.

---

*Generated from live codebase inventory + multi-source web research. Full competitor citations in the research transcript. Cross-reference `OUTFLANK.md` (original 50) and `STATE.md` for build status.*
