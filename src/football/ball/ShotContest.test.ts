import { describe, expect, it } from "vitest";
import { Ball } from "./Ball";
import { blockCornerBias, crowdRicochetChance, ricochetOffDefender } from "./ShotContest";
import { computeShot } from "./ShotModel";
import type { PlayerAttributes } from "../../data/schema";
import { Player } from "../players/Player";
import { resolveAttributes, deriveOverall } from "../players/PlayerStats";

const striker: PlayerAttributes = {
  pace: 80, passing: 62, longPassing: 58, vision: 64, control: 72, dribbling: 74,
  shooting: 82, finishing: 84, shotPower: 86, longShots: 70, defending: 32, strength: 70, stamina: 80, composure: 74,
};

const weak: PlayerAttributes = {
  ...striker, shooting: 48, finishing: 46, shotPower: 50, longShots: 40, composure: 50,
};

describe("shot contest", () => {
  it("gives a real chance of ricochet when defenders swarm", () => {
    expect(crowdRicochetChance(0, 0.2)).toBe(0);
    expect(crowdRicochetChance(2, 0.6)).toBeGreaterThan(0.4);
    expect(crowdRicochetChance(3, 0.8)).toBeGreaterThan(crowdRicochetChance(1, 0.2));
  });

  it("raises block chance and corner bias for stronger shots", () => {
    expect(crowdRicochetChance(1, 0.4, 34)).toBeGreaterThan(crowdRicochetChance(1, 0.4, 18));
    expect(blockCornerBias(36)).toBeGreaterThan(blockCornerBias(20));
    expect(blockCornerBias(30)).toBeGreaterThan(0.55);
  });

  it("often deflects strong home shots toward the attacking byline", () => {
    const attrs = resolveAttributes({ ...striker, primaryPosition: "CB" });
    const defender = new Player({
      id: "d1",
      name: "D",
      displayName: "D",
      shirtNumber: 5,
      position: "CB",
      slot: "LCB",
      side: "away",
      attrs,
      overall: deriveOverall("CB", attrs),
    });
    defender.x = 40;
    defender.z = 2;
    let towardGoal = 0;
    for (let i = 0; i < 80; i++) {
      const ball = new Ball();
      ball.vx = 28;
      ball.vz = 1;
      ricochetOffDefender(ball, defender, "home", { power: 34 });
      if (ball.vx > 0) towardGoal += 1;
    }
    expect(towardGoal).toBeGreaterThan(40);
  });
});

describe("striker shot power", () => {
  it("hits the ball harder than a weak effort from the same range", () => {
    const ctx = { distance: 14, pressure: 0.25, bodyAlignment: 0.85, energy: 1, hold01: 0.65, shotKind: "close" as const };
    const strong = computeShot({ ...ctx, attrs: striker }).power;
    const soft = computeShot({ ...ctx, attrs: weak }).power;
    expect(strong).toBeGreaterThan(soft);
    expect(strong).toBeGreaterThan(28);
  });
});
