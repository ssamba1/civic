// Seed plausible municipal source documents into the Documents workspace:
// the road-maintenance policy plus the Northside Paving LLC contract pair
// (services agreement + completed-work/warranty certificate) that backs the
// pothole camera-demo's "under warranty" story.
//
// Writes each document below through the SAME chunker the app uses
// (src/lib/documents/chunk.ts) so the seeded corpus is byte-identical to what
// an upload of this text would produce.
//
// Idempotent: keyed on (city, title). A re-run deletes the previous document
// (chunks cascade) and re-ingests, so an edit to the text below is picked up.
//
// Requires migration 20260828_065_city_documents.sql to be applied.
// Usage: npx tsx scripts/seed-city-documents.mjs [city-slug]   (default: cumming)
//
// tsx, not plain node: the chunker is TypeScript and must not be duplicated
// here. A divergent copy would seed chunks the app could never reproduce.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkDocument } from "../src/lib/documents/chunk.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const slug = process.argv[2] ?? "cumming";

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(method, path, body) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok)
    throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── the documents ──────────────────────────────────────────────────────────
// Deliberately written the way real public-works paper reads: numbered
// sections, named road classes, explicit hour counts, and a claims clause.
const POLICY_DOCUMENT = `# Road Maintenance Policy and Contractor Responsibilities

Adopted by the Department of Public Works. This policy governs the inspection,
repair, and warranty of publicly maintained roadway surfaces, and defines the
obligations of contractors performing that work under an active agreement with
the City.

## 1. Road classification

Roads under City maintenance are classified for the purposes of this policy as
follows. Classification determines the response target in Section 2 and the
responsible contractor in Section 4.

Arterial roads carry more than 12,000 vehicles per day and include Peachtree
Industrial Boulevard, Buford Highway, Canton Highway, and Atlanta Road.
Collector roads carry between 2,000 and 12,000 vehicles per day and include
Tribble Gap Road, Pilgrim Mill Road, Bethelview Road, and Castleberry Road.
Residential streets carry fewer than 2,000 vehicles per day and comprise all
remaining publicly maintained roadway within the City limits. Alleys, unpaved
service drives, and parking facilities are excluded from this policy and are
handled under the Facilities Maintenance Standard.

State routes remain the maintenance responsibility of the Georgia Department of
Transportation. A report received on a state route is logged, acknowledged to
the reporting resident, and forwarded to GDOT within one business day; the
response targets in Section 2 do not apply to it.

## 2. Severity classification and response time targets

Every reported roadway defect is assigned a severity at intake. The response
target is the elapsed time from report acknowledgement to the completion of
either a permanent repair or a documented temporary safe-condition measure such
as a cold-patch fill, a plate, or a barricade.

Severity 1, immediate hazard. A defect presenting a present danger of vehicle
damage or personal injury: a pothole deeper than four inches, a sinkhole or
undermined surface of any dimension, an exposed utility casting, a missing or
displaced manhole cover, or a failed surface across a travel lane. Response
target is four hours on arterial roads, eight hours on collector roads, and
twelve hours on residential streets, on a twenty-four hour basis including
weekends and holidays.

Severity 2, urgent. A pothole between two and four inches deep, edge drop-off
exceeding two inches on a lane with no shoulder, a broken or heaved joint, or a
defect within an intersection or a marked crosswalk. Response target is
twenty-four hours on arterial roads, forty-eight hours on collector roads, and
five business days on residential streets.

Severity 3, routine. A pothole under two inches deep, alligator cracking
covering less than one hundred square feet, minor raveling, or a surface defect
outside the wheel path. Response target is ten business days on arterial and
collector roads and thirty calendar days on residential streets. Routine
defects may be batched into a scheduled resurfacing cycle where one is planned
within ninety days, provided the reporting resident is notified of the deferral.

Severity 4, monitoring. Hairline cracking, weathering, and cosmetic surface
wear. No repair is scheduled. The location is added to the pavement condition
survey and re-inspected at the next annual assessment.

Failure to meet a response target is recorded against the responsible party.
Where the responsible party is a contractor, Section 5 applies.

## 3. Temporary measures

A temporary measure satisfies the response target only where the site is made
safe and a permanent repair is scheduled within thirty calendar days of the
temporary work. Cold-patch material placed in an arterial travel lane must be
inspected within seventy-two hours and replaced with a permanent hot-mix repair
before the thirty day limit. A barricade or plate left in place beyond fourteen
days requires written justification from the responsible supervisor.

## 4. Contractor assignment by road class

Work is assigned to the contractor holding the current agreement for the
affected road class. Assignment does not transfer the City's obligation to meet
the response targets in Section 2.

Northside Paving LLC holds the arterial and collector resurfacing agreement,
covering full-depth patching, milling, and hot-mix overlay on Peachtree
Industrial Boulevard, Buford Highway, Canton Highway, Atlanta Road, Tribble Gap
Road, Pilgrim Mill Road, Bethelview Road, and Castleberry Road. The agreement
requires a crew on site within four hours of a Severity 1 dispatch on any
arterial road.

Forsyth Surface Works Inc holds the residential streets agreement, covering
pothole repair, crack sealing, and surface treatment on all residential
streets. The agreement requires acknowledgement within four business hours and
a crew on site within the applicable Section 2 target.

City crews retain all emergency response, all temporary safe-condition
measures, all work within an active utility cut, and any repair on a road class
for which no contractor agreement is currently in force.

Utility cuts are the responsibility of the utility that opened them. A defect
within twelve months of a recorded utility cut, and within five feet of it, is
charged to that utility and not to the paving contractor.

## 5. Warranty windows and defect liability

Contractor work carries a warranty running from the date of final acceptance,
not from the date the work was performed.

Full-depth patching and hot-mix overlay carry a twenty-four month warranty.
Surface treatments, crack sealing, and skin patching carry a twelve month
warranty. Cold-patch and other temporary repairs carry a ninety day warranty.
Pavement markings and thermoplastic carry a twelve month warranty.

A defect appearing within the warranty window and within the limits of the
warranted work is remedied by the contractor at no cost to the City. The
contractor must begin remedial work within the Section 2 response target for
the severity assigned to the new defect. Warranty work does not extend the
original warranty window except on the remedied area, which carries a fresh
window of the same duration.

The warranty does not cover damage caused by a documented third-party event: a
utility cut, a vehicle fire, a hazardous material spill, a collision, or a
declared weather emergency. The burden of demonstrating a third-party cause
rests with the contractor and must be supported by photographs and an
inspection report.

## 6. Filing a claim against a contractor

A claim is filed against a contractor when a defect recurs within the
applicable warranty window, when the contractor misses a response target
defined in Section 2 or in the agreement, or when an inspection finds work that
does not conform to the specification.

The inspector documents the location, the date of the original work, the
warranty class, and the observed defect, with photographs taken at the site.
Written notice is issued to the contractor within five business days of the
inspection. The contractor has ten business days from notice to remedy the
defect or to submit a written third-party-cause defense with supporting
evidence.

Where the contractor does not remedy within ten business days and offers no
accepted defense, the City performs the repair with City crews or an
alternative contractor and deducts the full cost from the next progress
payment. A pattern of three or more sustained claims within a twelve month
period triggers a performance review and may result in suspension of the
agreement.

Resident-submitted damage claims against the City are handled under the
separate Tort Claims Procedure and are not governed by this section. Where a
resident claim concerns a location under an active contractor warranty, the
claims officer attaches the warranty record to the file.

## 7. Records

Every report, dispatch, inspection, repair, warranty determination, and claim is
retained in the City's asset record for a minimum of seven years. The record for
a repair must identify the road class, the assigned severity, the responsible
party, the response time actually achieved, and the warranty class of the work
performed.`;

