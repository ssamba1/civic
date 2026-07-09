"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

const log = createLogger("admin-contractors");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractorRow {
  id: string;
  city_id: string;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Internal: require admin
// Returns the acting admin's city_id, or null if unauthorized.
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<{ adminId: string; cityId: string } | null> {
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";

  const db = createServerClient();

  if (devBypass) {
    // In dev bypass mode there is no acting user — return a sentinel so callers
    // can still function. The sentinel city id is the first city in the DB.
    const { data } = await db
      .from("cities")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();
    return data ? { adminId: "", cityId: data.id } : null;
  }

  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await db
    .from("users")
    .select("role, city_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; city_id: string | null }>();

  if (error) {
    log.error("admin role check failed", error, { userId: user.id });
    return null;
  }
  if (data?.role !== "admin" || !data.city_id) return null;
  return { adminId: user.id, cityId: data.city_id };
}

// ---------------------------------------------------------------------------
// listContractors
// ---------------------------------------------------------------------------

export async function listContractors(): Promise<ContractorRow[]> {
  try {
    const admin = await requireAdmin();
    if (!admin) return [];

    const db = createServerClient();
    const { data, error } = await db
      .from("contractors")
      .select("id, city_id, name, email, active, created_at")
      .eq("city_id", admin.cityId)
      .order("name");

    if (error) {
      log.error("listContractors query failed", error, admin);
      return [];
    }
    return (data ?? []) as ContractorRow[];
  } catch (err) {
    log.error("listContractors threw", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// createContractor
// ---------------------------------------------------------------------------

export async function createContractor(input: {
  name: string;
  email: string;
}): Promise<Result<{ id: string }>> {
  try {
    const admin = await requireAdmin();
    if (!admin) return { ok: false, error: "unauthorized" };

    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();

    if (!name || name.length > 200) {
      return { ok: false, error: "invalid_name" };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "invalid_email" };
    }

    const db = createServerClient();
    const { data, error } = await db
      .from("contractors")
      .insert({ city_id: admin.cityId, name, email, active: true })
      .select("id")
      .single<{ id: string }>();

    if (error) {
      // Unique constraint on email
      if (error.code === "23505") {
        return { ok: false, error: "email_already_exists" };
      }
      log.error("createContractor insert failed", error, admin);
      return { ok: false, error: "db_error" };
    }

    revalidatePath("/admin/contractors");
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    log.error("createContractor threw", err);
    return { ok: false, error: "unexpected_error" };
  }
}

// ---------------------------------------------------------------------------
// deactivateContractor / reactivateContractor
// ---------------------------------------------------------------------------

export async function deactivateContractor(
  contractorId: string,
): Promise<Result<void>> {
  return setContractorActive(contractorId, false);
}

export async function reactivateContractor(
  contractorId: string,
): Promise<Result<void>> {
  return setContractorActive(contractorId, true);
}

async function setContractorActive(
  contractorId: string,
  active: boolean,
): Promise<Result<void>> {
  try {
    const admin = await requireAdmin();
    if (!admin) return { ok: false, error: "unauthorized" };

    if (
      typeof contractorId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(contractorId)
    ) {
      return { ok: false, error: "invalid_id" };
    }

    const db = createServerClient();
    const { error } = await db
      .from("contractors")
      .update({ active })
      // Scope to admin's city to prevent cross-city mutations
      .eq("id", contractorId)
      .eq("city_id", admin.cityId);

    if (error) {
      log.error("setContractorActive failed", error, {
        contractorId,
        active,
        ...admin,
      });
      return { ok: false, error: "db_error" };
    }

    revalidatePath("/admin/contractors");
    return { ok: true, data: undefined };
  } catch (err) {
    log.error("setContractorActive threw", err);
    return { ok: false, error: "unexpected_error" };
  }
}

// ---------------------------------------------------------------------------
// assignContractorToWorkOrder
//
// Assigns a contractor to a work order. Verifies:
//   1. The caller is an admin in the correct city.
//   2. The contractor exists and belongs to the same city.
//   3. The work order's report belongs to the same city.
// ---------------------------------------------------------------------------

export async function assignContractorToWorkOrder(
  workOrderId: string,
  contractorId: string | null,
): Promise<Result<void>> {
  try {
    const admin = await requireAdmin();
    if (!admin) return { ok: false, error: "unauthorized" };

    if (
      typeof workOrderId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(workOrderId)
    ) {
      return { ok: false, error: "invalid_work_order_id" };
    }

    if (
      contractorId !== null &&
      !/^[0-9a-f-]{36}$/i.test(contractorId)
    ) {
      return { ok: false, error: "invalid_contractor_id" };
    }

    const db = createServerClient();

    // If assigning (not clearing), verify the contractor is in the admin's city.
    if (contractorId !== null) {
      const { data: contractor, error: cErr } = await db
        .from("contractors")
        .select("id, active")
        .eq("id", contractorId)
        .eq("city_id", admin.cityId)
        .maybeSingle<{ id: string; active: boolean }>();

      if (cErr) {
        log.error("assignContractor contractor lookup failed", cErr, admin);
        return { ok: false, error: "db_error" };
      }
      if (!contractor) return { ok: false, error: "contractor_not_found" };
      if (!contractor.active) return { ok: false, error: "contractor_inactive" };
    }

    // Verify the work order exists and its report belongs to the admin's city.
    const { data: wo, error: woErr } = await db
      .from("work_orders")
      .select("id, reports!inner(city_id)")
      .eq("id", workOrderId)
      .maybeSingle<{ id: string; reports: { city_id: string } }>();

    if (woErr) {
      log.error("assignContractor work_order lookup failed", woErr, admin);
      return { ok: false, error: "db_error" };
    }
    if (!wo) return { ok: false, error: "work_order_not_found" };
    if (wo.reports.city_id !== admin.cityId) {
      return { ok: false, error: "cross_city_forbidden" };
    }

    // Write — only contractor_id and contractor_status touched.
    const { error: updateErr } = await db
      .from("work_orders")
      .update({
        contractor_id: contractorId,
        // Reset contractor progress when re-assigning or un-assigning.
        contractor_status: contractorId !== null ? "assigned" : null,
        contractor_note: null,
        contractor_photo_url: null,
        contractor_updated_at: contractorId !== null ? new Date().toISOString() : null,
      })
      .eq("id", workOrderId);

    if (updateErr) {
      log.error("assignContractor update failed", updateErr, {
        workOrderId,
        contractorId,
        ...admin,
      });
      return { ok: false, error: "db_error" };
    }

    revalidatePath("/admin/contractors");
    return { ok: true, data: undefined };
  } catch (err) {
    log.error("assignContractorToWorkOrder threw", err);
    return { ok: false, error: "unexpected_error" };
  }
}
