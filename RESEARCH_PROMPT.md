# CIVIC — MASTER DEEP RESEARCH PROMPT
## AI-Native Civic Infrastructure Reporting | Go-to-Market, Competitive, Product, Legal, Technical

**Output instruction: When research is complete, write ALL findings to `civic_research_findings.md` in the repo root. Use the exact schema defined at the bottom of this document. Do not summarize inline — the file IS the deliverable.**

---

## PRODUCT CONTEXT (read before any research)

**Civic** = two-sided SaaS. Residents photograph broken infrastructure → Gemini 2.5 Flash classifies photo → AI generates work order (crew type, materials, est. minutes, priority score, cost) → city staff dispatches → public dashboard creates accountability pressure.

**Resident side:** Photo-first report (1-tap), short description, tags. Browse + upvote local issues. Anonymous-friendly. Privacy blur mandatory (faces + plates, client-side before upload).

**Admin side:** Rich dashboard — map (PostGIS + Mapbox), work orders, estimated cost, urgency score, vendor/contact directory, routing to departments/crews.

**Stack:** Next.js 15, Supabase (Postgres 15 + PostGIS + Auth + Storage + Realtime), Gemini 2.5 Flash (vision + classification + work order), Mapbox GL JS v3, Vercel, Open311 GeoReport v2 compatible.

**Stage:** MVP. Hackathon origin. Seeking first paid pilot. 283-row outreach lead list built. Primary target: Cumming, Georgia / Forsyth County. Secondary: HOA management companies (CMA Communities tops the list), CIDs, private campuses.

**Working hypotheses (research must confirm OR kill each one):**
- H1: No AI-native competitor serves <50k-pop municipalities under $500/mo
- H2: HOA management companies are a better beachhead than municipalities (faster close, lower CAC)
- H3: Open311 compliance is a contract-winning differentiator, not just a checkbox
- H4: Resident upvoting increases report volume without inflating false positives
- H5: Gemini 2.5 Flash is cost-competitive vs. GPT-4o for infrastructure classification at 1k reports/day
- H6: Face-blur-before-upload satisfies all current US state biometric privacy laws for a Georgia pilot

---

## RESEARCH STANDARDS (non-negotiable)

Every finding must be tagged:
- `[CONFIRMED]` — primary source (contract record, official doc, published pricing page, peer-reviewed paper, government budget doc). Include URL + date.
- `[ESTIMATED]` — analyst report, credible secondary source, or triangulated from multiple indirect signals. State method.
- `[INFERRED]` — logical deduction from confirmed facts. State the chain.
- `[UNRESOLVED]` — searched, couldn't find. State what was searched and where it hit a wall.

Stale data rule: AI/pricing findings older than 12 months must be flagged as `[STALE]`. Gov/legal findings older than 24 months must be flagged as `[STALE]`.

For any finding that would change a major product/GTM decision: require a second source that could CONTRADICT it. If the second source contradicts, report both, flag `[CONFLICT]`, and state which is more credible and why.

---

## PHASE 1 — KILL LIST (do this first, in parallel, before deep research)

These are existential risks. If any returns "YES", flag immediately as `[BLOCKER]` and prioritize that section.

**K1 — Entrenched AI competitor:** Does any company currently offer AI-native photo classification + auto work order generation for municipalities or HOAs at under $1k/mo? Search: G2 Crowd GovTech category, Capterra "311 software" reviews, ProductHunt "civic" + "government" launches 2023-2026, Crunchbase "civic tech" + "AI" companies founded 2022-2026. Answer: YES/NO + company name + pricing evidence.

**K2 — Legal blocker (BIPA):** Has any Illinois Biometric Information Privacy Act case established that browser-side face DETECTION (even without storage) constitutes "collection" under BIPA? Search: Westlaw/Google Scholar BIPA case law 2023-2026, IAPP news, privacy law blogs (Hunton Andrews Kurth, Covington). Answer: YES/NO + case citation.

**K3 — SeeClickFix AI pivot:** Has SeeClickFix (CivicPlus) shipped or announced AI photo classification or auto work order generation since 2023? Search: CivicPlus press releases, SeeClickFix changelog/blog, LinkedIn posts from SeeClickFix product team, ProductHunt. Answer: YES/NO + evidence.

