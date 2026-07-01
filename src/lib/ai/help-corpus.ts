/**
 * Static help/FAQ corpus for the help assistant. Small enough to keep in
 * memory; retrieved lexically (see chat/retrieval.ts). When this grows past
 * ~50-100 entries or needs semantic recall, migrate retrieval to pgvector
 * (already roadmapped for dedup) behind the searchCorpus interface.
 */
export interface HelpDoc {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

export const HELP_CORPUS: HelpDoc[] = [
  {
    id: "ai-classification",
    title: "How does Civic classify a photo?",
    tags: ["ai", "gemini", "classification", "accuracy", "how it works"],
    body: "When you submit a photo, Gemini 2.5 Flash analyzes it in about 1.5 seconds and assigns a category (pothole, streetlight, graffiti, etc.), a severity from 1 to 5, and a confidence score. Staff can override the AI and every override is logged so the model can be evaluated.",
  },
  {
    id: "privacy-blur",
    title: "What happens to my photo and location data?",
    tags: ["privacy", "blur", "faces", "license plate", "data", "retention"],
    body: "Faces and license plates are detected and blurred on your device before the photo ever leaves it. The blurred copy is public; the original is stored only while the report is open and is purged after it is resolved. Public map locations are rounded to about 30 meters so an exact address is never exposed.",
  },
  {
    id: "open311",
    title: "Does Civic replace the city's 311 system?",
    tags: ["open311", "integration", "311", "export", "city"],
    body: "No — Civic complements existing systems. Every report is exportable in Open311 GeoReport v2 (JSON and XML), and external clients can push reports in, so a city can adopt Civic without ripping out its current 311 tooling.",
  },
  {
    id: "cost-free",
    title: "Is Civic free for residents?",
    tags: ["cost", "free", "pricing", "residents"],
    body: "Yes. Reporting is always free for residents and never requires an account. Cities pay for the staff console and analytics.",
  },
  {
    id: "status-updates",
    title: "How do I know when my report is fixed?",
    tags: ["status", "notifications", "updates", "tracking", "resolved"],
    body: "You get a tracking link and status updates as the report moves from open to dispatched to in progress to resolved. When it is closed you can see the crew's after photo and rate the resolution.",
  },
  {
    id: "accountability",
    title: "What if the city ignores a report?",
    tags: ["accountability", "sla", "dashboard", "public", "equity"],
    body: "Every report is on a public dashboard with timestamps and SLA badges, and a neighborhood equity view surfaces underserved areas. That public record is the accountability pressure — reports do not quietly disappear.",
  },
  {
    id: "which-cities",
    title: "Which cities use Civic?",
    tags: ["cities", "coverage", "cumming", "availability"],
    body: "Civic is piloting in Cumming, Georgia, and any city can be onboarded because reports are Open311-compatible. You can browse a city dashboard to see live stats for your area.",
  },
  {
    id: "how-to-report",
    title: "How do I report a problem?",
    tags: ["report", "submit", "photo", "how to", "pothole"],
    body: "Open the report screen, take or attach a photo of the problem, optionally add a short description or tags, and submit. The AI classifies it and routes it to the right city crew. It takes under 10 seconds and no account is needed.",
  },
  {
    id: "anonymous",
    title: "Do I need an account to report?",
    tags: ["account", "anonymous", "login", "sign up"],
    body: "No account is required to submit or track a report — you get a private tracking link. You can optionally add an email later to link your reports to an account and get email updates.",
  },
];