// The executed agreement the policy's Section 4 refers to. Contract ref
// PW-2025-041 is the join key the demo uses everywhere: this document, the
// warranty certificate below, capital_jobs.contract_ref (seeded by
// scripts/seed-demo-contractor.mjs), and the liability badge on the pothole
// camera-demo report all cite the same number.
const CONTRACT_DOCUMENT = `# Pavement Repair Services Agreement, Contract PW-2025-041

This Agreement is made between the City Department of Public Works ("the
City") and Northside Paving LLC, 2180 Industrial Court, Suite B ("the
Contractor"), for pothole repair and pavement restoration services on the
City's arterial and collector road network. The term of this Agreement runs
two years from the notice to proceed, with one optional one-year renewal at
the City's sole discretion.

## 1. Scope of services

The Contractor shall furnish all labor, materials, equipment, traffic
control, and supervision required for: full-depth asphalt patching; pothole
repair by saw-cut, excavation, tack, and hot-mix backfill; milling and hot-mix
overlay; crack routing and sealing incidental to a patch; and restoration of
pavement markings disturbed by the work.

The covered network comprises the arterial and collector roads defined in
Section 1 of the Road Maintenance Policy, including Peachtree Industrial
Boulevard, Buford Highway, Canton Highway, Atlanta Road, Tribble Gap Road,
Pilgrim Mill Road, Bethelview Road, and Castleberry Road. Residential
streets, alleys, and parking facilities are excluded.

## 2. Response obligations

Upon a Severity 1 dispatch on any arterial road the Contractor shall have a
crew on site within four hours, on a twenty-four hour basis including
weekends and holidays. Severity 2 dispatches require mobilization within
twenty-four hours on arterial roads and forty-eight hours on collector roads.
Severity 3 work is scheduled within ten business days. Failure to meet a
response obligation is recorded against the Contractor under Section 5 of the
Road Maintenance Policy and may be charged as liquidated damages of five
hundred dollars per elapsed day.

## 3. Compensation

Work is compensated at the unit prices fixed in Exhibit B: full-depth patch,
one hundred eighty-five dollars per square yard; mill and overlay, sixty-two
dollars per square yard; saw-cut pothole repair, three hundred forty dollars
per location up to two square yards; traffic control, per the lump-sum daily
rate. Progress payments are made monthly against inspected and accepted
quantities, less five percent retainage released at final acceptance.

## 4. Warranty

All work performed under this Agreement is warranted from the date of final
acceptance, not the date of performance. Full-depth patching and hot-mix
overlay carry a twenty-four month warranty against cracking, raveling,
rutting, delamination, and recurrence of the repaired defect, including any
pothole forming within the limits of the warranted work. Surface treatments
and crack sealing carry a twelve month warranty. Temporary cold-patch placed
by the Contractor carries a ninety day warranty.

A defect appearing within the warranty window is remedied by the Contractor
at no cost to the City, with mobilization inside the response targets of
Section 2 of the Road Maintenance Policy for the severity assigned to the new
defect. The warranty on a remedied area restarts for the full original
duration. The warranty excludes damage from documented third-party events as
defined in Section 5 of the Road Maintenance Policy; the burden of proof
rests with the Contractor.

## 5. Insurance and bond

The Contractor maintains commercial general liability coverage of two million
dollars per occurrence, automobile liability of one million dollars, and
statutory workers' compensation. A maintenance bond equal to one hundred
percent of the final contract value secures the warranty obligations of
Section 4 and remains in force until the last warranty window lapses.

## 6. Claims and disputes

Warranty claims are noticed and processed under Section 6 of the Road
Maintenance Policy. Written notice issues within five business days of
inspection; the Contractor has ten business days to remedy or submit a
third-party-cause defense. Unremedied claims are deducted from the next
progress payment or drawn against the maintenance bond. Three sustained
claims within twelve months trigger a performance review and possible
suspension of this Agreement.`;

