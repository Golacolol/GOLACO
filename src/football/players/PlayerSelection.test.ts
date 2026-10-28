import { describe, expect, it } from "vitest";
import { Player } from "./Player";
import type { PlayerAttributes } from "../../data/schema";
import { autoSelectPlayer } from "./PlayerSelection";

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 60,
  longPassing: 60,
  vision: 60,
  control: 65,
  dribbling: 55,
  shooting: 40,
  finishing: 40,
  shotPower: 55,
  longShots: 40,
  defending: 70,
  strength: 70,
  stamina: 80,
  composure: 70,
  heading: 50,
  jumping: 50,
  defensiveAwareness: 75,
};

function make(
  id: string,
  x: number,
  z: number,
  slot: string,
  extra?: Partial<PlayerAttributes>,
): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 6,
    position: slot.includes("ST") ? "ST" : slot.includes("CB") ? "CB" : "CM",
    slot,
    side: "home",
    attrs: { ...attrs, ...extra },
    overall: 70,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("autoSelectPlayer", () => {
  it("prefers a goal-side centre-back over a nearer attacker when defending", () => {
    const st = make("st", 2, 0, "ST");
    const cb = make("cb", -8, 1, "CB");
    // Ball near the striker; CB is goal-side of the threat.
    const pick = autoSelectPlayer([st, cb], "home", 4, 0, true, { possessingSide: "away" });
    expect(pick.id).toBe("cb");
  });

  it("leans to the better aerial contestant on lofted balls", () => {
    // Same role/distance — only aerial tools differ.
    const short = make("short", 2, 0, "CB", { heading: 35, jumping: 30 });
    const tall = new Player({
      id: "tall",
      name: "tall",
      displayName: "tall",
      shirtNumber: 5,
      position: "CB",
      slot: "CB",
      side: "home",
      attrs: { ...attrs, heading: 92, jumping: 94 },
      overall: 70,
      appearance: { heightScale: 1.16 },
    });
    tall.x = 2;
    tall.z = 0.2;
    const pick = autoSelectPlayer([short, tall], "home", 0, 0, true, {
      possessingSide: "away",
      aerial: true,
    });
    expect(pick.id).toBe("tall");
  });
});