**K4 — Supabase Realtime hard limit:** Is the 200-concurrent-subscriber-per-channel limit a hard architectural limit or a soft default that can be raised? Search: Supabase GitHub issues, Supabase Discord #realtime channel, Supabase docs. Answer: HARD/SOFT/UNKNOWN + evidence.

**K5 — Open311 is dead:** Is Open311 GeoReport v2 actually used in active city procurement decisions in 2024-2026, or is it a legacy spec that evaluators ignore? Search: recent 311 RFPs on government procurement portals (SAM.gov, state procurement portals), ICMA tech surveys, Open311.org activity. Answer: ALIVE/DEAD/CEREMONIAL + evidence.

---

## PHASE 2 — DEEP RESEARCH DIMENSIONS (run all in parallel after Phase 1)

### D1 — Competitive Intelligence (Surgical)

**Goal: Produce a feature × price × customer-segment matrix for every relevant competitor.**

For each competitor below, find: (a) confirmed pricing or best estimate with method, (b) AI features shipped vs. roadmap, (c) Open311 compliance status, (d) who actually uses them (find 3+ named city/HOA customers), (e) their weakest G2/Capterra reviews (what do customers hate), (f) contract length and lock-in mechanisms.

**Tier 1 — Direct (must research all):**
- **SeeClickFix / CivicPlus** — FOIA any city contract mentioning "SeeClickFix" from state procurement databases (Texas, Florida, Georgia open records). Find actual ACV from contract records. Check LinkedIn for headcount trends (shrinking = acquisition integration pain).
- **Salesforce Public Sector (311 CRM)** — find minimum viable deal size. Search city IT RFPs 2023-2025 that mention Salesforce 311. Is this segment they actively sell, or is it incidental?
- **Accela** — find their 311/citizen service module pricing. Search "Accela" in Georgia state contracts database. What's minimum city size they target?
- **Zencity** — what do they actually do vs. what Civic does? Overlap analysis. Find their customer list (press releases, LinkedIn "works at Zencity" alumni who listed customer names).
- **PublicInput** — feature overlap map. Do they have any infrastructure reporting or is it purely engagement/surveys?
- **Esri / ArcGIS 311** — is this an actual product or just an integration layer? Find one city using it and what the total cost of ownership looks like.

**Tier 2 — Adjacent threats (brief, 2-3 facts each):**
- Nextdoor Neighborhoods issues tab — does Nextdoor sell any admin dashboard to municipalities?
- Apple Maps "report a problem" — does it feed any city system or just Apple internal?
- FixMyStreet (mySociety, UK) — is there a US deployment? Any city using it?
- Lagan CRM (now Verint) — still active in US 311 market?

**Specific intelligence tactic:** Search the Wayback Machine for competitor pricing pages from 2022-2024 to find historical pricing that was later removed. Search "SeeClickFix pricing" and "Accela pricing" on archive.org.

**Output format for D1:**
```
| Competitor | Confirmed Price | AI Features | Open311 | Weakest Point | Named Customers |
```
Plus: 3-sentence positioning statement for Civic vs. each Tier 1 competitor.

---

### D2 — Buyer Personas (Decision Dynamics)

**Goal: For each buyer type, find the EXACT purchase path, not a generic description.**

**Buyer Type A: City Manager / Administrator, city population 5k–75k**

Find answers to these specific questions:
1. What is the sole-source contract threshold in Georgia (dollar amount where RFP is NOT required)? Check Georgia Code § 36-91-20 and Georgia Procurement Manual. This is the number Civic needs to price below for pilot.
2. What co-op purchasing vehicles are active in Georgia? Search: Sourcewell (formerly NJPA) Georgia member list, OMNIA Partners Georgia, TIPS Network Georgia, Georgia state contract schedules (doas.georgia.gov). Can a Georgia city buy SaaS from a Sourcewell contract without RFP?
3. What KPIs do city managers actually track for infrastructure maintenance? Find: ICMA Center for Performance Management benchmarks, any city that published a 311 annual report 2023-2025 (search "[city name] 311 annual report" PDF). Extract: calls-per-1k-residents, digital submission %, mean-time-to-close by category.
4. Find 3 named city managers in Forsyth County / North Atlanta metro who have publicly spoken about infrastructure tech. Search: GMA conference speakers 2023-2025, local news quotes, LinkedIn.

