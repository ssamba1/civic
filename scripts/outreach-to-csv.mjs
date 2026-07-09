// Converts outreach/drafts/all.json into a flat CSV for Google Sheets mail-merge.
// Columns: To, Name, Org, Bucket, Subject, Body, Status
// Status is left blank; the Apps Script fills it "DRAFTED"/"SENT" so reruns skip done rows.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const drafts = JSON.parse(readFileSync(join(ROOT, "outreach/drafts/all.json"), "utf8"));

const esc = (v) => {
  const s = String(v ?? "");
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const header = ["To", "Name", "Org", "Bucket", "Subject", "Body", "Status"];
const lines = [header.join(",")];
for (const d of drafts) {
  lines.push([d.email, d.name, d.fullOrg, d.bucket, d.subject, d.body, ""].map(esc).join(","));
}
writeFileSync(join(ROOT, "outreach/drafts/mail_merge.csv"), lines.join("\r\n") + "\r\n");
console.log(`wrote outreach/drafts/mail_merge.csv: ${drafts.length} rows`);
