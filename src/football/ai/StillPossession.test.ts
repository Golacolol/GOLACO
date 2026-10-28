import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Player } from "../players/Player";
import { closestOpposingPlayer, STILL_POSSESSION_STEAL_SECONDS, tickStillPossession } from "./StillPossession";

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 60,
  longPassing: 60,
  vision: 60,
  control: 60,
  dribbling: 60,
  shooting: 50,
  finishing: 50,
  shotPower: 55,
  longShots: 45,
  defending: 60,
  strength: 70,
  stamina: 80,
  composure: 70,
};

function make(id: string, x: number, z: number, slot = "CM", side: "home" | "away" = "home"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: slot === "GK" ? "GK" : "CM",
    slot,
    side,
    attrs,
    overall: 70,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("still possession steal", () => {
  it("hands the ball to a close opponent after five still seconds under pressure", () => {
    const holder = make("cb", 0, 0, "RCB");
    const near = make("st", 2.2, 0.4, "LST", "away");
    const far = make("w", 30, 20, "LM", "away");
    expect(closestOpposingPlayer(holder, [far, near])?.id).toBe("st");

    holder.vx = 3;
    const reset = tickStillPossession({
      holder,
      opponents: [near],
      dt: 1,
      prevStill: 4.9,
      playing: true,
    });
    expect(reset.stillTime).toBe(0);
    expect(reset.steal).toBeNull();
    holder.vx = 0;

    const almost = tickStillPossession({
      holder,
      opponents: [near, far],
      dt: 0.2,
      prevStill: STILL_POSSESSION_STEAL_SECONDS - 0.5,
      playing: true,
    });
    expect(almost.steal).toBeNull();
    expect(almost.stillTime).toBeLessThan(STILL_POSSESSION_STEAL_SECONDS);

    const stolen = tickStillPossession({
      holder,
      opponents: [near, far],
      dt: 0.3,
      prevStill: STILL_POSSESSION_STEAL_SECONDS - 0.2,
      playing: true,
    });
    expect(stolen.steal?.id).toBe("st");
  });

  it("does not gift the ball when no opponent is applying pressure", () => {
    const holder = make("cb", 0, 0, "RCB");
    const far = make("w", 30, 20, "LM", "away");
    const idle = tickStillPossession({
      holder,
      opponents: [far],
      dt: 1,
      prevStill: STILL_POSSESSION_STEAL_SECONDS + 1,
      playing: true,
    });
    expect(idle.steal).toBeNull();
    expect(idle.stillTime).toBeGreaterThan(0);
  });

  it("does not steal from a goalkeeper or during restarts", () => {
    const gk = make("gk", -50, 0, "GK");
    const opp = make("st", -40, 0, "LST", "away");
    const fromGk = tickStillPossession({ holder: gk, opponents: [opp], dt: 6, prevStill: 6, playing: true });
    expect(fromGk.steal).toBeNull();
    const paused = tickStillPossession({
      holder: make("cb", 0, 0, "RCB"),
      opponents: [opp],
      dt: 6,
      prevStill: 6,
      playing: false,
    });
    expect(paused.steal).toBeNull();
  });
});