**Buyer Type B: HOA Community Manager / Management Company**

1. What is CMA Communities' current tech stack for maintenance request tracking? Search: CMA Communities LinkedIn job postings (they reveal software names), AppFolio/Buildium/Vantaca partner directories, CMA Communities website. Does AppFolio have a built-in maintenance module that directly competes?
2. What does a community manager at a 300-unit HOA actually use today? Find: HOA management Facebook groups, Reddit r/HOA, CAI (Community Associations Institute) forum posts complaining about maintenance software. Extract: top 3 pain points verbatim.
3. Pricing anchor: AppFolio charges ~$1.40/unit/month for property management. What would HOA community managers pay for a dedicated infrastructure reporting layer on top? Find any pricing discussion on CAI forums or HOA management blogs.
4. CAI (Community Associations Institute) — how to get in front of HOA managers? Find: CAI Georgia Chapter conference calendar, vendor/partner program costs, member count.

**Buyer Type C: CID Executive Director (Metro-ATL)**

For each of these specific CIDs, find: (a) annual budget, (b) current maintenance/clean-safe vendor, (c) name + LinkedIn of Executive Director, (d) whether they have any digital infrastructure tracking:
- Cumberland CID
- Buckhead CID  
- Perimeter CID
- Town Brookhaven CID
- Midtown Alliance (not technically CID but similar)
- Cumming/Forsyth — does Cumming have a downtown development authority or CID at all?

Search: Georgia CID Association annual reports, CID 990 tax filings on ProPublica Nonprofit Explorer (CIDs are often 501c6), Atlanta Business Chronicle CID coverage.

---

### D3 — GTM Channel Research (Specific, Actionable)

**Goal: Produce a ranked channel list with specific first actions, not categories.**

**Channel 1: Georgia Municipal Association (GMA)**
- Find: GMA Annual Conference 2026 date + location. Vendor/exhibitor application deadline and cost. Is there a GovTech-specific track or demo opportunity?
- Find: GMA Technology Committee members (named individuals). Who runs the vendor marketplace / buyer's guide?
- Decision: Is GMA conference worth $X cost for lead gen at Civic's stage, or is direct outreach to 5 target cities higher ROI? Produce a yes/no recommendation with reasoning.

**Channel 2: HOA Management Company Channel (Reseller path)**
- Research: Does Associa (largest HOA management company, 6,500+ communities) have a preferred vendor or technology partner program? Find the specific contact/program page.
- Research: Does FirstService Residential have a vendor program?
- Research: Does CMA Communities (Cumming/Forsyth top lead) have any precedent for adopting new tech tools for their portfolio? Find any press releases or LinkedIn posts from CMA Communities about software.
- Decision: If Civic signs CMA Communities as a customer, do they get access to CMA's portfolio as a reseller, or does each HOA sign separately? What does the contract structure look like?

**Channel 3: Open311 / Civic Tech Ecosystem**
- Find: Code for America current brigade activity in Georgia (Atlanta Brigade?). Are they active? Do they have relationships with city IT departments?
- Find: GovTech marketplace / vendor directory — what does it cost to be listed? Who browses it?
- Find: ICMA (International City/County Management Association) vendor program — does one exist, what does it cost, who sees it?

**Channel 4: Cold Outreach (current primary motion)**
- Research: Best-performing cold email frameworks for B2G (business to government) SaaS in 2024-2025. Find: any published case studies from GovTech sales teams, Pavilion GTM community posts, or sales podcasts with GovTech reps.
- Research: What cold email open rates / reply rates are realistic for City Manager outreach? Find any benchmark data for B2G email (not generic B2B).
- Research: LinkedIn InMail vs. direct email for HOA community manager outreach — which has higher response rate? Find any data.
- Specific tactic research: Find whether any Georgia city manager participates in online communities (GovLoop, ICMA Connect, LinkedIn groups) where authentic engagement is possible before cold outreach.

