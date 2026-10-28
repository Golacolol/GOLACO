import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Player } from "../players/Player";
import { hudFocusPlayers } from "./HudFocus";

const attrs: PlayerAttributes = {
  pace: 70, passing: 60, longPassing: 60, vision: 60, control: 60, dribbling: 60,
  shooting: 50, finishing: 50, shotPower: 55, longShots: 45, defending: 60, strength: 70, stamina: 80, composure: 70,
};

function make(id: string, x: number, z: number, side: "home" | "away", slot = "CM"): Player {
  const p = new Player({
    id, name: id, displayName: id, shirtNumber: 8, position: "CM", slot, side, attrs, overall: 70,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("HUD focus cards", () => {
  it("shows home then away on one line, with the on-ball player for that side", () => {
    const on = make("evans", 4, 0, "home", "RST");
    on.hasBall = true;
    const nearOpp = make("bar1", 7, 1, "away", "LCB");
    const farOpp = make("bar2", 30, 10, "away", "ST");
    const mate = make("white", -8, 4, "home", "LCM");
    const focus = hudFocusPlayers(on, [on, nearOpp, farOpp, mate], 4, 0, "home");
    expect(focus.home?.id).toBe("evans");
    expect(focus.away?.id).toBe("bar1");
  });

  it("falls back to the closest player on each side when the ball is loose", () => {
    const a = make("a", 2, 0, "home");
    const b = make("b", 12, 0, "away");
    const focus = hudFocusPlayers(null, [a, b], 3, 0, "home");
    expect(focus.home?.id).toBe("a");
    expect(focus.away?.id).toBe("b");
  });

  it("moves the home ring target when possession changes", () => {
    const on = make("evans", 4, 0, "home", "RST");
    on.hasBall = true;
    const mate = make("white", -8, 4, "home", "LCM");
    const opp = make("bar1", 7, 1, "away", "LCB");
    const withBall = hudFocusPlayers(on, [on, mate, opp], 4, 0, "home");
    expect(withBall.home?.id).toBe("evans");
    on.hasBall = false;
    const loose = hudFocusPlayers(null, [on, mate, opp], -8, 4, "home");
    expect(loose.home?.id).toBe("white");
  });
});
