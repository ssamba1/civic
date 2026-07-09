// Merges the Civic outreach email template with civic_outreach.csv.
// Usage: node scripts/outreach-merge.mjs
// Output: outreach/drafts/<rank>-<name>.md (one per contact) + outreach/drafts/all.json (send manifest)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = join(ROOT, "civic_outreach.csv");
const OUT_DIR = join(ROOT, "outreach", "drafts");

// Fill these before generating final drafts.
const SENDER = {
  name: "Soham Gugale",
  phone: "(414) 344-8296",
  link: "https://civic-social-impact.vercel.app",
};

// ---------- CSV parsing (quoted fields, embedded commas) ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

// ---------- per-contact helpers ----------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function firstName(name) {
  return name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0].replace(/["']/g, "");
}

const ORG_OVERRIDES = {
  "Gainesville-Hall County GIS": "Hall County",
};

function shortOrg(org) {
  let s = org.split(" / ")[0].replace(/\s*\([^)]*\)/g, "").trim();
  s = s.replace(/^City of /i, "").replace(/,\s*GA$/i, "").trim();
  s = s.replace(/\s+-\s+.*$/, "").trim(); // "Tyson Foods - Cumming poultry plant" -> "Tyson Foods"
  s = s.replace(/\s+(HOA|Community Assoc\.?|Community Association)$/i, "").trim();
  s = s.replace(/^Univ\.\s+/, "University ");
  return ORG_OVERRIDES[s] ?? s;
}

function slug(name) {
  return name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------- template ----------
function buildEmail(contact) {
  const { bucket, org } = contact;
  const isHOA = bucket === "HOA/Master-Planned";
  const isGovt = bucket === "Local Govt";
  const isCollege = bucket === "College";
  const isFacility = bucket === "Private Campus";
  const isCampus = isCollege || isFacility;

  const subject = isHOA
    ? `resident repair reports at ${org}`
    : `question about how ${org} handles repair reports`;

  const intro = isHOA
    ? `I'm ${SENDER.name}, a rising junior at South Forsyth High School, not far from ${org}, and I built an app called Civic to remove that wall.`
    : `I'm ${SENDER.name}, a rising junior at South Forsyth High School, and I built an app called Civic to remove that wall.`;

  const watcher = isCampus ? "whoever reported it" : "the resident";

  const addon = isGovt
    ? " It also speaks Open311, so it can feed whatever system you already use instead of replacing it."
    : isHOA
      ? " For an HOA that means reports route straight to the right vendor, and you get one clean log for the board instead of forwarded emails."
      : isFacility
        ? " On a site your size that means a QR code posted in each area, and every report lands in one queue tagged with where it came from."
        : " On a campus that means a QR code in each building, and every report lands in one queue tagged with where it came from.";

  const place = isHOA ? "your community" : isFacility ? "your facility" : isCollege ? "your campus" : "your streets";

  const greeting = contact.first === "ROLE" ? "Hello," : `Hi ${contact.first},`;

  const body = `${greeting}

A few months ago I tried to report a pothole near my neighborhood in Cumming. It took me twenty minutes to figure out who to even tell, the form asked for things I didn't know, and I never found out whether anyone fixed it. Most people don't push through that. They hit the twenty-minute wall, give up, and the problem just sits there. That means the issues you hear about are only a fraction of the ones people actually see.

${intro} Reporting is one photo, nothing else. No forms, no finding the right department. Civic reads the photo, writes the work order, and routes it to the right crew, and ${watcher} can watch their report move from received to fixed, the way you'd track a package.${addon}

That last part matters more than it sounds. When people see their reports actually get fixed, they report more, they trust the process, and taking care of shared spaces starts to feel like something the whole community does together instead of a complaint into the void.

Would you be free for a 15-minute call this week or next? I'll load ${org}'s own categories beforehand so you're looking at ${place}, not a canned demo.

Thanks for reading this,
${SENDER.name}
Cumming, GA · ${SENDER.phone} · ${SENDER.link}`;

  return { subject, body };
}

// ---------- main ----------
const rows = parseCSV(readFileSync(CSV_PATH, "utf8"));
const header = rows[0];
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const drafts = [];
const skipped = [];

for (const r of rows.slice(1)) {
  const name = r[col.Name];
  const emailMatch = (r[col.BestContact] || "").match(EMAIL_RE);
  if (!emailMatch) {
    skipped.push({ name, org: r[col.Organization], contact: r[col.BestContact] });
    continue;
  }
  const contact = {
    rank: Number(r[col.Rank]),
    name,
    first: firstName(name),
    org: shortOrg(r[col.Organization]),
    fullOrg: r[col.Organization],
    bucket: r[col.Bucket],
    email: emailMatch[0],
    whyFit: r[col.WhyFit],
  };
  const { subject, body } = buildEmail(contact);
  drafts.push({ ...contact, subject, body });
}

mkdirSync(OUT_DIR, { recursive: true });

for (const d of drafts) {
  const md = `To: ${d.email}\nName: ${d.name}\nOrg: ${d.fullOrg}\nBucket: ${d.bucket}\nWhyFit (for hand-tailoring sentence 1): ${d.whyFit}\nSubject: ${d.subject}\n\n---\n\n${d.body}\n`;
  writeFileSync(join(OUT_DIR, `${String(d.rank).padStart(2, "0")}-${slug(d.name)}.md`), md);
}
writeFileSync(join(OUT_DIR, "all.json"), JSON.stringify(drafts, null, 2));

// warn: multiple contacts at the same org (don't email both the same day)
const byOrg = new Map();
for (const d of drafts) byOrg.set(d.org, [...(byOrg.get(d.org) || []), d.name]);
const multi = [...byOrg].filter(([, v]) => v.length > 1);

console.log(`generated ${drafts.length} drafts -> outreach/drafts/`);
console.log(`skipped ${skipped.length} (no email):`);
for (const s of skipped) console.log(`  - ${s.name} (${s.org})`);
if (multi.length) {
  console.log(`\nsame-org contacts, stagger these:`);
  for (const [org, names] of multi) console.log(`  - ${org}: ${names.join(", ")}`);
}
if (SENDER.phone === "FILL_PHONE") console.log("\nWARNING: SENDER.phone/link not filled in yet (top of script).");