---

### D4 — Pricing & Unit Economics (Numbers Only)

**Goal: Produce a specific pricing recommendation with the data behind it.**

**Find these specific data points:**

1. **SeeClickFix actual contract value**: FOIA search in Georgia, Florida, Texas, California open records for contracts containing "SeeClickFix". If FOIA takes too long, find any city council meeting minutes mentioning the contract value (search "[city name] SeeClickFix contract" on city website search). Find at least 3 data points. Report as: City, Population, Annual Contract Value, Year.

2. **Supabase pricing at scale**: What does Supabase Pro + add-ons cost at 10GB storage + 100k MAUs + Realtime enabled? Find exact pricing from supabase.com/pricing. What's the next tier? At what point does self-hosted become cheaper than Supabase cloud?

3. **Gemini 2.5 Flash cost per report**: Current pricing at ai.google.dev/pricing. For one report: (a) vision classification call — input tokens (system prompt ~500 + image ~1000 tokens equivalent), output tokens (~200), (b) work order generation call — input (~800), output (~400), (c) embedding call for dedup — input (~100). Calculate: cost per report at current pricing. Scale to: 100 reports/day/city, 500 reports/day/city, 1000 reports/day/city. Monthly cost per city at each scale.

4. **Mapbox pricing**: Current Mapbox GL JS pricing for web maps. At 50 staff sessions/day (admin dashboard), each loading a map tile set — estimate monthly Mapbox cost per city. Check mapbox.com/pricing.

5. **Vercel pricing**: At what traffic level does Vercel Pro ($20/mo) become insufficient? What does Vercel Team run for a production Next.js app? Check vercel.com/pricing.

6. **HOA per-door pricing benchmarks**: Find actual per-door/per-unit pricing from: AppFolio (search pricing page + G2 reviews mentioning price), Buildium (same), CINC Systems, Vantaca. Produce a table: Product, Per-unit/mo, Min community size, Notes.

7. **Infrastructure reporting market size**: Find any analyst estimate for: 311 software market size, government CRM market size, smart city platform market. Report source, year, methodology, and whether it includes AI-native tools.

**Pricing model to build:**
Based on findings, fill in:
```
Municipal: $___/city/mo (pop <10k) | $___/city/mo (10-50k) | $___/city/mo (50k+)
HOA: $___/unit/mo (min ___ units)
CID: $___/year flat
Private Campus: $___/year flat
Pilot (90-day): $___  
Gross margin estimate at 100 cities: ___%
```

---

### D5 — Product-Market Fit Signals (Behavioral Data)

**Goal: Find evidence that residents WILL report and governments WILL pay — not theory.**

**Resident behavior:**

1. Find any city that published a 311 channel-shift report (phone → app/web). Search: "[city] 311 annual report channel shift" for cities known for strong digital gov (Austin, Boston, DC, Chicago, San Francisco). What % of reports are now digital vs. phone? What drove the shift?

2. SeeClickFix network effect data: Find any published stat on: reports per city per month on SeeClickFix, resident adoption rate after city deployment, whether upvote/me-too features increased report volume or just redistributed it. Search: SeeClickFix press releases, Ben Berkowitz (founder) talks on YouTube, academic papers citing SeeClickFix data.

3. FixMyStreet (UK mySociety) open data: They publish usage data. Find: reports per year, photo attachment rate, resolution rate by category. This is the best proxy for what resident behavior looks like on a photo-first civic reporting tool. URL: fixmystreet.com/stats or mySociety published research.

4. Anonymous reporting effect: Find any academic paper or city report comparing anonymous vs. authenticated civic reporting. Does anonymity increase volume? Does it increase noise? Search Google Scholar: "anonymous 311 reporting" "civic reporting anonymity".

**Government willingness to pay:**

5. Find 3 cities that switched 311 systems in the last 3 years. What did they switch FROM and TO? What was the stated reason? Search: city council meeting minutes, local news, GovTech.com city news. This shows what cities are willing to pay and what drives switching.

