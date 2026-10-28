import { describe, expect, it } from "vitest";
import {
  ARGYLE_101_ABBREVIATION,
  ARGYLE_101_BENCH,
  ARGYLE_101_FORMATION,
  ARGYLE_101_LINEUP,
  ARGYLE_101_MEMBERSHIPS,
  ARGYLE_101_NAME,
  ARGYLE_101_PLAYERS,
  ARGYLE_101_XI,
} from "./argyle101";

describe("Argyle 101", () => {
  it("starts the named 4-4-2 eleven with the listed shirt numbers", () => {
    expect(ARGYLE_101_NAME).toBe("Plymouth Argyle 101");
    expect(ARGYLE_101_ABBREVIATION).toBe("101");
    expect(ARGYLE_101_LINEUP.formation).toBe(ARGYLE_101_FORMATION);
    expect(ARGYLE_101_XI).toHaveLength(11);
    const byShirt = new Map(ARGYLE_101_MEMBERSHIPS.map((m) => [m.shirtNumber, m.playerId]));
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(1))?.displayName).toBe("M. Cooper");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(17))?.displayName).toBe("B. Mumba");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(3))?.displayName).toBe("Gilesphey");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(6))?.displayName).toBe("D. Scarr");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(8))?.displayName).toBe("J. Edwards");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(19))?.displayName).toBe("M. Whittaker");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(18))?.displayName).toBe("F. Azaz");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(20))?.displayName).toBe("A. Randell");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(26))?.displayName).toBe("C. Wright");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(11))?.displayName).toBe("N. Ennis");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === byShirt.get(9))?.displayName).toBe("R. Hardie");
    expect(ARGYLE_101_LINEUP.starters.map((s) => s.playerId)).toEqual(ARGYLE_101_XI.map((s) => s.id));
  });

  it("keeps the nine named substitutes on unique shirts", () => {
    expect(ARGYLE_101_BENCH.map((b) => b.shirtNumber)).toEqual([10, 4, 16, 7, 5, 12, 23, 15, 25]);
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === "player_101_d_mayor")?.displayName).toBe("D. Mayor");
    expect(ARGYLE_101_PLAYERS.find((p) => p.id === "player_101_j_pleguezuelo")?.displayName).toBe("J. Pleguezuelo");
    const numbers = ARGYLE_101_MEMBERSHIPS.map((m) => m.shirtNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(ARGYLE_101_MEMBERSHIPS).toHaveLength(20);
  });
});
