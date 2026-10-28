import { describe, expect, it } from "vitest";
import { applyOverride, deriveOverall, resolveAttributes } from "./PlayerStats";
import type { PlayerRecord } from "../../data/schema";

const base = {
  pace: 70,
  passing: 81,
  longPassing: 77,
  vision: 80,
  control: 78,
  dribbling: 74,
  shooting: 67,
  finishing: 65,
  shotPower: 72,
  longShots: 68,
  defending: 70,
  strength: 69,
  stamina: 82,
  composure: 77,
} as const;

function player(pos: PlayerRecord["primaryPosition"]): PlayerRecord {
  return {
    id: "player_test",
    name: "Test",
    displayName: "T. Est",
    primaryPosition: pos,
    secondaryPositions: [],
    ...base,
  };
}

describe("player ratings", () => {
  it("uses different weights by position", () => {
    const attrs = resolveAttributes(player("CM"));
    const cm = deriveOverall("CM", attrs);
    const st = deriveOverall("ST", attrs);
    const cb = deriveOverall("CB", attrs);
    expect(cm).not.toBe(st);
    expect(cb).not.toBe(cm);
    expect(cm).toBeGreaterThan(70);
  });

  it("applies membership overrides without replacing identity", () => {
    const attrs = applyOverride(base, { passing: 90, overall: 88 });
    expect(attrs.passing).toBe(90);
    expect(attrs.pace).toBe(70);
    const resolved = resolveAttributes(player("CM"));
    expect(resolved.defensiveAwareness).toBe(resolved.defending);
    const over = applyOverride(base, { defending: 80, defensiveAwareness: 92 });
    expect(over.defensiveAwareness).toBe(92);
    expect(player("CM").id).toBe("player_test");
  });
});
