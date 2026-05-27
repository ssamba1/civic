import type { Open311Request } from "./transform";
import type { Open311Service } from "./services";

/** Escape XML special characters */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap a value in an XML tag. Omits the tag entirely if value is null/undefined. */
function tag(name: string, value: unknown): string {
  if (value === null || value === undefined) return `<${name}></${name}>`;
  return `<${name}>${esc(value)}</${name}>`;
}

/** Serialize an array of Open311 service requests to XML */
export function toOpen311Xml(requests: Open311Request[]): string {
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', "<service_requests>"];

  for (const r of requests) {
    lines.push("  <request>");
    lines.push(`    ${tag("service_request_id", r.service_request_id)}`);
    lines.push(`    ${tag("status", r.status)}`);
    lines.push(`    ${tag("status_notes", r.status_notes)}`);
    lines.push(`    ${tag("service_name", r.service_name)}`);
    lines.push(`    ${tag("service_code", r.service_code)}`);
    lines.push(`    ${tag("description", r.description)}`);
    lines.push(`    ${tag("agency_responsible", r.agency_responsible)}`);
    lines.push(`    ${tag("service_notice", r.service_notice)}`);
    lines.push(`    ${tag("requested_datetime", r.requested_datetime)}`);
    lines.push(`    ${tag("updated_datetime", r.updated_datetime)}`);
    lines.push(`    ${tag("expected_datetime", r.expected_datetime)}`);
    lines.push(`    ${tag("address", r.address)}`);
    lines.push(`    ${tag("lat", r.lat)}`);
    lines.push(`    ${tag("long", r.long)}`);
    lines.push(`    ${tag("media_url", r.media_url)}`);
    lines.push(`    ${tag("zipcode", r.zipcode)}`);

    if (r.extended_attributes) {
      lines.push("    <extended_attributes>");
      lines.push(`      ${tag("civic_category", r.extended_attributes.civic_category)}`);
      lines.push(`      ${tag("civic_severity", r.extended_attributes.civic_severity)}`);
      lines.push(`      ${tag("civic_confidence", r.extended_attributes.civic_confidence)}`);
      if (r.extended_attributes.civic_reasoning) {
        lines.push(`      ${tag("civic_reasoning", r.extended_attributes.civic_reasoning)}`);
      }
      if (r.extended_attributes.civic_is_emergency !== undefined) {
        lines.push(`      ${tag("civic_is_emergency", r.extended_attributes.civic_is_emergency)}`);
      }
      lines.push("    </extended_attributes>");
    }

    lines.push("  </request>");
  }

  lines.push("</service_requests>");
  return lines.join("\n");
}

/** Serialize a single Open311 service request to XML */
export function toOpen311SingleXml(request: Open311Request): string {
  return toOpen311Xml([request]);
}

/** Serialize an array of Open311 services to XML */
export function toServicesXml(services: Open311Service[]): string {
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', "<services>"];

  for (const s of services) {
    lines.push("  <service>");
    lines.push(`    ${tag("service_code", s.service_code)}`);
    lines.push(`    ${tag("service_name", s.service_name)}`);
    lines.push(`    ${tag("description", s.description)}`);
    lines.push(`    ${tag("metadata", s.metadata)}`);
    lines.push(`    ${tag("type", s.type)}`);
    lines.push(`    ${tag("keywords", s.keywords)}`);
    lines.push(`    ${tag("group", s.group)}`);
    lines.push("  </service>");
  }

  lines.push("</services>");
  return lines.join("\n");
}

/** Serialize an Open311 error to XML */
export function toErrorXml(code: number, description: string): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<errors>",
    "  <error>",
    `    ${tag("code", code)}`,
    `    ${tag("description", description)}`,
    "  </error>",
    "</errors>",
  ].join("\n");
}
