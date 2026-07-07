"use server";

import { resolveAuthHome } from "@/lib/auth-home";
import { getAuthUser } from "@/lib/db/ssr-client";

/**
 * Where the current session should land post-sign-in. Mirrors the
 * auth/callback route's landing logic for the email/password sign-in path,
 * which never goes through that route.
 */
export async function resolveOwnAuthHome(): Promise<string> {
  const user = await getAuthUser();
  if (!user) return "/";
  return resolveAuthHome(user.id);
}
