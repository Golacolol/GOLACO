import { describe, expect, it } from "vitest";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import { CENTRE_CIRCLE_RADIUS, HALF_LENGTH, HALF_WIDTH } from "../constants";
import { applyKickOffShape, celebrationCorner, chooseKickOffReceiver } from "./KickOff";
import { awareness01, closeDownRange, closeDownTarget, coverTarget, jockeyTarget, selectClosingPlayers } from "./DefensiveAI";
import { Ball } from "../ball/Ball";

const attrs = (over: Partial<PlayerAttributes> = {}): PlayerAttributes => ({
  pace: 70,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 70,
  finishing: 70,
  shotPower: 70,
  longShots: 70,
  defending: 70,
  strength: 70,
  stamina: 80,
  composure: 70,
  ...over,
});

function make(id: string, x: number, z: number, slot: string, side: "home" | "away" = "home", over?: Partial<PlayerAttributes>): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: slot.includes("ST") ? "ST" : slot.includes("CB") ? "CB" : "CM",
    slot,
    side,
    attrs: attrs(over),
    overall: 70,
  });
  p.x = x;
  p.z = z;
  p.anchorX = x;
  p.anchorZ = z;
  return p;
}

describe("kick-off shape", () => {
  it("puts the kicking strikers on the centre spot and keeps the rest outside the circle", () => {
    const players = [
      make("gk", -50, 0, "GK"),
      make("cb", -18, 4, "LCB"),
      make("cm", -8, 3, "LCM"),
      make("st1", 22, 2, "LST"),
      make("st2", 22, -2, "RST"),
    ];
    applyKickOffShape(players, true);
    const st1 = players.find((p) => p.id === "st1")!;
    const cm = players.find((p) => p.id === "cm")!;
    expect(Math.hypot(st1.x, st1.z)).toBeLessThan(0.2);
    expect(Math.hypot(cm.x, cm.z)).toBeGreaterThan(CENTRE_CIRCLE_RADIUS);
    expect(cm.x).toBeLessThan(-4);
  });

  it("opens to midfield or a winger instead of dumping the ball to a centre-back", () => {
    const kicker = make("st", 0, 0, "LST");
    const cm = make("cm", -10, 4, "LCM");
    const cb = make("cb", -22, 3, "LCB");
    const winger = make("lm", -8, 18, "LM");
    const picked = chooseKickOffReceiver(kicker, [kicker, cm, cb, winger], () => 0);
    expect(picked?.id).not.toBe("cb");
    expect(["cm", "lm"]).toContain(picked?.id);
    for (const rng of [0, 0.4, 0.9]) {
      expect(chooseKickOffReceiver(kicker, [kicker, cm, cb, winger], () => rng)?.id).not.toBe("cb");
    }
  });

  it("can pick the partner striker after kick-off shape", () => {
    const players = [
      make("gk", -50, 0, "GK"),
      make("cm", -10, 4, "LCM"),
      make("st1", 22, 2, "LST"),
      make("st2", 22, -2, "RST"),
    ];
    applyKickOffShape(players, true);
    const st1 = players.find((p) => p.id === "st1")!;
    const st2 = players.find((p) => p.id === "st2")!;
    expect(st1.distTo(st2.x, st2.z)).toBeGreaterThan(4.5);
    expect(st1.distTo(st2.x, st2.z)).toBeLessThan(8);
    const ids = [0, 0.35, 0.7, 0.95].map(
      (rng) => chooseKickOffReceiver(st1, players, () => rng)?.id,
    );
    expect(ids).toContain("st2");
  });
});

describe("goal celebration", () => {
  it("sends a home scorer to the nearest attacking corner flag", () => {
    const st = make("st", 48, 6, "RST");
    const corner = celebrationCorner(st);
    expect(corner.x).toBeGreaterThan(HALF_LENGTH - 3);
    expect(corner.z).toBeGreaterThan(HALF_WIDTH - 3);
  });
});

describe("defensive awareness", () => {
  it("closes down sooner and tighter as awareness rises", () => {
    const slow = make("slow", 0, 0, "LCB", "away", { defending: 40, defensiveAwareness: 32 });
    const sharp = make("sharp", 0, 0, "LCB", "away", { defending: 88, defensiveAwareness: 91 });
    expect(awareness01(sharp)).toBeGreaterThan(awareness01(slow));
    expect(closeDownRange(sharp)).toBeGreaterThan(closeDownRange(slow));
    const goalX = -52.5;
    const jSlow = jockeyTarget(slow, 10, 0, goalX);
    const jSharp = jockeyTarget(sharp, 10, 0, goalX);
    expect(Math.hypot(jSharp.x - 10, jSharp.z)).toBeLessThan(Math.hypot(jSlow.x - 10, jSlow.z));
    const coverSlow = coverTarget(slow, 18, 0);
    const coverSharp = coverTarget(sharp, 18, 0);
    expect(Math.abs(coverSharp.x - 18)).toBeLessThan(Math.abs(coverSlow.x - 18));
    const closeSlow = closeDownTarget(slow, 14, 2, goalX);
    const closeSharp = closeDownTarget(sharp, 14, 2, goalX);
    expect(Math.hypot(closeSharp.x - 14, closeSharp.z - 2)).toBeLessThan(Math.hypot(closeSlow.x - 14, closeSlow.z - 2));
  });

  it("picks high-awareness defenders to step across to the ball", () => {
    const ball = new Ball();
    ball.x = 8;
    ball.z = 0;
    const lazy = make("lazy", 2, 8, "RCM", "away", { defending: 38, defensiveAwareness: 30 });
    const hunter = make("hunt", 6, 7, "LCB", "away", { defending: 84, defensiveAwareness: 90 });
    const picked = selectClosingPlayers([lazy, hunter], ball, 1);
    expect(picked[0]?.id).toBe("hunt");
  });

  it("treats strikers as much weaker closers than centre-backs", () => {
    const ball = new Ball();
    ball.x = 10;
    ball.z = 0;
    const st = make("st", 8, 1, "RST", "away", { defending: 70, defensiveAwareness: 70 });
    const cb = make("cb", 9, 2, "LCB", "away", { defending: 70, defensiveAwareness: 70 });
    expect(awareness01(cb)).toBeGreaterThan(awareness01(st) * 1.5);
    const picked = selectClosingPlayers([st, cb], ball, 1);
    expect(picked[0]?.id).toBe("cb");
  });
});
