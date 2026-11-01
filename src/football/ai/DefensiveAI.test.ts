import { describe, expect, it } from "vitest";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import { centreBackLineX, coverTarget } from "./DefensiveAI";

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
  defending: 78,
  strength: 75,
  stamina: 80,
  composure: 70,
  defensiveAwareness: 80,
};

function make(id: string, x: number, z: number, slot: string, side: "home" | "away" = "home"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 5,
    position: slot.includes("ST") ? "ST" : slot.includes("CB") ? "CB" : "CM",
    slot,
    side,
    attrs,
    overall: 72,
  });
  p.x = x;
  p.z = z;
  p.anchorX = x;
  p.anchorZ = z;
  return p;
}

describe("defensive cover shape", () => {
  it("keeps centre-backs on a shared line depth", () => {
    const lcb = make("lcb", -18, -6, "LCB");
    const rcb = make("rcb", -10, 6, "RCB");
    const line = centreBackLineX([lcb, rcb], 8);
    expect(line).not.toBeNull();
    const marked = new Set<string>();
    const a = coverTarget(lcb, 8, 0, [], { teammates: [lcb, rcb], lineX: line, markedIds: marked });
    const b = coverTarget(rcb, 8, 0, [], { teammates: [lcb, rcb], lineX: line, markedIds: marked });
    // Without a shared line the anchors stay ~8m apart in X; line pull collapses that.
    expect(Math.abs(a.x - b.x)).toBeLessThan(Math.abs(lcb.anchorX - rcb.anchorX) - 1.5);
  });

  it("screens with a DM between ball and own goal", () => {
    const dm = make("dm", -12, 0, "DM");
    dm.anchorX = -16;
    dm.anchorZ = 0;
    const cover = coverTarget(dm, 5, 8, []);
    // Should sit goal-side of the ball, not drift all the way to it.
    expect(cover.x).toBeLessThan(5);
    expect(cover.x).toBeGreaterThan(dm.ownGoalX() + 6);
  });

  it("does not double-mark a runner already claimed", () => {
    const cb = make("cb", -6, 0, "CB");
    const runner = make("st", 4, 2, "ST", "away");
    runner.vx = 5;
    const marked = new Set<string>();
    coverTarget(cb, 0, 0, [runner], { markedIds: marked });
    expect(marked.has("st")).toBe(true);
    const other = make("cb2", -5, 4, "RCB");
    const before = marked.size;
    coverTarget(other, 0, 0, [runner], { markedIds: marked });
    expect(marked.size).toBe(before);
  });

  it("caps cover ball-magnet so the block does not fully collapse onto the ball", () => {
    const cm = make("cm", -8, 10, "LCM");
    cm.anchorX = -10;
    cm.anchorZ = 12;
    const cover = coverTarget(cm, 20, 0, []);
    // Still shifts toward the ball, but keeps a meaningful share of the channel anchor.
    expect(cover.z).toBeGreaterThan(5);
    expect(cover.x).toBeLessThan(8);
  });
});