// What the contractor actually did, and the live warranty on it. The project
// limits deliberately cover 1245 Peachtree Industrial Blvd, the pothole
// camera-demo report's address, and the warranty window brackets today, so
// document retrieval, the capital-jobs seed, and the liability badge all tell
// the same story.
const WARRANTY_DOCUMENT = `# Completed Work Record and Warranty Certificate, Northside Paving LLC

Contract PW-2025-041, Work Package 7: Peachtree Industrial Boulevard
resurfacing, Station 0+00 at Market Place Boulevard to Station 84+50 at
Bald Ridge Marina Road, including the full frontage of the 1100-1400 blocks.
This record is retained under Section 7 of the Road Maintenance Policy.

## 1. Work performed

Between April 21 and May 15 of 2026 the Contractor milled one and one half
inches of existing surface across both travel lanes and placed a one and one
half inch hot-mix asphalt overlay, 12.5 millimeter Superpave mix, over the
full package limits: approximately 21,400 square yards. Forty-one full-depth
patches totaling 610 square yards were excavated and rebuilt ahead of the
overlay where coring showed base failure, including three locations in the
1200 block with recurring pothole history. Thermoplastic lane lines, turn
arrows, and crosswalk markings were restored across the limits.

## 2. Inspection and acceptance

The City inspector performed density testing on nine cores; all met the
ninety-two percent minimum. Ride quality measured within specification on
both lanes. A punch list of two items (a low utility casting at Station
12+80 and flushing at the Station 31+00 tie-in) was completed on May 27.
Final acceptance was issued by the Department of Public Works on June 1,
2026. Final contract value for the package: eight hundred ninety-one
thousand dollars.

## 3. Warranty certificate

Pursuant to Section 4 of Contract PW-2025-041, all work in this package is
warranted for twenty-four months from final acceptance. The warranty runs
from June 1, 2026 through June 1, 2028.

Covered defects within the package limits include cracking, raveling,
rutting, delamination, and any pothole forming in the overlaid or patched
surface. A defect reported within the window is repaired by Northside Paving
LLC at no cost to the City, with mobilization inside the response targets of
the Road Maintenance Policy for the severity assigned. Any pothole reported
on Peachtree Industrial Boulevard between Market Place Boulevard and Bald
Ridge Marina Road before June 1, 2028 is presumed to fall under this
warranty unless a documented third-party cause is shown.

## 4. Maintenance bond

Maintenance bond number MB-88412, issued by Granite State Surety at one
hundred percent of the final package value, secures these obligations until
the warranty lapses. Claims are processed per Section 6 of the Road
Maintenance Policy; notice contacts are on file with the City Clerk.`;

