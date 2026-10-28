import { describe, expect, it } from "vitest";
import { blockLineDepth, centreBackLineX, defensiveBlockFor } from "./DefensiveAI";
import type { Player } from "../players/Player";

function cb(x: number, side: "home" | "away" = "home"): Player {
  return {
    x,
    z: 0,
    anchorX: x,
    anchorZ: 0,
    slot: "CB",
    side,
    attackSign: side === "home" ? 1 : -1,
    ownGoalX: () => (side === "home" ? -52.5 : 52.5),
    attrs: { defensiveAwareness: 70, defending: 70 },
    isGK: false,
    celebrating: false,
  } as unknown as Player;
}

describe("defensive block", () => {
  it("pushes high when the ball is advanced and drops when protecting a late lead", () => {
    expect(defensiveBlockFor(20, -52.5, 1)).toBe("high");
    expect(defensiveBlockFor(-30, -52.5, 1, 1, 0.85)).toBe("low");
    expect(blockLineDepth("high")).toBeGreaterThan(blockLineDepth("low"));
  });

  it("pulls the CB line toward block depth", () => {
    const line = centreBackLineX([cb(-18), cb(-18)], 0, { blockDepth: 28 });
    const shallow = centreBackLineX([cb(-18), cb(-18)], 0, { blockDepth: 12 });
    expect(line).not.toBeNull();
    expect(shallow).not.toBeNull();
    expect(line!).toBeGreaterThan(shallow!);
  });
});
