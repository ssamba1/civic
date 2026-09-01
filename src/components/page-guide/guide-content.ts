/* ==================================================================
   Per-page guide copy for the demo walkthrough.

   Every entry was written from the route's own source, not from its
   name. `points` describe what is actually on screen; a point with a
   `target` is anchored to a `data-tour` attribute on the real element
   and gets a numbered ring + label when that element is present.
   `why` carries the thing the screen cannot say for itself.

   README deep links use verified heading anchors in the public repo.
   A page with no matching README section carries no link.
   ================================================================== */

const REPO = "https://github.com/ssamba1/civic";
const readme = (anchor: string) => `${REPO}/blob/main/README.md#${anchor}`;

export interface GuidePoint {
  /** `data-tour` key on the page element this point describes. */
  target?: string;
  /** Short chip label drawn on the page. Keep under ~30 characters. */
  label: string;
  /** The sentence shown in the panel. */
  text: string;
}

export interface PageGuide {
  /** Page name, as the page itself titles it. */
  title: string;
  /** What the surface is, in the product's own terms. */
  what: string;
  points: GuidePoint[];
  /** The non-obvious part — why this exists at all. */
  why: string[];
  readmeHref?: string;
  readmeLabel?: string;
  /**
   * Which edge the panel docks to. Defaults to the right; a page whose own
   * controls live on the right (the map's dispatch panel) docks left so the
   * guide never covers the thing it is describing.
   */
  dock?: "left" | "right";
}

