import { describe, expect, it } from "vitest";
import { applyOverride } from "../football/players/PlayerStats";
import type { TeamMembership } from "./schema";
import { cycleAttractOpponent, GameDatabase, isClassicMenuTeam } from "../core/Database";
import { SaveManager } from "../core/SaveManager";
import { clampMatchDuration, DEFAULT_MATCH_DURATION, MAX_MATCH_DURATION } from "../football/constants";

describe("membership model", () => {
  it("allows the same player id on multiple teams with different shirt numbers", () => {
    const a: TeamMembership = { playerId: "player_000007", teamId: "plymouth_argyle_current", shirtNumber: 8, squadRole: "FIRST_TEAM" };
    const b: TeamMembership = { playerId: "player_000007", teamId: "argyle_historic_sample", shirtNumber: 4, squadRole: "LEGEND", ratingOverride: { passing: 84 } };
    expect(a.playerId).toBe(b.playerId);
    expect(a.shirtNumber).not.toBe(b.shirtNumber);
    const overridden = applyOverride(
      { pace: 72, passing: 81, longPassing: 77, vision: 80, control: 78, dribbling: 74, shooting: 67, finishing: 65, shotPower: 72, longShots: 68, defending: 70, strength: 69, stamina: 82, composure: 77 },
      b.ratingOverride,
    );
    expect(overridden.passing).toBe(84);
    expect(overridden.pace).toBe(72);
  });
});

describe("attract fixture rotation", () => {
  it("cycles away from the home side and prefers the listed opponent first", () => {
    const ids = ["plymouth_argyle_current", "barnsley_current", "liverpool_current", "leeds_united_current"];
    expect(cycleAttractOpponent(ids, "plymouth_argyle_current", 0, "barnsley_current")).toBe("barnsley_current");
    expect(cycleAttractOpponent(ids, "plymouth_argyle_current", 1, "barnsley_current")).toBe("liverpool_current");
    expect(cycleAttractOpponent(ids, "plymouth_argyle_current", 2, "barnsley_current")).toBe("leeds_united_current");
    expect(cycleAttractOpponent(ids, "plymouth_argyle_current", 3, "barnsley_current")).toBe("barnsley_current");
  });
});

describe("classic next fixture", () => {
  it("pairs a Classic club with another Classic side instead of the league template away", async () => {
    const db = await GameDatabase.load(new SaveManager());
    const classicHome = [...db.teams.values()].find((t) => isClassicMenuTeam(t));
    expect(classicHome).toBeTruthy();
    const fixture = db.nextFixture(classicHome!.id, true);
    const awayId = fixture.homeTeamId === classicHome!.id ? fixture.awayTeamId : fixture.homeTeamId;
    expect(awayId).not.toBe("barnsley_current");
    expect(isClassicMenuTeam(db.getTeam(awayId))).toBe(true);
    expect(awayId).not.toBe(classicHome!.id);
    // Stable across repaints so the opposition dial does not flicker.
    expect(db.nextFixture(classicHome!.id, true).awayTeamId).toBe(fixture.awayTeamId);
  });
});

describe("match duration limits", () => {
  it("defaults to two 5-minute halves and allows up to 45 minutes", () => {
    expect(DEFAULT_MATCH_DURATION).toBe(600);
    expect(MAX_MATCH_DURATION).toBe(2700);
    expect(clampMatchDuration(45 * 60)).toBe(2700);
    expect(clampMatchDuration(10)).toBe(120);
  });
});
