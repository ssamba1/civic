// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_CREW_TYPES } from "@/lib/crew-types";
import { TEAM_LIST } from "@/lib/teams";
import {
  authenticateDemo,
  CREW_UNIT_ROSTER,
  DEMO_ACCOUNTS,
  findDemoAccount,
  isDemoStaffAccount,
} from "./demo-auth";

const OPERATIONAL_TEAMS = TEAM_LIST.filter((t) => t.id !== "all");

describe("DEMO_ACCOUNTS", () => {
  it("has one resident, one admin, one account per operational team, one per crew type, and one per seeded crew unit", () => {
    expect(DEMO_ACCOUNTS).toHaveLength(
      2 +
        OPERATIONAL_TEAMS.length +
        DEFAULT_CREW_TYPES.length +
        CREW_UNIT_ROSTER.length,
    );
    expect(OPERATIONAL_TEAMS).toHaveLength(11);
    expect(CREW_UNIT_ROSTER).toHaveLength(8);
  });

  it("maps teamtest{n} to TEAM_LIST order with a /city/cumming/team/{teamId} home", () => {
    OPERATIONAL_TEAMS.forEach((team, i) => {
      const account = DEMO_ACCOUNTS.find(
        (a) => a.username === `teamtest${i + 1}`,
      );
      expect(account, `teamtest${i + 1} exists`).toBeDefined();
      expect(account?.role).toBe("team");
      expect(account?.teamId).toBe(team.id);
      expect(account?.home).toBe(`/city/cumming/team/${team.id}`);
      expect(account?.password).toBe("teamtest");
    });
  });

  it("maps crewtest{n} to DEFAULT_CREW_TYPES order with a /city/cumming/crew/{crewType} home", () => {
    DEFAULT_CREW_TYPES.forEach((type, i) => {
      const account = DEMO_ACCOUNTS.find(
        (a) => a.username === `crewtest${i + 1}`,
      );
      expect(account, `crewtest${i + 1} exists`).toBeDefined();
      expect(account?.role).toBe("crew");
      expect(account?.crewType).toBe(type.key);
      expect(account?.home).toBe(`/city/cumming/crew/${type.key}`);
      expect(account?.password).toBe("crewtest");
    });
  });

  it("maps each per-crew-unit username to its own instance-scoped portal home", () => {
    CREW_UNIT_ROSTER.forEach((c) => {
      const account = DEMO_ACCOUNTS.find((a) => a.username === c.username);
      expect(account, `${c.username} exists`).toBeDefined();
      expect(account?.role).toBe("crew");
      expect(account?.crewType).toBe(c.crewType);
      expect(account?.label).toBe(c.name);
      expect(account?.home).toBe(
        `/city/cumming/crew/${c.crewType}?crew=${encodeURIComponent(c.name)}`,
      );
      expect(account?.password).toBe("crewtest");
    });
  });

  it("routes the resident and admin personas to their surfaces", () => {
    expect(findDemoAccount("usertest")?.home).toBe("/user/pulse");
    expect(findDemoAccount("admintest")?.home).toBe("/city/cumming");
  });

  it("has no duplicate usernames", () => {
    const usernames = DEMO_ACCOUNTS.map((a) => a.username);
    expect(new Set(usernames).size).toBe(usernames.length);
  });
});

describe("authenticateDemo", () => {
  it("accepts a valid pair and is case-insensitive on the username", () => {
    expect(authenticateDemo("usertest", "usertest")?.role).toBe("user");
    expect(authenticateDemo("TeamTest1", "teamtest")?.teamId).toBe(
      OPERATIONAL_TEAMS[0].id,
    );
  });

  it("accepts a crew persona and resolves its crew type + portal home", () => {
    const account = authenticateDemo("crewtest1", "crewtest");
    expect(account?.role).toBe("crew");
    expect(account?.crewType).toBe("paving");
    expect(account?.home).toBe("/city/cumming/crew/paving");
  });

  it("accepts a per-crew-unit persona and resolves its instance-scoped portal home", () => {
    const account = authenticateDemo("northpaving", "crewtest");
    expect(account?.role).toBe("crew");
    expect(account?.crewType).toBe("paving");
    expect(account?.label).toBe("North Paving Crew");
    expect(account?.home).toBe(
      "/city/cumming/crew/paving?crew=North%20Paving%20Crew",
    );
  });

  it("rejects a wrong password or unknown username", () => {
    expect(authenticateDemo("usertest", "nope")).toBeNull();
    expect(authenticateDemo("ghost", "teamtest")).toBeNull();
  });
});

describe("isDemoStaffAccount", () => {
  it("treats admin, team, and crew personas as staff", () => {
    expect(isDemoStaffAccount(findDemoAccount("admintest"))).toBe(true);
    expect(isDemoStaffAccount(findDemoAccount("teamtest1"))).toBe(true);
    expect(isDemoStaffAccount(findDemoAccount("crewtest1"))).toBe(true);
  });

  it("never treats a Resident (or a missing account) as staff", () => {
    expect(isDemoStaffAccount(findDemoAccount("usertest"))).toBe(false);
    expect(isDemoStaffAccount(null)).toBe(false);
    expect(isDemoStaffAccount(findDemoAccount("ghost"))).toBe(false);
  });
});