6. Find any published ROI case study from a city using SeeClickFix or similar. Did they measure: reduction in 311 call volume? Reduction in mean time to close? Resident satisfaction improvement? These become Civic's proof-point template.

---

### D6 — AI Pipeline Technical Benchmarks

**Goal: Validate or challenge Civic's AI architecture choices with real data.**

1. **Gemini 2.5 Flash vs. alternatives for infrastructure classification:**
   - Find any published head-to-head eval of Gemini Flash vs. GPT-4o mini vs. Claude Haiku for structured output + vision tasks (NOT general benchmarks — find domain-specific or structured output evals).
   - Search: LMSYS Chatbot Arena vision category, Artificial Analysis benchmark site, any GovTech AI pilot reports.
   - Find: Does Google offer batch/async inference for Gemini that would cut costs 50%+ for non-realtime classification? Check Google AI documentation.

2. **Infrastructure damage detection accuracy:**
   - Find: Road Damage Detection Challenge (RWDC) 2022-2024 results. What's the state-of-the-art F1 for pothole detection in real-world photos? Is this achievable with a general vision model like Gemini, or does it require fine-tuning?
   - Find: Any city or research team that published accuracy results for AI-classified infrastructure reports. Search: "automated pothole detection accuracy" on Google Scholar, IEEE Xplore.
   - Critical question: What's the false negative rate for "is_emergency" classification at production quality? A missed emergency is a liability event. Find any data.

3. **Duplicate detection (embedding + geo-radius):**
   - Find: What cosine similarity threshold between text embeddings distinguishes "same pothole reported twice" from "two different potholes 30 meters apart"? Search: any published dedup research for user-generated content at location-based services.
   - Find: Google's text-embedding-004 documentation — what's the embedding dimension and recommended similarity threshold?

4. **Client-side face blur (MediaPipe / FaceDetector API):**
   - Find: P95 inference latency for browser-side face detection on a 2022-era mid-range Android (Snapdragon 778G class). Search: Chrome team performance blog, MediaPipe benchmark posts, WebNN API status.
   - Find: Browser support table for `FaceDetector` API (Web Detection API). Is it available on Samsung Internet, Firefox, Safari? What's the fallback strategy if API unavailable?

5. **Supabase Realtime scalability:**
   - Find: Any published case study or forum post of a team running Supabase Realtime at >500 concurrent subscribers. What did they do? Shard by city? Switch to server-sent events? Use Postgres LISTEN/NOTIFY directly?

---

### D7 — Legal & Compliance (Deal-Blockers First)

**Goal: Find every legal requirement that could block a pilot contract or create liability.**

**Privacy (ordered by deal-block probability):**

1. **Illinois BIPA browser-side detection**: Find the most recent BIPA case law (2024-2025) on whether browser-side biometric processing without storage constitutes "collection." Key cases to find: Rosenbach v. Six Flags (2019, foundation), any 2023-2025 cases on ephemeral processing. Find: IAPP BIPA tracker, law firm privacy blogs. Answer: Does Civic need a BIPA waiver/consent flow for Illinois users even with face-blur-before-upload?

2. **Georgia state biometric law**: Does Georgia have a biometric privacy law? Search: Georgia Code Title 10, IAPP US State Privacy Legislation Tracker. Answer: YES/NO/PENDING.

3. **CCPA/CPRA geolocation**: Is GPS-tagged report location data "sensitive personal information" under CPRA Section 1798.121? Find: California Attorney General guidance, CPRA regulations. Does this affect Civic even for a Georgia-only pilot if California residents could theoretically report? 

4. **Photography in public law**: Can residents legally photograph infrastructure issues from public property in Georgia without privacy concerns? Find: Georgia Code § 16-11-62 (invasive photography), relevant case law. Is there any exposure for Civic if a resident photos a private property from a public street?

5. **Raw photo retention (30-day TTL)**: Is 30-day TTL on raw photos (with faces/plates) sufficient to avoid being a "data broker" or triggering any state law's data retention limits? Find: applicable laws in states where Civic plans to expand.

