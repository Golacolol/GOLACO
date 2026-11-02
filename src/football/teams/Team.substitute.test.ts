/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { SquadPlayer } from "../../core/Database";
import type { LineupRecord, PlayerRecord, TeamRecord } from "../../data/schema";
import { Team } from "./Team";

function makePlayer(id: string, pos: PlayerRecord["primaryPosition"], number: number): SquadPlayer {
  const player: PlayerRecord = {
    id,
    name: id,
    displayName: id,
    primaryPosition: pos,
    secondaryPositions: [],
    pace: 70,
    passing: 70,
    longPassing: 70,
    vision: 70,
    control: 70,
    dribbling: 70,
    shooting: 70,
    finishing: 70,
    shotPower: 70,
    longShots: 70,
    defending: 70,
    strength: 70,
    stamina: 70,
    composure: 70,
  };
  return {
    player,
    attrs: player,
    overall: 70,
    shirtNumber: number,
    membership: { playerId: id, teamId: "t", shirtNumber: number, squadRole: "FIRST_TEAM" },
  };
}

describe("Team.substitute", () => {
  it("does not return a substituted player to the bench", () => {
    const starters = [
      makePlayer("gk", "GK", 1),
      makePlayer("st", "ST", 9),
      ...Array.from({ length: 9 }, (_, i) => makePlayer(`p${i}`, "CM", 10 + i)),
    ];
    const benchPlayer = makePlayer("sub", "ST", 12);
    const roster = [...starters, benchPlayer];
    const record: TeamRecord = {
      id: "t",
      name: "Test",
      abbreviation: "TST",
      teamType: "CURRENT_TEAM",
      primaryColor: "#007A3D",
      secondaryColor: "#fff",
      defaultKit: { shirt: "#007A3D", shorts: "#fff", socks: "#007A3D" },
      goalkeeperKit: { shirt: "#1FAE5B", shorts: "#111", socks: "#1FAE5B" },
      defaultStadiumId: "home_park",
      defaultFormation: "4-4-2",
    };
    const lineup: LineupRecord = {
      id: "t_xi",
      teamId: "t",
      formation: "4-4-2",
      starters: starters.map((s, i) => ({
        playerId: s.player.id,
        slot: i === 0 ? "GK" : i === 1 ? "ST" : `CM${i}`,
      })),
    };
    const team = new Team(record, lineup, "home", starters, roster);
    expect(team.bench.some((s) => s.player.id === "sub")).toBe(true);

    const result = team.substitute("st", "sub");
    expect(result?.on.id).toBe("sub");
    expect(result?.off.id).toBe("st");
    expect(team.subbedOffIds.has("st")).toBe(true);
    expect(team.bench.some((s) => s.player.id === "st")).toBe(false);
    expect(team.availableRoster().some((s) => s.player.id === "st")).toBe(false);
    expect(team.substitute("sub", "st")).toBeNull();
  });
});
