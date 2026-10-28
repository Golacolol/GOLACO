import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { HALF_LENGTH } from "../constants";
import { Player } from "../players/Player";
import { decideFreeKick } from "./FreeKickDecision";

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 72,
  finishing: 74,
  shotPower: 70,
  longShots: 68,
  defending: 50,
  strength: 70,
  stamina: 80,
  composure: 72,
  setPieces: 78,
};

function make(id: string, x: number, z: number, side: "home" | "away" = "home"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 10,
    position: "CM",
    slot: "CM",
    side,
    attrs,
    overall: 74,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("decideFreeKick", () => {
  it("prefers a shot near the box instead of passing back", () => {
    const taker = make("t", HALF_LENGTH - 20, 3);
    const d = decideFreeKick({
      taker,
      ballX: taker.x,
      ballZ: taker.z,
      teammates: [taker, make("m", HALF_LENGTH - 28, -8)],
      opponents: [make("d", HALF_LENGTH - 12, 0, "away")],
    });
    expect(d.nearBox).toBe(true);
    expect(d.action).toBe("SHOT");
    expect(d.shotScore).toBeGreaterThan(d.passScore + 0.2);
  });

  it("still allows a delivery from a wide angle", () => {
    const taker = make("t", HALF_LENGTH - 22, 24);
    const box = make("st", HALF_LENGTH - 10, 2);
    const d = decideFreeKick({
      taker,
      ballX: taker.x,
      ballZ: taker.z,
      teammates: [taker, box],
      opponents: [],
    });
    expect(d.action === "CROSS" || d.action === "PASS" || d.action === "SHOT").toBe(true);
    expect(d.crossScore).toBeGreaterThan(0.2);
  });

  it("recycles from deep in own half", () => {
    const taker = make("t", -HALF_LENGTH + 18, 6);
    const d = decideFreeKick({
      taker,
      ballX: taker.x,
      ballZ: taker.z,
      teammates: [taker],
      opponents: [],
    });
    expect(d.action).toBe("PASS");
    expect(d.shotScore).toBe(0);
  });
});
