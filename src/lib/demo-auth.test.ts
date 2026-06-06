// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TEAM_LIST } from "@/lib/teams";
import { authenticateDemo, DEMO_ACCOUNTS, findDemoAccount } from "./demo-auth";

const OPERATIONAL_TEAMS = TEAM_LIST.filter((t) => t.id !== "all");

describe("DEMO_ACCOUNTS", () => {
  it("has one resident, one admin, and one account per operational team", () => {
    expect(DEMO_ACCOUNTS).toHaveLength(2 + OPERATIONAL_TEAMS.length);
    expect(OPERATIONAL_TEAMS).toHaveLength(11);
  });

  it("maps teamtest{n} to TEAM_LIST order with a /{teamId}/cumming home", () => {
    OPERATIONAL_TEAMS.forEach((team, i) => {
      const account = DEMO_ACCOUNTS.find(
        (a) => a.username === `teamtest${i + 1}`,
      );
      expect(account, `teamtest${i + 1} exists`).toBeDefined();
      expect(account?.role).toBe("team");
      expect(account?.teamId).toBe(team.id);
      expect(account?.home).toBe(`/${team.id}/cumming`);
      expect(account?.password).toBe("teamtest");
    });
  });

  it("routes the resident and admin personas to their surfaces", () => {
    expect(findDemoAccount("usertest")?.home).toBe("/user/pulse");
    expect(findDemoAccount("admintest")?.home).toBe("/city/cumming");
  });
});

describe("authenticateDemo", () => {
  it("accepts a valid pair and is case-insensitive on the username", () => {
    expect(authenticateDemo("usertest", "usertest")?.role).toBe("user");
    expect(authenticateDemo("TeamTest1", "teamtest")?.teamId).toBe(
      OPERATIONAL_TEAMS[0].id,
    );
  });

  it("rejects a wrong password or unknown username", () => {
    expect(authenticateDemo("usertest", "nope")).toBeNull();
    expect(authenticateDemo("ghost", "teamtest")).toBeNull();
  });
});
