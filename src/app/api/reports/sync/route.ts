import { NextResponse } from "next/server";
import { submitReport } from "@/app/report/actions";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[reports-sync]");

function bearerTokenFrom(request: Request): string | undefined {
  const authorization = request.headers.get("authorization")?.trim();
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    if (typeof body !== "object" || body === null)
      return NextResponse.json(
        { ok: false, error: "Expected a queued report object" },
        { status: 400 },
      );

    const bearerToken = bearerTokenFrom(request);
    const user = bearerToken ? { id: "bearer" } : await getAuthUser();
    if (!user)
      return NextResponse.json(
        { ok: false, error: "unauthenticated" },
        { status: 401 },
      );

    const payload = body as Record<string, unknown>;
    const result = await submitReport({
      photosBlurred: payload.photosBlurred as string[],
      photosOriginal: payload.photosOriginal as string[],
      location: payload.location as { lat: number; lng: number } | null,
      address: (payload.address as string | null) ?? null,
      description: (payload.description as string | null) ?? null,
      tags: (payload.tags as string[]) ?? [],
      phashes: payload.phashes as string[] | undefined,
      id: payload.id as string | undefined,
      occurredAt: payload.occurredAt as string | undefined,
      authToken: bearerToken,
    });
    if (!result.ok)
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.error === "unauthenticated" ? 401 : 422 },
      );

    logger.info("offline_sync_delivered", {
      queuedId: payload.id,
      reportId: result.data.id,
      occurredAt: payload.occurredAt,
    });
    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (error) {
    logger.error("offline_sync_threw", error);
    return NextResponse.json(
      { ok: false, error: "Sync failed" },
      { status: 500 },
    );
  }
}
