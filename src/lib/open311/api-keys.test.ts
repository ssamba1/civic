import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the service client factory before importing the module under test.
const maybeSingle = vi.fn();
const chain = {
  select: () => chain,
  eq: () => chain,
  is: () => chain,
  maybeSingle,
};
const from = vi.fn(() => chain);
vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({ from }),
}));

import { lookupApiKey } from "./api-keys";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(() => {
  maybeSingle.mockReset();
  from.mockClear();
});

describe("lookupApiKey", () => {
  it("resolves a live key to its partner row", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "k1",
        label: "Forsyth GIS",
        user_id: "u1",
        city_id: "c1",
        scopes: ["open311:write"],
      },
      error: null,
    });
    const partner = await lookupApiKey("civic_plaintext");
    expect(partner).toEqual({
      id: "k1",
      label: "Forsyth GIS",
      userId: "u1",
      cityId: "c1",
      scopes: ["open311:write"],
    });
    // Looked up by SHA-256 hash of the plaintext, not the plaintext itself.
    expect(from).toHaveBeenCalledWith("api_keys");
    expect(sha256("civic_plaintext")).toHaveLength(64);
  });

  it("returns null for an unknown/revoked key (no row)", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await lookupApiKey("civic_missing")).toBeNull();
  });

  it("returns null on a DB error (un-migrated table) so the caller can fall back", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "relation api_keys does not exist" },
    });
    expect(await lookupApiKey("civic_x")).toBeNull();
  });

  it("rejects empty or oversized input without querying", async () => {
    expect(await lookupApiKey("")).toBeNull();
    expect(await lookupApiKey("x".repeat(513))).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("defaults scopes to [] when the column is null", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "k2", label: "L", user_id: "u", city_id: null, scopes: null },
      error: null,
    });
    const partner = await lookupApiKey("civic_y");
    expect(partner?.scopes).toEqual([]);
    expect(partner?.cityId).toBeNull();
  });

  it("returns null when the query throws", async () => {
    maybeSingle.mockRejectedValue(new Error("network"));
    expect(await lookupApiKey("civic_z")).toBeNull();
  });
});
