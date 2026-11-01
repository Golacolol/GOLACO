import { describe, expect, it } from "vitest";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import { Ball } from "./Ball";
import {
  facingDelta,
  groundContestWeight,
  overTurnLooseChance,
  resolveGroundDuel,
  tryDefenderDisturbance,
} from "./GroundContest";
import { stepDribble } from "./DribbleModel";

const base: PlayerAttributes = {
  pace: 70,
  passing: 70,
  longPassing: 65,
  vision: 65,
  control: 70,
  dribbling: 70,
  shooting: 60,
  finishing: 55,
  shotPower: 60,
  longShots: 55,
  defending: 60,
  tackling: 60,
  strength: 70,
  stamina: 80,
  composure: 70,
  reactions: 70,
  balance: 70,
};

function make(
  id: string,
  side: "home" | "away",
  x: number,
  z: number,
  attrs: Partial<PlayerAttributes> = {},
): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: "CM",
    slot: "CM",
    side,
    attrs: { ...base, ...attrs },
    overall: 70,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("ground contests", () => {
  it("lets the stronger closer player win same-side claims", () => {
    const ball = new Ball();
    const near = make("a", "home", 0.4, 0, { control: 88, reactions: 85 });
    const far = make("b", "home", 1.6, 0, { control: 50 });
    expect(groundContestWeight(near, ball)).toBeGreaterThan(groundContestWeight(far, ball));
    const duel = resolveGroundDuel([near, far], ball, () => 0.5);
    expect(duel?.winner.id).toBe("a");
    expect(duel?.contested).toBe(false);
  });

  it("rolls a contested duel when both sides reach the ball", () => {
    const ball = new Ball();
    const home = make("h", "home", 0.5, 0);
    const away = make("a", "away", -0.5, 0);
    const homeWin = resolveGroundDuel([home, away], ball, () => 0.1);
    const awayWin = resolveGroundDuel([home, away], ball, () => 0.9);
    expect(homeWin?.contested).toBe(true);
    expect(awayWin?.contested).toBe(true);
    expect(homeWin?.winner.side).toBe("home");
    expect(awayWin?.winner.side).toBe("away");
  });

  it("lets a designated pass outlet beat a closer opponent", () => {
    const ball = new Ball();
    const outlet = make("fb", "home", 1.2, 0, { control: 60, reactions: 55 });
    const attacker = make("st", "away", 0.4, 0, { control: 80, reactions: 80 });
    const duel = resolveGroundDuel([outlet, attacker], ball, () => 0.5, 1, {
      favorSide: "home",
      favorBonus: 0.55,
      favorPlayerId: "fb",
      favorPlayerBonus: 1.55,
    });
    expect(duel?.winner.id).toBe("fb");
  });

  it("defender poke changes ball velocity without magnet steal", () => {
    const ball = new Ball();
    ball.x = 1;
    ball.z = 0;
    ball.vx = 4;
    ball.vz = 0;
    const carrier = make("c", "home", 0.3, 0, { control: 55, dribbling: 50 });
    carrier.vx = 4;
    carrier.facing = Math.PI / 2;
    const def = make("d", "away", 1.05, 0.1, { tackling: 85, defending: 82, strength: 80 });
    def.vx = -2;
    const before = { vx: ball.vx, vz: ball.vz };
    const result = tryDefenderDisturbance(ball, carrier, [def], 1.3, () => 0.01);
    expect(result === "poke" || result === "loose").toBe(true);
    expect(Math.hypot(ball.vx - before.vx, ball.vz - before.vz)).toBeGreaterThan(0.8);
  });
});

describe("dribble retain / over-turn", () => {
  it("does not teleport the ball onto the feet at a touch", () => {
    const ball = new Ball();
    ball.x = 0.9;
    ball.z = 0.2;
    ball.vx = 3;
    ball.vz = 0.5;
    const player = make("p", "home", 0, 0, { control: 80, dribbling: 80 });
    player.facing = Math.PI / 2;
    player.prevFacing = player.facing;
    player.vx = 5;
    player.touchTimer = 0;
    const before = { x: ball.x, z: ball.z };
    stepDribble(ball, player, { pressure: 0.1, dt: 1 / 60, magnetMul: 0.45, rng: () => 0.5 });
    const aheadX = player.x + Math.sin(player.facing) * 1.0;
    expect(Math.hypot(ball.x - aheadX, ball.z - player.z)).toBeGreaterThan(0.15);
    expect(Math.hypot(ball.x - before.x, ball.z - before.z)).toBeLessThan(1.1);
  });

  it("can spill on a sharp high-speed turn", () => {
    const player = make("p", "home", 0, 0, { control: 45, dribbling: 40, balance: 40 });
    player.vx = 8;
    player.prevFacing = 0;
    player.facing = 1.6;
    const chance = overTurnLooseChance(player, Math.abs(facingDelta(0, 1.6)) / (1 / 60), 0.55, 1.2);
    expect(chance).toBeGreaterThan(0.08);
  });
});
