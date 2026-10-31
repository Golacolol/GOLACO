import { describe, expect, it } from "vitest";
import {
  celebrateAI,
  celebrationStaysPut,
  celebrationTarget,
  CELEBRATION_ROUTINES,
  pickCelebrationRoutine,
} from "./CelebrationAI";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";

const attrs: PlayerAttributes = {
  pace: 70, passing: 70, longPassing: 70, vision: 70, control: 70, dribbling: 70,
  shooting: 70, finishing: 70, shotPower: 70, longShots: 70, defending: 50, strength: 70, stamina: 80, composure: 70,
};

function striker(): Player {
  const p = new Player({
    id: "st", name: "st", displayName: "st", shirtNumber: 9, position: "ST", slot: "RST",
    side: "home", attrs, overall: 78,
  });
  p.x = 48;
  p.z = 6;
  return p;
}

describe("goal celebration variety", () => {
  it("offers a range of routines with some that hold after a short jog", () => {
    expect(CELEBRATION_ROUTINES.length).toBeGreaterThanOrEqual(7);
    expect(pickCelebrationRoutine(() => 0)).toBe("corner");
    expect(celebrationStaysPut("point")).toBe(true);
    expect(celebrationStaysPut("group")).toBe(true);
    expect(celebrationStaysPut("corner")).toBe(false);
  });

  it("sends the scorer away from the spot in moving routines", () => {
    const st = striker();
    const corner = celebrationTarget(st, "corner");
    const crowd = celebrationTarget(st, "crowd");
    const slide = celebrationTarget(st, "slide");
    const byline = celebrationTarget(st, "byline");
    const channel = celebrationTarget(st, "channel");
    expect(corner.x).toBeGreaterThan(HALF_LENGTH - 3);
    expect(Math.abs(crowd.z)).toBeGreaterThan(HALF_WIDTH - 3);
    expect(Math.hypot(slide.x - st.x, slide.z - st.z)).toBeGreaterThan(5);
    expect(Math.abs(byline.x)).toBeGreaterThan(HALF_LENGTH - 4);
    expect(Math.hypot(channel.x - st.x, channel.z - st.z)).toBeGreaterThan(8);
  });

  it("has teammates follow the scorer's run", () => {
    const st = striker();
    const mate = new Player({
      id: "m", name: "m", displayName: "m", shirtNumber: 8, position: "CM", slot: "LCM",
      side: "home", attrs, overall: 70,
    });
    mate.x = 40;
    mate.z = 4;
    const routine = celebrateAI(st, [st, mate], () => 0.2);
    expect(CELEBRATION_ROUTINES).toContain(routine);
    expect(st.celebrating).toBe(true);
    expect(mate.celebrating).toBe(true);
    expect(Math.hypot(st.runTargetX - st.x, st.runTargetZ - st.z)).toBeGreaterThan(2);
  });
});