// contractorEmail links the doc to its contractors row (066 contractor_id),
// resolved at ingest time, null-safe when the vendor is not seeded yet
// (scripts/seed-demo-contractor.mjs owns that row).
const NORTHSIDE_EMAIL = "dispatch@northsidepaving.example";

const DOCS = [
  {
    title: "Road Maintenance Policy & Contractor Responsibilities",
    filename: "road-maintenance-policy.md",
    doc_kind: "policy",
    text: POLICY_DOCUMENT,
    contractorEmail: null,
  },
  {
    title: "Pavement Repair Services Agreement, Northside Paving LLC",
    filename: "pw-2025-041-services-agreement.md",
    doc_kind: "contract",
    text: CONTRACT_DOCUMENT,
    contractorEmail: NORTHSIDE_EMAIL,
  },
  {
    title: "Completed Work & Warranty Certificate, Northside Paving LLC",
    filename: "pw-2025-041-warranty-certificate.md",
    doc_kind: "contract",
    text: WARRANTY_DOCUMENT,
    contractorEmail: NORTHSIDE_EMAIL,
  },
];

// ── ingest ─────────────────────────────────────────────────────────────────
const cities = await rest("GET", `cities?slug=eq.${slug}&select=id,name`);
if (!cities?.length) {
  console.error(`No city with slug "${slug}"`);
  process.exit(1);
}
const city = cities[0];

// Resolve vendor emails to contractor ids once, tolerating an unseeded vendor.
const contractorIdByEmail = new Map();
for (const email of new Set(
  DOCS.map((d) => d.contractorEmail).filter(Boolean),
)) {
  const [row] =
    (await rest(
      "GET",
      `contractors?email=eq.${encodeURIComponent(email)}&city_id=eq.${city.id}&select=id`,
    )) ?? [];
  if (row) contractorIdByEmail.set(email, row.id);
  else
    console.log(
      `note: no contractors row for ${email}. Docs seed without a vendor link (run scripts/seed-demo-contractor.mjs, then re-run this).`,
    );
}

for (const { title, filename, doc_kind, text, contractorEmail } of DOCS) {
  const existing = await rest(
    "GET",
    `city_documents?city_id=eq.${city.id}&title=eq.${encodeURIComponent(title)}&select=id`,
  );
  if (existing?.length) {
    for (const doc of existing) {
      await rest("DELETE", `city_documents?id=eq.${doc.id}`);
    }
    console.log(`removed ${existing.length} previous copy/copies of "${title}"`);
  }

  const chunks = chunkDocument(text);

  const [doc] = await rest("POST", "city_documents", {
    city_id: city.id,
    title,
    filename,
    // Seeded text has no uploaded original to keep in the bucket.
    storage_path: null,
    doc_kind,
    contractor_id: contractorEmail
      ? (contractorIdByEmail.get(contractorEmail) ?? null)
      : null,
    chunk_count: 0,
  });

  await rest(
    "POST",
    "document_chunks",
    chunks.map((chunk) => ({
      document_id: doc.id,
      city_id: city.id,
      ordinal: chunk.ordinal,
      content: chunk.content,
      heading: chunk.heading,
    })),
  );

  await rest("PATCH", `city_documents?id=eq.${doc.id}`, {
    chunk_count: chunks.length,
  });

  console.log(
    `seeded "${title}" for ${city.name} (${slug}): ${chunks.length} chunks`,
  );
}

// Prove retrieval works end-to-end against what was just written.
for (const query of [
  "pothole on Peachtree Industrial Blvd",
  "Northside Paving warranty pothole",
]) {
  const probe = await fetch(`${url}/rest/v1/rpc/search_document_chunks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ _city_id: city.id, _query: query, _limit: 3 }),
  });
  const hits = await probe.json();
  console.log(
    `retrieval probe '${query}':`,
    Array.isArray(hits)
      ? hits.map((h) => `${h.document_title} › ${h.heading} (${Number(h.rank).toFixed(4)})`)
      : hits,
  );
}
