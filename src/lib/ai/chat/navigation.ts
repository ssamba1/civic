import type { ChatRole } from "@/lib/ai/chat/scope";

/**
 * Server-authoritative navigation allow-list for the navigateTo tool. Only
 * these path shapes may be returned to the client for router.push. No query
 * strings are permitted (no PII in URLs — AGENTS.md rule 4).
 */
const RESIDENT_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/report$/,
  /^\/login$/,
  /^\/user\/my-reports$/,
  /^\/user\/my-reports\/[a-zA-Z0-9-]+$/,
  /^\/user\/pulse$/,
  /^\/user\/updates$/,
  /^\/city\/[a-z0-9-]+$/,
  /^\/city\/[a-z0-9-]+\/(map|browse|analytics)$/,
  /^\/r\/[a-zA-Z0-9-]+$/,
];

const STAFF_ROUTES: RegExp[] = [
  /^\/staff$/,
  /^\/staff\/(map|grid|stats|settings)$/,
];

const STAFF_ROLES: ChatRole[] = ["staff_dispatcher", "staff_supervisor", "admin"];

export function isRouteAllowed(route: string, role: ChatRole): boolean {
  // Reject anything with a query string or fragment (no PII in URLs) and any
  // non-absolute / protocol-relative path.
  if (!route.startsWith("/") || route.startsWith("//")) return false;
  if (route.includes("?") || route.includes("#")) return false;

  if (RESIDENT_ROUTES.some((re) => re.test(route))) return true;
  if (STAFF_ROLES.includes(role) && STAFF_ROUTES.some((re) => re.test(route))) {
    return true;
  }
  return false;
}
