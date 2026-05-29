# CONTEXT

> Product and market context. The "why." For technical "how," see `DESIGN.md`. For agent instructions, see `AGENTS.md` at the repo root.

## TL;DR

Cities run 311 systems as dumb ticket queues. Residents report a problem, a human classifies it, a human routes it, a crew rolls out (often without the right materials), and resolution takes days to weeks. Civic replaces the human triage layer with an AI that classifies photos, generates work orders, dedups duplicates, and predicts failures. We launch resident-first in Cumming, Georgia, build a public accountability dashboard that makes city performance legible, then sell the official integration to the city once residents are already using it.

## Problem

The bottleneck in 311 is not intake. It is the human work between intake and dispatch.

Hard data:

| City | Metric | Value | Source |
|------|--------|-------|--------|
| New York City | Average 311 resolution | 3 days | NYC Council 311 data |
| New York City | 311 contacts per year | 42 million | NYC Council 311 data |
| Memphis | Pothole resolution | 3-7 business days | memphisgov.com/service-requests |
| Memphis | Streetlight resolution | 5-10 business days | memphisgov.com/service-requests |
| Memphis | On-time resolution last month | 82% | memphisgov.com/service-requests |
| Winnipeg | Hazardous sidewalk repair | 61.8 days avg (target: 2 days) | CBC FOI analysis |
| Winnipeg | Missed garbage pickup | 4.7 days avg (target: 2 days) | CBC FOI analysis |

The Carnegie Mellon SEI estimates that 60-80% of software development cost is rework driven by unclear requirements. The same dynamic applies to city service delivery: a vague report sent to the wrong crew with wrong materials is the rework.

## Why now

Three things converged in the last 18 months:

1. **Vision LLMs got cheap.** Gemini 2.5 Flash classifies a photo for around $0.0001. Two years ago this was 50x more expensive and 10x slower.
2. **PWAs finally work on iOS.** Push notifications, install prompts, and camera access work well enough to skip the App Store for v1.
3. **City public works is in a labor crisis.** AAMVA reports a 40-year low in municipal workforce participation. Cities cannot hire enough triage staff. AI triage went from "nice to have" to forced.

Two years ago, Civic was technically possible but expensive and unwanted. Today, cheap and demanded.

## Industry context: Open311

Open311 GeoReport v2 is the standard API for citizen service requests, originally driven by San Francisco, Washington DC, and Boston. SeeClickFix, Lagan, Motorola PremierOne CSR, and others implement it. Cities expect Open311 compatibility. We treat this as table stakes.

What this means for us:
- Every report Civic stores must be exportable as Open311 GeoReport v2 JSON and XML.
- We can pull data from existing Open311 endpoints (NYC, SF, DC, Boston, ~30 other US cities) to seed the public dashboard for cities we have not yet partnered with.
- When we eventually sell the official integration, we can two-way sync with the city's existing 311 backend via Open311 instead of asking them to rip and replace.

Treating Open311 as a first-class concern, not an afterthought, is one of the highest-leverage decisions in this design.

## Incumbents

| Vendor | Owner | Footprint | What they do well | Where they fail |
|--------|-------|-----------|-------------------|-----------------|
| SeeClickFix | CivicPlus | ~300 cities | Open311 compliant, name recognition | 2010-era form UX, AI is FAQ chatbot only |
| Tyler 311 | Tyler Technologies | Bundled across Tyler's gov suite | Deep integration with other Tyler products | Locked to Tyler ecosystem, slow product velocity |
| Granicus | Granicus | Federal and large city | Strong sales motion | Generic CRM repurposed for 311 |
| CityView | Catalis | Long tail of small cities since 1982 | Long tenure, established | Legacy stack, desktop UX |
| CitiNexus | NIC | Mid-market | Configurable | Heavy implementation, low velocity |
| NebuLogic SMART City 311 | NebuLogic | Smaller footprint | Markets AI features | The "AI" is mostly chatbot FAQs |

The pattern: all sold top-down to procurement, all designed for the staff inbox first and the resident app second, all advertise AI but the AI is shallow or fake. None compete on the resident experience.

## Users

### Resident: Maya, age 34, lives in Cumming

- Sees a pothole on her morning commute on Sawnee Drive.
- Wants to report it in under 10 seconds because she is driving and parking briefly.
- Has tried the SeeClickFix app once, abandoned it after the third dropdown screen.
- Will use Civic if she can take a photo and submit it before her latte cools.
- Will become a power user if she sees that her report actually got fixed and she got notified.

### City staff: Mark, age 51, foreman at Cumming Public Works

- Manages a 5-person paving crew.
- Currently gets work orders printed off a queue by his supervisor.
- Frustrated by reports that say "big hole on the road by the school" with no photo and the wrong zip.
- Will adopt Civic if the work orders show up with a photo, a precise location, and a materials list, so his crew rolls out once instead of twice.

### City leadership: Theresa, age 47, Cumming City Manager

