"use server";

import { z } from "zod/v4";
import { getAuthUser } from "@/lib/db/ssr-client";
import {
  buildWalkupUrl,
  renderWalkupQrSvg,
  type WalkupTarget,
} from "@/lib/qr/walkup";
import type { Result } from "@/lib/types";

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  asset: z
    .string()
    .max(60)
    .transform((s) => s.trim())
    .transform((s) => (s.length > 0 ? s : null))
    .nullable()
    .default(null),
});

/**
 * Generate a walk-up QR (deep-link + SVG) for a physical location. The /admin
 * layout already gates the route to admins; re-check auth here since server
 * actions are public endpoints.
 */
export async function generateWalkupQr(
  input: WalkupTarget,
): Promise<Result<{ url: string; svg: string }>> {
  // In dev-bypass / demo the layout still gates the page; a null user here only
  // happens outside a browser session, so fail closed unless dev bypass is on.
  const user = await getAuthUser();
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (!user && !devBypass) return { ok: false, error: "unauthorized" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const url = buildWalkupUrl(parsed.data);
  try {
    const svg = await renderWalkupQrSvg(url);
    return { ok: true, data: { url, svg } };
  } catch {
    return { ok: false, error: "qr_render_failed" };
  }
}
