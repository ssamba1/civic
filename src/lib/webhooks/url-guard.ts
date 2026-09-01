/**
 * SSRF guard for webhook URLs.
 *
 * Blocks hostnames that are (or trivially encode) private/internal targets.
 * DNS-rebinding is a residual risk: the hostname may pass this check at
 * registration time but later resolve to a private IP. Acceptable for MVP.
 *
 * The check is deliberately strict about ENCODINGS, not just values. `fetch`
 * (undici) accepts several spellings of the same address that a naive
 * dotted-quad parse misses, and each one is a complete bypass of this guard:
 *
 *   http://2130706433/          bare decimal  -> 127.0.0.1
 *   http://0x7f.1/              hex + short   -> 127.0.0.1
 *   http://0177.0.0.1/          octal         -> 127.0.0.1
 *   http://127.1/               short form    -> 127.0.0.1
 *   http://[::ffff:169.254.169.254]/          -> 169.254.169.254 (cloud metadata)
 *
 * So every host is normalised to a canonical IPv4 quad (when it denotes one at
 * all) before the range checks run.
 */

/** Returns true when the hostname must be blocked to prevent SSRF. */
export function isBlockedWebhookHost(hostname: string): boolean {
  // URL.hostname keeps the brackets on an IPv6 literal; strip them first.
  const h = hostname.toLowerCase().trim().replace(/^\[/, "").replace(/\]$/, "");

  if (h === "") return true;

  // localhost / *.localhost
  if (h === "localhost" || h.endsWith(".localhost")) return true;

  // Anything that denotes an IPv4 address, in any of its accepted spellings.
  const ipv4 = parseIPv4(h) ?? parseIPv4MappedIPv6(h);
  if (ipv4 !== null) return isPrivateIPv4(ipv4);

  // Remaining IPv6 forms.
  if (isBlockedIPv6(h)) return true;

  return false;
}

/** True for loopback, RFC-1918, link-local, unspecified and other reserved v4. */
function isPrivateIPv4([a, b]: readonly number[]): boolean {
  // 0.0.0.0/8, includes the "this host" address.
  if (a === 0) return true;
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
  // Carrier-grade NAT: 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Benchmarking: 198.18.0.0/15
  if (a === 198 && (b === 18 || b === 19)) return true;
  // Reserved / broadcast: 240.0.0.0/4 (255.255.255.255 falls in here)
  if (a >= 240) return true;
  return false;
}

/** True for IPv6 loopback, unspecified, link-local (fe80::/10) and ULA (fc00::/7). */
function isBlockedIPv6(h: string): boolean {
  // Only consider strings that actually look like IPv6 (a hostname cannot
  // contain a colon, so this never misfires on a DNS name).
  if (!h.includes(":")) return false;

  // Drop a zone id (fe80::1%eth0) before matching.
  const addr = h.split("%")[0];

  // Loopback and unspecified, in compressed or expanded form.
  const groups = addr.split(":");
  if (groups.every((g) => g === "" || /^0+$/.test(g))) {
    // "::" (unspecified) and "0:0:...:0" both land here.
    return true;
  }
  if (/^(0*:)*0*:?0*1$/.test(addr) || addr === "::1") return true;

  // Link-local fe80::/10 -> fe80..febf
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true;
  // Unique local fc00::/7 -> fc.. and fd..
  if (/^f[cd][0-9a-f]{0,2}:/.test(addr)) return true;

  return false;
}

/**
 * IPv4-mapped / IPv4-compatible IPv6: `::ffff:169.254.169.254` and the
 * all-hex spelling `::ffff:a9fe:a9fe`. Both reach the v4 address.
 */
function parseIPv4MappedIPv6(
  host: string,
): [number, number, number, number] | null {
  const m = host.match(/^::(?:ffff:)?(.+)$/);
  if (!m) return null;
  const tail = m[1];

  // Dotted form: ::ffff:169.254.169.254
  const dotted = parseIPv4(tail);
  if (dotted) return dotted;

  // Hex form: ::ffff:a9fe:a9fe
  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  if (!Number.isInteger(hi) || !Number.isInteger(lo)) return null;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

/**
 * Parse any spelling `fetch` accepts into a canonical quad, or null when the
 * host is not an IPv4 literal at all.
 *
 * Accepts 1-4 dot-separated parts, each decimal, octal (leading 0) or hex
 * (leading 0x), the inet_aton grammar browsers and undici implement. With
 * fewer than 4 parts the final part supplies all remaining low-order bytes,
 * so `127.1` is 127.0.0.1 and `2130706433` is 127.0.0.1.
 */
function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const raw of parts) {
    const n = parseIPv4Part(raw);
    if (n === null) return null;
    nums.push(n);
  }

  // Every part but the last must fit in one byte.
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] > 0xff) return null;
  }

  // The last part fills the remaining bytes.
  const fillBytes = 4 - (nums.length - 1);
  const last = nums[nums.length - 1];
  const maxLast = fillBytes >= 4 ? 0xffffffff : 2 ** (8 * fillBytes) - 1;
  if (last > maxLast) return null;

  const quad: number[] = nums.slice(0, -1);
  for (let i = fillBytes - 1; i >= 0; i--) {
    quad.push((last >>> (8 * i)) & 0xff);
  }
  return quad as [number, number, number, number];
}

/** One inet_aton component: decimal, octal (0…) or hex (0x…). */
function parseIPv4Part(raw: string): number | null {
  if (raw === "") return null;
  let value: number;
  if (/^0[xX][0-9a-fA-F]+$/.test(raw)) {
    value = Number.parseInt(raw.slice(2), 16);
  } else if (/^0[0-7]+$/.test(raw)) {
    value = Number.parseInt(raw.slice(1), 8);
  } else if (/^[0-9]+$/.test(raw)) {
    value = Number.parseInt(raw, 10);
  } else {
    return null;
  }
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  return value;
}
