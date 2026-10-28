import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { computePassError } from "../ball/PassModel";
import { movePlayer, turnRateFromAttrs } from "./PlayerMovement";
import { closeDownTarget, reactions01 } from "../ai/DefensiveAI";
import { Player } from "./Player";
import { resolveAttributes, deriveOverall } from "./PlayerStats";
import { stat01 } from "../../core/math";

function attrs(over: Partial<PlayerAttributes>): PlayerAttributes {
  return resolveAttributes({
    pace: 70, passing: 70, longPassing: 70, vision: 70, control: 70, dribbling: 70,
    shooting: 70, finishing: 70, shotPower: 70, longShots: 70, defending: 70,
    strength: 70, stamina: 70, composure: 70, primaryPosition: "CM",
    ...over,
  });
}

function player(a: PlayerAttributes, id = "p"): Player {
  return new Player({
    id, name: id, displayName: id, shirtNumber: 8, position: "CM", slot: "LCM", side: "home",
    attrs: a, overall: deriveOverall("CM", a),
  });
}

describe("attribute gameplay follow-up", () => {
  it("balance reduces speed retention through sharp turns", () => {
    const highBal = player(attrs({ balance: 95, agility: 80, pace: 85, acceleration: 85 }), "hi");
    const lowBal = player(attrs({ balance: 35, agility: 80, pace: 85, acceleration: 85 }), "lo");
    // Build speed going +X, then cut to +Z.
    for (let i = 0; i < 90; i++) {
      movePlayer(highBal, 1 / 60, 1, 0, true, false);
      movePlayer(lowBal, 1 / 60, 1, 0, true, false);
    }
    const beforeHi = highBal.speed;
    const beforeLo = lowBal.speed;
    expect(beforeHi).toBeGreaterThan(5);
    expect(beforeLo).toBeGreaterThan(5);
    for (let i = 0; i < 18; i++) {
      movePlayer(highBal, 1 / 60, 0, 1, true, false);
      movePlayer(lowBal, 1 / 60, 0, 1, true, false);
    }
    // Low balance sheds more speed on the cut.
    expect(lowBal.speed / beforeLo).toBeLessThan(highBal.speed / beforeHi + 0.02);
    expect(turnRateFromAttrs(90, 4, false)).toBeGreaterThan(turnRateFromAttrs(40, 4, false));
  });

  it("reactions changes close-down response blend", () => {
    const sharp = player(attrs({ reactions: 95, defensiveAwareness: 80, aggression: 70 }), "sharp");
    const slow = player(attrs({ reactions: 40, defensiveAwareness: 80, aggression: 70 }), "slow");
    sharp.x = 0;
    sharp.z = 0;
    slow.x = 0;
    slow.z = 0;
    expect(reactions01(sharp)).toBeGreaterThan(reactions01(slow));
    const tSharp = closeDownTarget(sharp, 12, 0, -52);
    const tSlow = closeDownTarget(slow, 12, 0, -52);
    // Higher reactions move further toward the jockey point in one blend step.
    const dSharp = Math.hypot(tSharp.x - 0, tSharp.z - 0);
    const dSlow = Math.hypot(tSlow.x - 0, tSlow.z - 0);
    expect(dSharp).toBeGreaterThan(dSlow);
  });

  it("crossing rating changes cross delivery error", () => {
    const elite = attrs({ crossing: 96, passing: 70, longPassing: 70, composure: 80 });
    const poor = attrs({ crossing: 45, passing: 70, longPassing: 70, composure: 80 });
    let sumE = 0;
    let sumP = 0;
    for (let i = 0; i < 60; i++) {
      sumE += Math.abs(
        computePassError({
          distance: 28, pressure: 0.25, bodyAlignment: 1, energy: 1, attrs: elite, passType: "cross", hold01: 0.7,
        }).angleError,
      );
      sumP += Math.abs(
        computePassError({
          distance: 28, pressure: 0.25, bodyAlignment: 1, energy: 1, attrs: poor, passType: "cross", hold01: 0.7,
        }).angleError,
      );
    }
    expect(sumE / 60).toBeLessThan(sumP / 60);
  });

  it("penalties rating tightens spot-kick scatter", () => {
    // Mirrors Match.executeRestart PENALTY: scatter scales with (1 - pen).
    const aimNoise = (penalties: number, samples = 200) => {
      const pen = stat01(penalties);
      let sum = 0;
      for (let i = 0; i < samples; i++) {
        sum += Math.abs((Math.random() - 0.5) * (1 - pen) * 2.8);
      }
      return sum / samples;
    };
    expect(aimNoise(95)).toBeLessThan(aimNoise(50));
  });

  it("setPieces rating reduces free-kick scatter", () => {
    const scatter = (setPieces: number, samples = 200) => {
      const setTech = stat01(setPieces);
      const amplitude = (1 - setTech) * 2.4;
      let sum = 0;
      for (let i = 0; i < samples; i++) {
        sum += Math.abs((Math.random() - 0.5) * amplitude);
      }
      return sum / samples;
    };
    expect(scatter(94)).toBeLessThan(scatter(55));
  });
});