**Government software compliance:**

6. **SOC 2 requirement threshold**: At what contract value or data sensitivity level do small-city IT departments require SOC 2 Type II? Find: any GovTech RFP from 2023-2025 mentioning SOC 2. Search: SAM.gov, state procurement portals. Is there a threshold (e.g., "contracts over $50k" or "systems handling PII") where it becomes mandatory?

7. **FedRAMP for city-level**: Does FedRAMP authorization matter at city (not federal) level? Find: any Georgia state IT security policy that cascades FedRAMP requirements to local governments. Check: gta.georgia.gov (Georgia Technology Authority).

8. **ADA Section 508 / WCAG 2.1 AA**: Is WCAG 2.1 AA compliance contractually required in typical small-city software procurement? Find: any Georgia city IT procurement standard mentioning accessibility. What does this mean for Civic's photo-upload flow on mobile?

---

### D8 — Cumming / Forsyth County Pilot Intelligence

**Goal: Know everything knowable about the target pilot customer before first outreach.**

1. **Current tech stack**: What software does City of Cumming currently use for: work orders, 311/citizen requests, GIS, permitting? Search: city council meeting minutes on cityofcumming.us, Georgia Open Records Act requests, city IT job postings (reveal software names), vendor press releases mentioning Cumming GA.

2. **Infrastructure pain signals**: Find any local news coverage (Forsyth County News, Atlanta Journal-Constitution) about potholes, road damage, citizen complaints about infrastructure in Cumming/Forsyth 2023-2026. These become the sales narrative.

3. **Decision maker identification**: 
   - City Manager of Cumming, GA — name, email, LinkedIn, tenure
   - Forsyth County Administrator — name, email, LinkedIn
   - Cumming Public Works Director — name, contact
   - Do they appear in GMA or GCCMA member directories?

4. **Forsyth County growth data**: Find official population growth stats for Forsyth County 2020-2025. What's the infrastructure stress index (road miles per capita, growth rate vs. maintenance budget)? Source: Forsyth County CAFR (Comprehensive Annual Financial Report), census.gov.

5. **HOA density**: How many HOA communities are in Forsyth County? Who manages them? CMA Communities lists on their website — verify how many are in Forsyth/Cumming specifically. Find any other management companies with significant Forsyth HOA presence.

6. **CID/BDA**: Does Cumming have a Downtown Development Authority (DDA)? Search: Georgia DDA directory on dca.ga.gov. If yes: who runs it, what's their budget, are they a potential customer?

7. **Competitive intel for Cumming**: Is SeeClickFix or any competitor currently contracted with City of Cumming or Forsyth County? Search: Georgia procurement portal, city budget docs, city council minutes mentioning "311" or "citizen reporting."

---

## PHASE 3 — ADVERSARIAL VERIFICATION (after Phase 2)

For each of the 6 working hypotheses (H1-H6 above), after Phase 2 research:

- State what Phase 2 found that SUPPORTS the hypothesis
- State what Phase 2 found that CHALLENGES the hypothesis  
- Assign: `[CONFIRMED]`, `[CHALLENGED]`, `[KILLED]`, or `[INSUFFICIENT DATA]`
- If `[KILLED]`: state what Civic must change as a result

For H1 specifically (no AI-native competitor under $500/mo): recruit a second independent search using different keywords than the first search. If results conflict, report both.

---

## PHASE 4 — SYNTHESIS (write to file)

Produce these 9 decision artifacts, written to `civic_research_findings.md`:

### S1 — Hypothesis Verdicts Table
```
| Hypothesis | Verdict | Confidence | Key Evidence | What Changes If Wrong |
```

### S2 — Beachhead Ranking (top 5 customer archetypes)
For each: archetype name, estimated deal size (ACV), estimated sales cycle (weeks), estimated CAC, replicability score (1-5), and the ONE unlock that makes this segment work.

### S3 — Competitive Gap Map
2×2: Y-axis = AI capability (high/low), X-axis = price (low/high). Place each competitor. Mark where Civic sits. Identify empty quadrants.

