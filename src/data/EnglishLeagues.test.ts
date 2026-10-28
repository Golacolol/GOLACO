import { describe, expect, it } from "vitest";
import teamsJson from "../../public/data/teams.json";
import lineupsJson from "../../public/data/lineups.json";
import membershipsJson from "../../public/data/teamMemberships.json";
import playersJson from "../../public/data/players.json";
import { DEFAULT_ARGYLE_FORMATION, DEFAULT_ARGYLE_XI } from "./defaultArgyleXi";
import type { LineupRecord, PlayerRecord, TeamMembership, TeamRecord } from "./schema";

const teams = teamsJson as TeamRecord[];
const lineups = lineupsJson as LineupRecord[];
const memberships = membershipsJson as TeamMembership[];
const players = playersJson as PlayerRecord[];

describe("English league database", () => {
  it("lists every 2026/27 Premier League, Championship and League One club", () => {
    const count = (league: string) => teams.filter((t) => t.league === league && t.teamType === "CURRENT_TEAM").length;
    expect(count("PREMIER_LEAGUE")).toBe(20);
    expect(count("CHAMPIONSHIP")).toBe(24);
    expect(count("LEAGUE_ONE")).toBe(24);
  });

  it("gives each league club a named 18-player squad with unique shirt numbers and an XI", () => {
    const leagueTeams = teams.filter((t) => t.league && t.teamType === "CURRENT_TEAM");
    for (const team of leagueTeams) {
      if (team.id === "plymouth_argyle_current") continue;
      const squad = memberships.filter((m) => m.teamId === team.id && (m.to == null));
      expect(squad.length, team.id).toBeGreaterThanOrEqual(16);
      const numbers = squad.map((m) => m.shirtNumber);
      expect(new Set(numbers).size, team.id).toBe(numbers.length);
      const lineup = lineups.find((l) => l.teamId === team.id);
      expect(lineup, team.id).toBeTruthy();
      expect(lineup!.starters).toHaveLength(11);
      for (const slot of lineup!.starters) {
        expect(squad.some((m) => m.playerId === slot.playerId), `${team.id} ${slot.playerId}`).toBe(true);
        expect(players.some((p) => p.id === slot.playerId), slot.playerId).toBe(true);
      }
    }
  });

  it("keeps the supplied Argyle XI, numbers and 4-4-2-W formation", () => {
    const lineup = lineups.find((l) => l.id === "argyle_current_xi")!;
    expect(lineup.formation).toBe(DEFAULT_ARGYLE_FORMATION);
    for (const starter of DEFAULT_ARGYLE_XI) {
      const slot = lineup.starters.find((s) => s.playerId === starter.id);
      expect(slot?.slot).toBe(starter.slot);
      const rec = players.find((p) => p.id === starter.id);
      expect(rec?.displayName).toBe(starter.name);
      const mem = memberships.find((m) => m.playerId === starter.id && m.teamId === "plymouth_argyle_current");
      expect(mem?.shirtNumber).toBe(starter.shirtNumber);
    }
  });
});
