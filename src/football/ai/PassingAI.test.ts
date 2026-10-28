import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Player } from "../players/Player";
import { Ball } from "../ball/Ball";
import {
  choosePassTarget,
  isAcrossOwnGoalBoxPass,
  isFlatCrossFieldPass,
  layoffOptionBonus,
  safePassDestination,
  supportDistanceScore,
} from "./PassingAI";
import { HALF_LENGTH } from "../constants";

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 50,
  finishing: 50,
  shotPower: 60,
  longShots: 50,
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
    position: slot.includes("GK") ? "GK" : "CM",
    slot,
    side,
    attrs,
    overall: 70,
  });
  p.x = x;
  p.z = z;
  p.facing = Math.PI / 2;
  return p;
}

describe("choosePassTarget", () => {
  it("never picks the goalkeeper, even for a long pass", () => {
    const passer = make("cb", -18, 0, "RCB");
    const keeper = make("gk", -50, 0, "GK");
    const striker = make("st", 8, 4, "LST");
    const ball = new Ball();
    const short = choosePassTarget(passer, [passer, keeper, striker], [], ball, 1, 0, "short");
    const long = choosePassTarget(passer, [passer, keeper, striker], [], ball, 1, 0, "long");
    expect(short?.id).toBe("st");
    expect(long?.id).toBe("st");
    expect(short?.isGK).toBeFalsy();
    expect(long?.isGK).toBeFalsy();
  });

  it("does not return the ball to the teammate it just came from", () => {
    const passer = make("cb", -8, 0, "RCB");
    const last = make("other-cb", -16, 8, "LCB");
    const mid = make("cm", 10, 2, "LCM");
    const ball = new Ball();
    const target = choosePassTarget(passer, [passer, last, mid], [], ball, 1, 0, "short", { forbidIds: ["other-cb"] });
    expect(target?.id).toBe("cm");
  });

  it("never picks a teammate behind the passer, including the keeper", () => {
    const passer = make("cb", -12, 0, "RCB");
    const keeper = make("gk", -50, 0, "GK");
    const otherCb = make("lcb", -20, 6, "LCB");
    const mid = make("cm", 6, -3, "LCM");
    const ball = new Ball();
    const target = choosePassTarget(passer, [passer, keeper, otherCb, mid], [], ball, 0, 0, "short");
    expect(target?.id).toBe("cm");
    expect(target && target.x < passer.x).toBe(false);
  });

  it("spreads from midfield to a wing or short lane rather than pumping a marked striker", () => {
    const passer = make("cm", 0, 0, "LCM");
    const st = make("st", 18, 0, "RST");
    const winger = make("rw", 12, 14, "RM");
    const short = make("cm2", 8, 3, "RCM");
    const marker = make("mk", 18.4, 0.2, "CB", "away");
    const ball = new Ball();
    const target = choosePassTarget(passer, [passer, st, winger, short], [marker], ball, 0, 0, "short");
    expect(target?.id).not.toBe("st");
    expect(["rw", "cm2"]).toContain(target?.id);
  });

  it("cycles away from the last receiver instead of ping-ponging", () => {
    const passer = make("cm1", 0, 0, "RCM");
    const last = make("cm2", 8, 4, "LCM");
    const other = make("cm3", 10, -8, "CAM");
    const ball = new Ball();
    const target = choosePassTarget(passer, [passer, last, other], [], ball, 1, 0, "short", { forbidIds: ["cm2"] });
    expect(target?.id).toBe("cm3");
  });

  it("prefers a progressive short option over a flat wide switch in build-up", () => {
    const passer = make("cm1", 0, 0, "RCM");
    const progressive = make("cm2", 10, 4, "LCM");
    const wide = make("rw", 3, 22, "RM");
    const ball = new Ball();
    expect(isFlatCrossFieldPass(passer, wide.x, wide.z)).toBe(true);
    const target = choosePassTarget(passer, [passer, progressive, wide], [], ball, 0, 0, "short", { style: "buildup" });
    expect(target?.id).toBe("cm2");
  });

  it("does not favour a flat opposite-wing recycle from a free wide midfielder", () => {
    const passer = make("rm", 12, 20, "RM");
    const opposite = make("lm", 10, -20, "LM");
    const ahead = make("st", 28, 8, "RST");
    const ball = new Ball();
    expect(isFlatCrossFieldPass(passer, opposite.x, opposite.z)).toBe(true);
    const target = choosePassTarget(passer, [passer, opposite, ahead], [], ball, 1, 0, "short", { style: "attack" });
    expect(target?.id).toBe("st");
  });

  it("rejects flat long switches across the pitch", () => {
    const passer = make("cb", -20, 12, "RCB");
    const across = make("lb", -18, -18, "LB");
    const ahead = make("cm", -2, 6, "RCM");
    const ball = new Ball();
    const target = choosePassTarget(passer, [passer, across, ahead], [], ball, 1, 0, "long", { style: "buildup" });
    expect(target?.id).not.toBe("lb");
    expect(target?.id).toBe("cm");
  });

  it("avoids squaring across the own goal box when a same-side outlet is on", () => {
    const passer = make("rb", -HALF_LENGTH + 12, 14, "RB");
    const across = make("lb", -HALF_LENGTH + 13, -14, "LB");
    const outlet = make("cb", -HALF_LENGTH + 22, 8, "RCB");
    const ball = new Ball();
    expect(isAcrossOwnGoalBoxPass(passer, across.x, across.z)).toBe(true);
    const target = choosePassTarget(passer, [passer, across, outlet], [], ball, 0, 0, "short", { style: "buildup" });
    expect(target?.id).toBe("cb");
  });

  it("never picks an offside striker for a through ball", () => {
    const passer = make("cm", 10, 0, "LCM");
    const offsideSt = make("st", 36, 2, "RST");
    const onsideCm = make("cm2", 16, 5, "RCM");
    const d1 = make("d1", 28, -2, "LCB", "away");
    const d2 = make("d2", 27, 3, "RCB", "away");
    const gk = make("gk", 48, 0, "GK", "away");
    const ball = new Ball();
    const target = choosePassTarget(
      passer,
      [passer, offsideSt, onsideCm],
      [d1, d2, gk],
      ball,
      1,
      0,
      "through",
      { style: "attack" },
    );
    expect(target?.id).not.toBe("st");
    expect(target?.id).toBe("cm2");
  });

  it("rewards striker layoffs into a nearby midfielder", () => {
    const st = make("st", 18, 0, "RST");
    const cm = make("cm", 12, 4, "LCM");
    expect(layoffOptionBonus(st, cm, 8, -4, 4)).toBeGreaterThan(0.4);
    expect(supportDistanceScore(14, true)).toBeGreaterThan(supportDistanceScore(28, true));
  });
});

describe("safePassDestination", () => {
  it("keeps a kick-off back-pass instead of forcing it forward", () => {
    const passer = make("st", 0, 0, "LST");
    const mates = [passer, make("cm", -12, 4, "LCM"), make("gk", -50, 0, "GK")];
    const kept = safePassDestination(passer, -12, 4, mates, { forceForward: true, allowBackward: true });
    expect(kept.x).toBeCloseTo(-12);
    expect(kept.z).toBeCloseTo(4);
    const forced = safePassDestination(passer, -12, 4, mates, { forceForward: true });
    expect(forced.x).toBeGreaterThan(passer.x);
  });
});
