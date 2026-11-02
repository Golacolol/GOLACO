import { describe, expect, it } from "vitest";
import { FORMATION_NAMES, USER_FORMATION } from "./Formation";
import {
  applyTacticsToLineup,
  lineupToTacticsSnapshot,
  mergeTeamTactics,
  normalizeFormationName,
  snapshotWorkingAsUser,
} from "./TeamTactics";
import type { LineupRecord } from "../../data/schema";

describe("TeamTactics", () => {
  it("exposes roughly double the original four base formations", () => {
    expect(FORMATION_NAMES.length).toBeGreaterThanOrEqual(8);
    for (const name of ["3-5-2", "5-3-2", "4-1-4-1", "4-5-1", "3-4-3"] as const) {
      expect(FORMATION_NAMES).toContain(name);
    }
  });

  it("normalizes unknown shapes and keeps USER out of formation names", () => {
    expect(normalizeFormationName("4-3-3")).toBe("4-3-3");
    expect(normalizeFormationName("nope")).toBe("4-2-3-1");
    expect(normalizeFormationName(USER_FORMATION)).toBe("4-2-3-1");
  });

  it("applies persisted tactics onto an authored lineup", () => {
    const lineup: LineupRecord = {
      id: "l1",
      teamId: "t1",
      formation: "4-4-2",
      starters: [
        { playerId: "a", slot: "GK" },
        { playerId: "b", slot: "ST" },
      ],
    };
    applyTacticsToLineup(lineup, {
      selection: USER_FORMATION,
      formation: "3-5-2",
      playStyle: "possession",
      starters: [
        { playerId: "a", slot: "GK", offsetX: 0.02 },
        { playerId: "c", slot: "CDM" },
      ],
      user: {
        formation: "3-5-2",
        playStyle: "possession",
        starters: [{ playerId: "a", slot: "GK", offsetX: 0.02 }],
      },
    });
    expect(lineup.formation).toBe("3-5-2");
    expect(lineup.playStyle).toBe("possession");
    expect(lineup.starters[0]?.offsetX).toBe(0.02);
    expect(lineup.starters[1]?.playerId).toBe("c");
  });

  it("snapshots working boards and merges retained USER customs", () => {
    const snap = snapshotWorkingAsUser({
      formation: "4-4-2-W",
      playStyle: "auto",
      starters: [{ playerId: "x", slot: "RCM", offsetZ: 0.05 }],
    });
    expect(snap.formation).toBe("4-4-2-W");
    expect(snap.playStyle).toBeNull();
    expect(snap.starters[0]?.offsetZ).toBe(0.05);

    const merged = mergeTeamTactics(
      {
        selection: "4-3-3",
        formation: "4-3-3",
        starters: [],
        user: snap,
      },
      {
        selection: "4-3-3",
        formation: "4-3-3",
        playStyle: "counter",
        starters: [{ playerId: "y", slot: "ST" }],
      },
    );
    expect(merged.playStyle).toBe("counter");
    expect(merged.user).toEqual(snap);

    const fromLineup = lineupToTacticsSnapshot(
      {
        id: "l",
        teamId: "t",
        formation: "5-3-2",
        playStyle: "direct",
        starters: [{ playerId: "z", slot: "CB" }],
      },
      USER_FORMATION,
    );
    expect(fromLineup.selection).toBe(USER_FORMATION);
    expect(fromLineup.formation).toBe("5-3-2");
  });
});
