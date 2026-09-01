import { config } from "../config";
import type { AssignedWork, ReportSummary, SyncPayload } from "../types";
import { supabase } from "./supabase";
import type { SendResult } from "./sync";

type PostgisPoint = {
  type: "Point";
  coordinates: [number, number];
};

function normalizeLocation(value: unknown): ReportSummary["location"] {
  if (!value || typeof value !== "object") return undefined;
  if ("lat" in value && "lng" in value) {
    const point = value as { lat: unknown; lng: unknown };
    return typeof point.lat === "number" && typeof point.lng === "number"
      ? { lat: point.lat, lng: point.lng }
      : undefined;
  }
  const point = value as Partial<PostgisPoint>;
  return point.type === "Point" &&
    Array.isArray(point.coordinates) &&
    point.coordinates.length >= 2 &&
    point.coordinates.every((coordinate) => typeof coordinate === "number")
    ? { lat: point.coordinates[1], lng: point.coordinates[0] }
    : undefined;
}

export async function syncReport(
  payload: SyncPayload,
  expectedOwnerId?: string,
): Promise<SendResult> {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || (expectedOwnerId && session.user.id !== expectedOwnerId))
    return {
      ok: false,
      error: "Sign in before syncing this report.",
      deferred: true,
    };
  try {
    const request = async (accessToken: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        return await fetch(`${config.apiUrl}/api/reports/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    };
    let response = await request(session.access_token);
    if (response.status === 401) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
      if (!session || (expectedOwnerId && session.user.id !== expectedOwnerId))
        return {
          ok: false,
          error: "Your session expired. Sign in again to sync saved reports.",
          deferred: true,
        };
      response = await request(session.access_token);
    }
    if (response.status === 401 || response.status === 403)
      return {
        ok: false,
        error: "Sign in again to sync saved reports.",
        deferred: true,
      };
    let body: { ok?: boolean; id?: string; error?: string };
    try {
      body = JSON.parse(await response.text()) as typeof body;
    } catch {
      return {
        ok: false,
        error: `The server returned an invalid response (${response.status}).`,
        stop: true,
      };
    }
    if (response.ok && body.ok === true && body.id === payload.id)
      return { ok: true };
    return {
      ok: false,
      error:
        body.error ??
        (body.ok === true
          ? "The server confirmed a different report identifier."
          : `Sync failed (${response.status})`),
      stop:
        response.status === 429 || response.status >= 500 || body.ok === true,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network request failed",
      offline: true,
    };
  }
}

export async function loadMyReports(): Promise<ReportSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id,status,address,description,photo_public_url,created_at,classifications(category,severity)",
    )
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const classification = Array.isArray(row.classifications)
      ? row.classifications[0]
      : row.classifications;
    return {
      ...row,
      category: classification?.category,
      severity: classification?.severity,
    };
  });
}

export async function loadCommunityReports(): Promise<ReportSummary[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id,status,address,description,photo_public_url,created_at,location,classifications(category,severity)",
    )
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const classification = Array.isArray(row.classifications)
      ? row.classifications[0]
      : row.classifications;
    return {
      ...row,
      location: normalizeLocation(row.location),
      category: classification?.category,
      severity: classification?.severity,
    };
  });
}

interface AssignedWorkRow {
  id: string;
  dispatched_at: string | null;
  completed_at: string | null;
  priority_score: number | null;
  crews: { name: string } | Array<{ name: string }> | null;
  reports:
    | {
        address: string | null;
        status: string;
        classifications:
          | { category: string }
          | Array<{ category: string }>
          | null;
      }
    | Array<{
        address: string | null;
        status: string;
        classifications:
          | { category: string }
          | Array<{ category: string }>
          | null;
      }>;
}

export async function loadAssignedWork(): Promise<AssignedWork[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: memberships, error: membershipError } = await supabase
    .from("crew_members")
    .select("crew_id")
    .eq("user_id", user.id);
  if (membershipError) throw membershipError;
  const crewIds = (memberships ?? []).map(
    (membership) => membership.crew_id as string,
  );
  if (crewIds.length === 0) return [];
  const { data, error } = await supabase
    .from("work_orders")
    .select(
      "id,dispatched_at,completed_at,priority_score,crews(name),reports!inner(address,status,classifications(category))",
    )
    .in("assigned_crew_id", crewIds)
    .is("completed_at", null)
    .order("priority_score", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as AssignedWorkRow[]).map((row) => {
    const report = Array.isArray(row.reports) ? row.reports[0] : row.reports;
    const crew = Array.isArray(row.crews) ? row.crews[0] : row.crews;
    const classification = Array.isArray(report.classifications)
      ? report.classifications[0]
      : report.classifications;
    return {
      id: row.id,
      crewName: crew?.name ?? "Assigned crew",
      status: report.status,
      category: classification?.category ?? "other",
      address: report.address,
      dispatchedAt: row.dispatched_at,
      priorityScore: row.priority_score,
    };
  });
}