- Reports performance to the City Council quarterly.
- Has no real-time view of service delivery. Pulls numbers from a SQL guy two days before the meeting.
- Will champion Civic if the dashboard makes her quarterly prep faster and makes the city look responsive.
- Will resist it if the dashboard makes the city look bad without offering tools to fix it.

### Public and press: Andrew, local Forsyth County News reporter

- Writes weekly municipal beat stories.
- Constantly looking for fresh angles on local government.
- Will write the article that gets us our first inbound from a city if we make the data easy.

## The wedge

Resident-led GTM into a procurement-led market. Three layers:

1. **Win residents first.** Be the only app that actually works in 10 seconds on a phone. Seed Cumming via personal network, Nextdoor, and Facebook groups.
2. **Make city performance legible.** Public dashboard at civic.app/cumming becomes a political object. City council members get asked about response times by their constituents. Local press writes about it.
3. **Sell the integration.** Once residents are using it and the city is feeling pressure, sell the official integration. Two-way Open311 sync, staff inbox, branded app, predictive maintenance.

Incumbents structurally cannot copy this. Their go-to-market is procurement. They have no muscle for consumer growth and no incentive to publish dashboards that embarrass their customers.

## Cumming GTM playbook

Cumming, Georgia, population ~8,000 in the city limits, ~250,000+ in Forsyth County. Affluent suburban Atlanta. Active civic culture.

**Phase 1 (weeks 1-4): Soft launch with 50 residents.**
- Personal network seeding.
- Posts in Nextdoor and Forsyth County Facebook groups asking what gets reported most.
- Goal: 50 reports submitted, 10 resolutions tracked manually (close the loop ourselves until the city is in the system).

**Phase 2 (weeks 5-12): Public dashboard goes live.**
- SEO-indexed at civic.app/cumming.
- Weekly auto-generated summary emailed to Forsyth County News and Forsyth Herald.
- Outreach to two city council members who have publicly talked about infrastructure.
- Goal: 500 reports, first local press mention, first inbound from city staff.

**Phase 3 (weeks 13-26): First paid pilot.**
- City pays per capita for the official integration: staff inbox, Open311 sync, branded app, predictive maintenance.
- Case study published.
- Expansion to Alpharetta, Roswell, Sandy Springs, Duluth, Suwanee.

## Business model

- Free for residents, forever. No ads, no upsell.
- Cities pay per capita per year for the official integration.
- Pricing band: $0.50 to $2.00 per capita per year. Cumming city limits: $4k to $16k. Full Forsyth County: $125k to $500k.
- Public dashboard is the marketing channel. No sales team needed for the first 10 cities.

## Defensibility

Once one city is live:

1. **Data moat.** Every report trains the classifier. Local patterns (which intersections flood, which streetlights die first) are city-specific and compound.
2. **Trust moat.** Residents who have submitted reports and seen them fixed will not switch. Cities that have published the dashboard cannot quietly take it down.
3. **Distribution moat.** Each live city generates a public dashboard that ranks neighboring cities by visible inaction. Adjacent cities feel adoption pressure.
4. **Standards moat (subtle but real).** Being fully Open311 compatible lets us be the connective tissue between cities. Incumbents have closed ecosystems.

## Anti-goals

Things we explicitly will not build, even when asked. Every feature request gets tested against the question: does this help a resident report something broken faster, or help the city fix it faster? If not, no.

- Building permits, business licenses, tax queries. Not a city CRM.
- Emergency response. 911 is 911.
- Resident chatbot for general questions.
- Social features (comments, upvotes, threads). The dashboard is the proof.
- Generic citizen feedback surveys. Stay focused on physical infrastructure.
- Multi-tenant white-label sold to incumbents. We are the application, not the toolkit.

## Story for different audiences

**To a resident:** "It's the fastest way to report a pothole or broken streetlight in Cumming."

**To a city manager:** "We do the triage work your staff is doing now. Cuts resolution time by 30 to 50 percent. Open311 compliant so it plugs into what you already have. Residents already like it."

**To a council member:** "Your residents are reporting infrastructure issues through our app. Here is the dashboard showing what is open in your district."

**To an investor:** "We are rebuilding 311 as an AI-native consumer app, then selling the back office to cities once residents are using it. Resident-led GTM into a $1B+ municipal software market. Open311 standards-compliant so we integrate, not replace."

**To a senior engineer joining:** "Vision LLM classifies a photo into a structured work order. Open311 compatible from day one. Staff dispatch UI. Predictive layer surfaces likely failures. Public dashboard creates buying pressure. Stack is Next.js, Supabase, Gemini, PostGIS."

Use the right framing for the audience. Never lead with the AI. Lead with the outcome.

## Open questions to revisit quarterly

- Does the Forsyth County government structure (county-level public works) complicate the city-level GTM?
- At what scale do we hit Gemini cost as a real line item?
- Do we need React Native for the resident app, or does PWA hold?
- When does the predictive layer become a separately monetizable product?
- What is the path from one paid pilot to ten? Repeatable playbook or bespoke per city?

This document is a living document. Update when assumptions change. Note material changes in `docs/decisions/` as ADRs.