export const GUIDES: Record<string, PageGuide> = {
  index: {
    title: "Teams",
    what: "The city root is a delegation console, not a summary. It shows how the live backlog splits across municipal divisions, and it is where a report gets moved from one division to another.",
    points: [
      {
        target: "filter-bar",
        label: "One filter, every panel",
        text: "Team, date range, severity, status and category. Every card, bar and list below reads the same filtered corpus, so nothing on the page can disagree with anything else.",
      },
      {
        target: "city-stats",
        label: "City statistics",
        text: "Tracked, open, and closed counts — recomputed client-side from the filtered set rather than fetched, so they move the instant a filter changes.",
      },
      {
        target: "team-roster",
        label: "Divisions",
        text: "One card per division with its current load. Clicking a card scopes the rest of the page to that team.",
      },
      {
        label: "Workload, routing matrix, delegation",
        text: "Below the roster: queue depth per team, the category-to-division matrix that decides where new reports land, a log of routing changes, and the delegation panel for reassigning an individual report.",
      },
    ],
    why: [
      "A city that has not gone live is fed from a preview corpus, so a prospective customer sees a populated dashboard instead of an empty one. A live city counts only real resident reports.",
      "Reassigning a category here mutates the same routing snapshot the map filter and the routing chart read, which is why a change made on this page shows up on the others without a reload.",
    ],
    readmeHref: readme("the-one-screen-that-explains-the-whole-product"),
    readmeLabel: "The one screen that explains the product",
  },

  map: {
    title: "Map",
    what: "A fullscreen operational map with a floating Dispatch panel. It is a dispatch surface, not a pin map — the panel is where a report gets retargeted at a different team.",
    points: [
      {
        target: "map-canvas",
        label: "Every open report",
        text: "MapLibre basemap with deck.gl data layers on top. The basemap follows the app theme; satellite is a sticky override.",
      },
      {
        target: "map-dispatch",
        label: "Dispatch panel",
        text: "Titled Dispatch for staff, Reports when locked to one team, Nearby in the resident view — with a live count of what survives the current filter.",
      },
      {
        target: "map-filters",
        label: "Scope the view",
        text: "Team view, category, a minimum-severity slider, status, and a Color by selector that repaints the pins by whichever dimension you are arguing about.",
      },
    ],
    why: [
      "The map reads the same shared corpus as the per-team maps, so the city view is guaranteed to be a superset of every team view and a job closed anywhere reads closed here.",
      "Colour is spent on category and status only. Everything else in the product is deliberately grayscale so that hue always means data.",
    ],
    readmeHref: readme("the-dispatcher-in-full"),
    readmeLabel: "The dispatcher, in full",
    dock: "left",
  },

  grid: {
    title: "Grid",
    what: "Every report in the city as one spreadsheet. The columns are the work order — not a report summary, the actual fields a crew is dispatched on.",
    points: [
      {
        target: "grid-toolbar",
        label: "Search + status filters",
        text: "Free-text search across issue, address and department, beside status pills that carry their own counts.",
      },
      {
        target: "grid-status",
        label: "Status pills",
        text: "Filter the sheet down to one lifecycle state; the counts update with the search box.",
      },
      {
        target: "grid-table",
        label: "The work order fields",
        text: "Reported, Issue, Team, Severity, Priority, Status, SLA, Department, Crew, Estimated cost, Predicted, Estimated minutes, Source.",
      },
    ],
    why: [
      "Estimated cost is computed from the category's unit rate and the measured quantity. The model never produces a dollar figure — it produces the inputs, and arithmetic produces the number.",
      "Cell edits are local to the browser; the toolbar says so. This is a demo surface for reading and arguing about the queue, not a write path.",
      "Arriving here with a ?report= parameter is a deep link out of the video detection console, so a machine-found defect can be traced to its row.",
    ],
    readmeHref: readme("5-cost-is-computed-not-estimated-by-the-model"),
    readmeLabel: "Cost is computed, not estimated",
  },

  routing: {
    title: "Routing",
    what: "A flow chart of how a photograph becomes a crew's job: intake, classification, category, division, crew. Hovering any node traces every path through it.",
    points: [
      {
        target: "routing-canvas",
        label: "Intake to crew",
        text: "A layered graph, each column a stage, each node carrying its live count from the current corpus. Hovering dims everything off the path.",
      },
      {
        target: "routing-zoom",
        label: "Zoom",
        text: "The graph gets wide on a city with many divisions; zoom runs 0.5x to 1.4x with a reset.",
      },
    ],
    why: [
      "This is a read-only picture of configuration, not a trace of live traffic. It answers 'why did that category land on that crew' — the actual decision runs elsewhere, in the crew-assignment and org-unit code.",
      "If a city has an org-unit tree configured but no unit declares any categories, the tree routes nothing and legacy crew routing quietly takes over. The dashed warning pill on this page is the only place that misconfiguration is visible.",
    ],
    readmeHref: readme("4-categories-and-divisions-are-data-not-code"),
    readmeLabel: "Categories and divisions are data, not code",
  },

  analytics: {
    title: "Analytics",
    what: "The operational signal console — what is shipping, what is stuck, and where. A surge banner and peer benchmark sit above a bento of charts, with a live report rail alongside.",
    points: [
      {
        target: "filter-bar",
        label: "Shared filter",
        text: "Team, date range (with a custom window), severity, status and category. Every tile derives from this one filtered corpus.",
      },
      {
        target: "analytics-bento",
        label: "Ten tiles, one corpus",
        text: "Reports trend, severity mix, reporter velocity, status funnel, resolution histogram, peak hours, top neighbourhoods, category resolution, recurring hotspots, SLA risk.",
      },
      {
        label: "Districts and equity",
        text: "Two streamed panels below the bento: council-district rollups and a response-equity breakdown.",
      },
    ],
    why: [
      "The equity and district panels answer a political question rather than an operational one — whether response time correlates with which district a resident lives in. That is the number a council meeting turns on.",
      "Nothing here re-queries per chart. One corpus is filtered once and every tile recomputes from it, which is why filters feel instant and why two tiles can never disagree.",
    ],
    readmeHref: readme("4-proof-it-works"),
    readmeLabel: "Proof it works",
  },

  "analytics/heatmap": {
    title: "Report density",
    what: "A single-purpose density map: severity-weighted report concentration with a 90-day exponential recency decay, plus a ranked table of the hottest grid cells.",
    points: [
      {
        label: "Weighted, not counted",
        text: "Weight is severity multiplied by recency, so ten stale complaints do not outrank three fresh severe ones.",
      },
      {
        label: "Ranked grid cells",
        text: "Roughly one-kilometre buckets, listed by rank with coordinates, report count and average severity.",
      },
    ],
    why: [
      "This page deliberately ignores the dashboard filter and reads the whole corpus — a density surface filtered down to one team is a different and much less useful picture.",
      "The ranked table is computed on the server, so the page is readable before the WebGL map bundle finishes loading.",
    ],
  },

  browse: {
    title: "Browse",
    what: "The resident-facing view of the same corpus the staff dashboard reads: statistics, an interactive map, a category breakdown and the recent reports list.",
    points: [
      {
        target: "browse-stats",
        label: "Key statistics",
        text: "Recomputed from whatever the filter currently admits, not from a fixed server snapshot.",
      },
      {
        target: "browse-map",
        label: "The map is an input",
        text: "The in-map severity, status and category controls write to the same filter state as the toolbar — panning and toggling here changes the chart and the list below.",
      },
      {
        label: "Category chart",
        text: "Clicking a bar toggles that category filter, so the chart doubles as a control.",
      },
    ],
    why: [
      "Residents and staff read one corpus. There is no separate public dataset to drift out of sync, which is the whole basis for the accountability claim.",
      "Map centring falls through known city coordinates, then a live geocode, then the pilot city — so a newly onboarded city never opens on someone else's streets.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
  },

  calendar: {
    title: "Calendar",
    what: "A month grid of work orders plotted by the date they were dispatched — the staffing view of the backlog rather than the reporting view.",
    points: [
      {
        target: "calendar-toolbar",
        label: "Month + filters",
        text: "Month label, previous / today / next, a work-order count, and a Filters button badged with how many filters are active.",
      },
      {
        target: "calendar-grid",
        label: "Dispatch dates",
        text: "Seven columns of day cells; a day with more work than fits collapses into a +N more button that opens a day drawer.",
      },
      {
        label: "Filter modal",
        text: "Division, crew type, crew and status. Inside a crew portal the crew selects are locked and hidden.",
      },
    ],
    why: [
      "The filters live in a modal on purpose: the month grid only works if it clears the fold, and a filter bar above it would push a week off screen.",
      "The month is a URL parameter, so a specific month is shareable and the back button works. Today is resolved in server time so an evening user is not shown next month.",
    ],
  },

  duplicates: {
    title: "Duplicate reports",
    what: "A triage queue of open reports that have near-duplicate candidates, each with an inline merge panel scoring the match.",
    points: [
      {
        target: "duplicates-heading",
        label: "Merge, do not delete",
        text: "The weaker report is merged into the canonical one. Merged reports leave the public dashboard but an admin can reverse it.",
      },
      {
        target: "duplicates-queue",
        label: "Candidate queue",
        text: "Each row carries a top-match percentage, a candidate count, the address, and a link through to the report.",
      },
      {
        label: "Four-part score",
        text: "Location, visual, category and time, each with its own bar — so it is matching photographs and timing, not just coordinates.",
      },
    ],
    why: [
      "Deduplication runs at report level, before any work order exists. A work order costs a truck roll: two reports of one pothole would otherwise dispatch two visits and double-count the city's backlog.",
      "Because the merge is reversible and reasoned (there is a free-text reason field), this is curation with an audit trail rather than a delete button.",
    ],
    readmeHref: readme(
      "3-deduplication-happens-before-a-work-order-exists-in-the-database",
    ),
    readmeLabel: "Deduplication happens before a work order exists",
  },

  video: {
    title: "Video",
    what: "The dashcam pipeline console. Upload a clip, watch it replay with detector boxes drawn on the frames, and work the synchronised feed of detection clusters through to a report.",
    points: [
      {
        target: "video-funnel",
        label: "Clips → reports",
        text: "Clips, frames scanned, detections, clusters, reports created. The funnel narrows at every step by design.",
      },
      {
        target: "video-upload",
        label: "Upload with a location",
        text: "A clip without a start location or GPS track can only be grouped visually — its detections cannot auto-dispatch.",
      },
      {
        target: "video-clips",
        label: "Recent clips",
        text: "Uploaded, status, frames, detections, error. Click a row to load that clip into the theatre.",
      },
      {
        label: "Clip theatre + detection rail",
        text: "The transport bar drives the video; cards in the rail move from detected to assessed to report-created as the playhead passes each detection's timestamp.",
      },
    ],
    why: [
      "The first stage never calls a language model. A local ONNX detector scans roughly one frame per second and keeps only boxes above a confidence floor. A one-minute clip produces hundreds of boxes; sending each to a vision model would be ruinous and almost entirely redundant.",
      "Clustering is the gate. Detections are folded into geographic and visual clusters, and only when a cluster's rolled-up confidence clears the escalation threshold does a single model decision run for the whole cluster. Below that it sits as a candidate — which is exactly what the Run decision button overrides.",
      "Only a dispatch decision creates a report. Everything else stops at the cluster, which is why the funnel's last two numbers are so much smaller than its first two.",
    ],
    readmeHref: readme(
      "the-video-vertical-how-to-use-a-model-without-a-model-bill",
    ),
    readmeLabel: "Using a model without a model bill",
  },

  members: {
    title: "Members",
    what: "A three-way roster — people, crews and contractors — plus the crew-type catalogue that defines what kinds of crew a city can staff.",
    points: [
      {
        target: "members-views",
        label: "People / Crews / Contractors",
        text: "One toolbar switching between three different tables over the same city.",
      },
      {
        target: "members-search",
        label: "Search and filter",
        text: "Name or email search beside a role filter; invitations open from the same header.",
      },
      {
        label: "What each table carries",
        text: "People: role, team, report count, last active. Crews: type, members, open work, oldest open, MTTR, lead. Contractors: status, jobs, live warranties, next expiry, documents.",
      },
    ],
    why: [
      "Unlike the grid, this page has no public demo bypass, because rows carry email addresses and phone numbers. Demo sessions get those masked on the server, so a raw address never reaches the browser.",
      "A crew-type catalogue with everything deactivated is honoured as a deliberate administrative choice rather than being silently repopulated with defaults.",
    ],
  },

  "members/detail": {
    title: "Member",
    what: "One person's profile: role and team, their counts, an activity timeline, and the reports attached to them.",
    points: [
      {
        label: "Stat tiles",
        text: "Their totals, including closed reports.",
      },
      {
        label: "Activity timeline",
        text: "What this member has done, in order, above their report history.",
      },
    ],
    why: [
      "The route is marked no-index, and demo sessions see masked contact details, for the same reason the roster does: this page is personal data about a named municipal employee.",
    ],
  },

  crew: {
    title: "Crew portal",
    what: "The Teams console re-rendered inside a category-locked scope. Same statistics, roster, workload, routing and delegation — restricted to the categories this crew type handles.",
    points: [
      {
        target: "crew-scope",
        label: "What this crew sees",
        text: "The scope banner names the crew and lists the locked categories, so it is never ambiguous what has been filtered out.",
      },
      {
        target: "city-stats",
        label: "Scoped statistics",
        text: "The same cards as the city root, computed over the locked category set only.",
      },
      {
        target: "team-roster",
        label: "Divisions",
        text: "Roster and workload deliberately ignore the team filter, so other divisions' counts do not collapse to zero while you are scoped.",
      },
    ],
    why: [
      "A crew type is not a team. Cleanup work spans several divisions, so the portal cannot simply pin a team id — it locks a set of categories instead.",
      "That lock is provided to the whole subtree, so every reused surface inside the portal, including the calendar, silently sees only this crew's categories.",
    ],
    readmeHref: readme("4-categories-and-divisions-are-data-not-code"),
    readmeLabel: "Categories and divisions are data, not code",
  },

  team: {
    title: "Team overview",
    what: "One division's operational dashboard: its statistics, its queue depth, the routing rules that feed it, its task queue, and — for staff — its crews.",
    points: [
      {
        target: "team-stats",
        label: "This division only",
        text: "Total, open, resolved and average age, scoped to this team.",
      },
      {
        target: "team-tasks",
        label: "Task queue",
        text: "The division's actual work, in the order it should be worked.",
      },
      {
        label: "Field view",
        text: "The button in the header opens the phone-first field queue for a crew who is out in a truck.",
      },
    ],
    why: [
      "Every panel here, including the stat cards, derives client-side from the team-locked corpus. A server-computed stat block would desynchronise the moment someone reassigned a report in the routing matrix.",
    ],
    readmeHref: readme("the-dispatcher-in-full"),
    readmeLabel: "The dispatcher, in full",
  },

  "team/schedule": {
    title: "Schedule",
    what: "A seven-column week of scheduled work orders, with a conflict banner for double-booked crews and a list of everything still unscheduled.",
    points: [
      {
        label: "Week navigation",
        text: "Previous, today and next; the week lives in the URL.",
      },
      {
        label: "Conflicts first",
        text: "Double-booked crews are surfaced above the grid, not buried in a day cell.",
      },
      {
        label: "Scheduling modal",
        text: "Scheduled-for and optional window-end times, plus an optional crew assignment.",
      },
    ],
    why: [
      "Week arithmetic is done in UTC on the server and the week is a query parameter, so every staff member looking at the same link sees the same grid regardless of where they are.",
    ],
  },

  "team/route": {
    title: "Crew route",
    what: "One crew's stop order for one day, drawn as a route sketch above the ordered stop list.",
    points: [
      {
        label: "Route sketch",
        text: "A dependency-free inline SVG: coordinates projected straight into the viewbox, with numbered stops along the path.",
      },
      {
        label: "Distance stats",
        text: "Total distance, average leg, longest leg, stop count.",
      },
    ],
    why: [
      "The sketch is deliberately not a tiled map. It needs no tiles, no token and no signal, so it prints and it loads on a truck's bad connection.",
      "The '2-opt improved' note only appears when the optimiser actually beat the naive order — so its presence is evidence the optimisation ran, not decoration.",
    ],
  },

  "team/field": {
    title: "Field queue",
    what: "A phone-first, offline-tolerant list of this team's open jobs, sorted by severity and then by age.",
    points: [
      {
        label: "Severity first, then oldest",
        text: "Each row carries a severity chip, the category, the address and how long it has been waiting.",
      },
      {
        label: "Navigate",
        text: "Every row has a one-tap handoff to maps at the report's coordinates.",
      },
    ],
    why: [
      "The queue is read-only on purpose. Marking a job complete requires a reason and an after-photo, so it stays in the full team flow rather than being half-implemented on a phone.",
      "The route is cached network-first by the service worker, so losing signal shows an honest stale queue with a banner rather than a dead screen.",
    ],
  },

  hotspots: {
    title: "Repeat hotspots",
    what: "Locations that have generated more than one report — the city's repeat offenders, ranked.",
    points: [
      {
        target: "hotspots-list",
        label: "Repeat locations",
        text: "Each entry carries its report count, how many are still open, and the category mix behind them.",
      },
      {
        label: "Forecast line",
        text: "Where a location has enough history, the page averages the gaps between its past reports and states when it is likely to recur.",
      },
    ],
    why: [
      "A location that keeps generating reports is not a queue problem, it is an asset problem. This page exists to turn a repeated symptom into an argument for capital work.",
    ],
  },

  leaderboard: {
    title: "Category leaderboard",
    what: "Report categories ranked by resolution rate, tie-broken by average age of what is still open.",
    points: [
      {
        target: "leaderboard-list",
        label: "Ranked by resolution",
        text: "Rank, category, percentage closed, average days open.",
      },
    ],
    why: [
      "This ranks categories, not people. Sorting by resolution rate descending means the categories a city is failing at sink to the bottom — the list is designed to expose the laggards, not to reward the winners.",
    ],
  },

  trending: {
    title: "Trending",
    what: "The public, no-account list of the open issues residents have upvoted most.",
    points: [
      {
        target: "trending-list",
        label: "Most-wanted repairs",
        text: "Ranked open issues with category, address and age. No login, no upvote button.",
      },
    ],
    why: [
      "Ranking is computed on the server from upvotes decayed by recency, which lets the whole page stay a server component and be indexed by search engines. It is an accountability surface, not a participation surface — that is why the upvote control is deliberately absent here.",
      "Closed and rejected reports are filtered out: they carry no pressure.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
  },

  qr: {
    title: "Walk-up poster",
    what: "A printable poster carrying a QR code for one physical location — the thing you laminate and bolt to a kiosk or a light pole.",
    points: [
      {
        target: "qr-instructions",
        label: "Print instructions",
        text: "The instruction card is hidden by print styles; what remains on paper is the poster itself.",
      },
      {
        label: "The code",
        text: "The QR encodes a walk-up report URL carrying the coordinates and, where given, the asset id.",
      },
    ],
    why: [
      "Scanning it opens a report form with the location and asset already filled in and no account required. That is the entire point: the resident who noticed the problem is standing in front of it, and asking them to sign up loses the report.",
    ],
  },

  "report/chat": {
    title: "Conversational intake",
    what: "A chat that turns a resident describing a problem in their own words into a structured draft report, then hands that draft to the standard form.",
    points: [
      {
        label: "The draft card",
        text: "Once the assistant has enough, it emits category, description, location and a severity out of five for the resident to confirm.",
      },
      {
        label: "One-shot funnel",
        text: "Both the textarea and the send button lock once a draft exists — this is intake, not an ongoing conversation.",
      },
      {
        label: "Escape hatch",
        text: "A link to the standard form for anyone who would rather just fill it in.",
      },
    ],
    why: [
      "The draft is handed over through session storage rather than the URL, because the product forbids personal data in query strings without exception.",
      "The assistant produces a draft a human confirms. It never files anything on its own.",
    ],
    readmeHref: readme(
      "1-the-classifier-writes-the-work-order-not-a-suggestion",
    ),
    readmeLabel: "The classifier writes the work order",
  },

  "report-pack": {
    title: "Report pack",
    what: "A one-page council handout: the city's headline numbers and its category breakdown, laid out for print.",
    points: [
      {
        target: "pack-kpis",
        label: "Six numbers",
        text: "Total, open, resolved, resolution rate, average resolution time, and this week against last.",
      },
      {
        label: "Category breakdown",
        text: "Proportional bars per category beneath the tiles.",
      },
    ],
    why: [
      "There is no PDF library. The layout uses print styles and the browser's own print dialog, which is one fewer dependency and one fewer thing to keep in sync.",
      "It reads the exact statistics the live dashboard reads, so the handout in a council packet cannot contradict the screen it was taken from.",
    ],
    readmeHref: readme("what-it-is-worth"),
    readmeLabel: "What it is worth",
  },

  documents: {
    title: "Documents",
    what: "The policy shelf: contracts, specifications and standards that govern repair work in this city, split into indexed chunks and searchable by meaning.",
    points: [
      {
        label: "Corpus",
        text: "Each document lists its type, its chunk count, and the contractor it belongs to where there is one.",
      },
      {
        label: "Retrieval",
        text: "A tester that runs a plain-language query against the indexed chunks and shows what comes back.",
      },
    ],
    why: [
      "Documents are chunked rather than stored whole so that the specific clause covering a road or a defect can be pulled up next to the report it applies to, instead of handing a crew a sixty-page specification.",
      "Attaching a document to a contractor is what lets a warranty argument cite the clause it rests on.",
    ],
  },

  "contractors/detail": {
    title: "Contractor",
    what: "A vendor profile joining their capital jobs, their warranty windows, their documents, and the reports attributed to their work.",
    points: [
      {
        label: "Jobs and warranties",
        text: "Contract reference, job type, value, completion date, and each warranty's window with the categories it covers.",
      },
      {
        label: "Attributed reports",
        text: "Reports that fall inside a live warranty on this vendor's work, linked through to the grid.",
      },
    ],
    why: [
      "This is a liability surface, not a directory entry. A new pothole inside a live paving warranty is the contractor's cost rather than the city's — but only if someone can show the window, the coverage and the bond reference in one place.",
    ],
  },

  // ── Resident surface (/user/*) ──────────────────────────────────────────
  // The same corpus the city views read, presented as an accountability
  // surface rather than a dispatch one: no assignment, no routing, no cost.

  "user/my-reports": {
    title: "My Reports",
    what: "The reports this community has filed, each with its current status and how far it has moved toward being fixed.",
    points: [
      {
        label: "Status is the whole row",
        text: "Every report carries the state the city has actually put it in, not a promise about it — open, dispatched, in progress, resolved.",
      },
      {
        label: "The same record staff see",
        text: "There is no resident copy of a report. This reads the row a dispatcher works from, so the two sides can never drift apart.",
      },
    ],
    why: [
      "A resident who files a report and then hears nothing assumes nothing happened. Showing the state the city moved it into is what turns a complaint box into a loop that closes.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
  },

  "user/map": {
    title: "Community Map",
    what: "The same fullscreen map the city and team views run, in read-only mode: every open report in the city, plotted where it was filed.",
    points: [
      {
        label: "Read-only by construction",
        text: "The dispatch and routing affordances are absent here, not hidden — the resident build of this map has an upvote on each list row where staff get an assign action.",
      },
      {
        label: "One map, two products",
        text: "It reuses the same orchestrator and the same filtered corpus as the staff map, so a resident and a dispatcher are looking at identical data.",
      },
    ],
    why: [
      "Building a separate resident map would let the public view and the operational view disagree about what is on the street. Sharing the component makes that impossible rather than merely unlikely.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
    dock: "left",
  },

  "user/trending": {
    title: "Trending",
    what: "The open issues residents are upvoting most right now — a demand signal, ordered by how many people have said the same thing.",
    points: [
      {
        label: "Open issues only",
        text: "Closed and rejected reports are filtered out before ranking: a fixed report has no pressure left to apply, so leaving it here would inflate the signal with work already done.",
      },
      {
        label: "Upvotes are the ranking",
        text: "This is what the community is asking for, in its own order — not a staff priority score.",
      },
    ],
    why: [
      "Severity decides what is dangerous; upvotes decide what is infuriating. They are different questions, and a city that only ever answers the first one loses the public's patience on the second.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
  },

  "user/pulse": {
    title: "Community Pulse",
    what: "How the city is doing in aggregate — issues fixed, how fast they closed, and whether the pace is rising or falling.",
    points: [
      {
        label: "Fixed, not filed",
        text: "The headline counts completed work. A backlog dashboard measures how much came in; this measures how much went out.",
      },
      {
        label: "Rate, not just totals",
        text: "Resolution time and momentum sit beside the count, because a total that never moves and a total that is accelerating look identical as a number.",
      },
    ],
    why: [
      "Accountability needs a number the public can watch move. Publishing throughput rather than intake is the version of that which a city cannot improve by doing nothing.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
  },

  "user/updates": {
    title: "Updates",
    what: "Status changes on community reports and city-wide announcements, newest first.",
    points: [
      {
        label: "Movement, not messages",
        text: "Entries are generated when a report actually changes state, so the feed is a record of what the city did rather than what it said.",
      },
    ],
    why: [
      "The gap this closes is the silent one: a report that moves from dispatched to resolved without the person who filed it ever being told.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
  },

  fallback: {
    title: "City workspace",
    what: "A city surface in the Civic dashboard. The left rail groups the public city views above the staff-only workspace tools.",
    points: [
      {
        target: "filter-bar",
        label: "Shared filter",
        text: "Where a page carries this bar, every panel on that page reads the same filtered corpus.",
      },
    ],
    why: [
      "Residents and staff read one corpus in two products: a public accountability surface and an operational dispatch surface.",
    ],
    readmeHref: readme("5-the-two-products"),
    readmeLabel: "The two products",
  },
};

/** Sub-route segments that carry their own guide entry. */
const KNOWN_TAILS = new Set(["heatmap", "schedule", "route", "field", "chat"]);

/**
 * Maps a pathname to a guide key. Dynamic segments (`[teamId]`, `[crewType]`,
 * `[id]`) are dropped; a recognised trailing segment keeps its own entry, and
 * anything else with a dynamic segment falls back to `<section>/detail` then
 * to `<section>`.
 */
export function guideKeyForPath(pathname: string | null | undefined): string {
  if (!pathname) return "fallback";

  // Resident surface. Flat: /user/<section>, no dynamic segments, and bare
  // /user redirects to my-reports so it answers to the same entry.
  const u = pathname.match(/^\/user(?:\/([^/]+))?\/?$/);
  if (u) {
    const key = `user/${u[1] ?? "my-reports"}`;
    return key in GUIDES ? key : "fallback";
  }

  const m = pathname.match(/^\/city\/[^/]+(?:\/(.*))?$/);
  if (!m) return "fallback";
  const rest = (m[1] ?? "").replace(/\/+$/, "");
  if (!rest) return "index";

  const segments = rest.split("/");
  const section = segments[0];
  const tail = segments.slice(1).filter((s) => KNOWN_TAILS.has(s));
  const candidates = [
    tail.length > 0 ? `${section}/${tail[tail.length - 1]}` : null,
    segments.length > 1 ? `${section}/detail` : null,
    section,
  ];
  for (const key of candidates) {
    if (key && key in GUIDES) return key;
  }
  return "fallback";
}

export function guideForPath(pathname: string | null | undefined): PageGuide {
  return GUIDES[guideKeyForPath(pathname)] ?? GUIDES.fallback;
}
