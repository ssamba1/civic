/**
 * SSRF guard for webhook URLs.
 *
 * Blocks hostnames that resolve (or are) private/internal targets.
 * DNS-rebinding is a residual risk: the hostname may pass this check at
 * registration time but later resolve to a private IP. Acceptable for MVP.
 */

/** Returns true when the hostname must be blocked to prevent SSRF. */
export function isBlockedWebhookHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();

  // localhost / *.localhost
  if (h === "localhost" || h.endsWith(".localhost")) return true;

  // 0.0.0.0
  if (h === "0.0.0.0") return true;

  // IPv6 loopback
  if (h === "::1" || h === "[::1]") return true;

  // Try to parse as an IPv4 address
  const ipv4 = parseIPv4(h);
  if (ipv4 !== null) {
    const [a, b, c] = ipv4;
    // Loopback: 127.0.0.0/8
    if (a === 127) return true;
    // RFC-1918: 10.0.0.0/8
    if (a === 10) return true;
    // RFC-1918: 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // RFC-1918: 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // Link-local: 169.254.0.0/16 (includes cloud metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
  }

  return false;
}

/** Parse a dotted-decimal IPv4 string into [a, b, c, d], or null if not IPv4. */
function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}