### S4 — Pricing Recommendation
Specific dollar amounts for every segment. Show the math (cost floor + margin target + willingness-to-pay cap from research).

### S5 — Legal Landmine Register
```
| Issue | Jurisdiction | Probability of Blocking Deal | Severity | Mitigation |
```
Ordered by: (Probability × Severity), descending.

### S6 — GTM Sequence (3 motions, ordered)
For each motion: (a) specific first action this week, (b) success metric at 30 days, (c) kill signal (when to abandon).

### S7 — AI Cost Model
Table: reports/day → monthly AI cost → monthly infra cost → minimum viable price → gross margin at that price. For 100, 500, 1000 reports/day/city.

### S8 — Product Gap Register
Features Civic MUST build to win each beachhead. Not nice-to-haves. For each gap: which beachhead it blocks, effort estimate (S/M/L), dependency (if any).

### S9 — Open Questions (Primary Research Required)
Top 10 questions this desk research could NOT answer. For each: what primary research would answer it (specific interview target, FOIA request, pilot instrumentation), and how much it matters (CRITICAL / HIGH / MEDIUM).

---

## OUTPUT FILE SCHEMA

Write to `civic_research_findings.md` with this exact structure:

```markdown
# Civic Research Findings
Generated: [date]
Research scope: [dimensions covered]
Total sources: [count]
Confidence distribution: [X% CONFIRMED, Y% ESTIMATED, Z% INFERRED, W% UNRESOLVED]

## KILL LIST RESULTS
[K1-K5 verdicts, each with evidence]

## HYPOTHESIS VERDICTS
[H1-H6 table]

## D1 — COMPETITIVE INTELLIGENCE
[Competitor matrix + positioning statements]

## D2 — BUYER PERSONAS
[Decision dynamics per buyer type, named contacts where found]

## D3 — GTM CHANNELS
[Ranked channel list with specific first actions]

## D4 — PRICING & UNIT ECONOMICS
[Filled pricing model + cost model table]

## D5 — PRODUCT-MARKET FIT SIGNALS
[Behavioral data with sources]

## D6 — AI PIPELINE BENCHMARKS
[Technical validation findings]

## D7 — LEGAL & COMPLIANCE
[Landmine register]

## D8 — CUMMING/FORSYTH PILOT INTEL
[Named contacts, tech stack, pain signals]

## SYNTHESIS
[S1-S9 decision artifacts]

## SOURCE LOG
[Every source used: URL, date accessed, confidence tag]
```

---

## SEARCH STRATEGY NOTES

**Procurement databases to check:**
- SAM.gov (federal, but sometimes city sub-contracts)
- Georgia Procurement Registry: doas.georgia.gov
- Georgia Open Records Act portal (submit request for City of Cumming contracts if needed)
- Sourcewell contract holder list: sourcewell-mn.gov/cooperative-purchasing/find-contract
- OMNIA Partners public sector awards

**Competitive intelligence tactics:**
- Wayback Machine (web.archive.org): search competitor pricing pages 2021-2024
- LinkedIn: search "SeeClickFix" + "customer" or "implementation" for named city customers
- G2 Crowd: filter "311 software" reviews, read 2-3 star reviews for pain points
- Capterra: same
- Crunchbase: search "civic tech" + "AI" companies, filter by founding year 2021-2026, check funding rounds
- ProPublica Nonprofit Explorer: search CID names for 990 filings (reveals budgets)
- Google: `site:cityofcumming.us "work order"` or `site:forsythco.com "software"` for tech stack clues

**Georgia-specific:**
- Georgia Municipal Association: gmanet.com
- Georgia Technology Authority: gta.georgia.gov
- Georgia Open Records: search each target city name + "technology" + "contract"
- Atlanta Business Chronicle archive: search CID names

**Academic sources:**
- Google Scholar: "civic reporting" "311" "resident behavior" "upvoting"
- IEEE Xplore: "pothole detection" "infrastructure damage classification" "deep learning"
- mySociety published research: research.mysociety.org

---

*This is a living research document. As findings invalidate hypotheses, update S1 immediately. If a BLOCKER is found in Phase 1, stop and report before continuing Phase 2.*
