import { describe, expect, it } from "vitest";
import { bestSupportSpot, scoreSupportSpot } from "./SupportSpotCalculator";
import type { Player } from "../players/Player";

function stubPlayer(partial: Partial<Player> & { id: string; x: number; z: number; side: "home" | "away" }): Player {
  return {
    attackSign: partial.side === "home" ? 1 : -1,
    isGK: false,
    attrs: { pace: 70, vision: 70 } as Player["attrs"],
    anchorX: partial.x,
    anchorZ: partial.z,
    ...partial,
  } as Player;
}

describe("SupportSpotCalculator", () => {
  it("scores progressive open pockets above clogged ones", () => {
    const carrier = stubPlayer({ id: "c", x: 0, z: 0, side: "home" });
    const open = scoreSupportSpot(carrier, 12, 6, [], { buildup: true });
    const clogged = scoreSupportSpot(
      carrier,
      12,
      6,
      [stubPlayer({ id: "d", x: 6, z: 3, side: "away" })],
      { buildup: true },
    );
    expect(open).toBeGreaterThan(clogged);
  });

  it("returns a best support spot ahead of the carrier", () => {
    const carrier = stubPlayer({ id: "c", x: -10, z: 0, side: "home" });
    const spot = bestSupportSpot(carrier, [], { buildup: true });
    expect(spot).not.toBeNull();
    expect((spot!.x - carrier.x) * carrier.attackSign).toBeGreaterThan(4);
  });
});
