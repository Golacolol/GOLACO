import { describe, expect, it } from "vitest";
import { BALL_GRAVITY, BALL_RADIUS } from "../constants";
import { Ball } from "./Ball";
import { flightApexY, headerKick, kickBall, stepBall } from "./BallPhysics";
import { passKickVector } from "./PassModel";
import {
  aerialTimingScore,
  headerKickVector,
  isAerialBall,
  resolveAerialDuel,
  shouldHeaderContest,
} from "./AerialContest";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 60,
  longPassing: 60,
  vision: 60,
  control: 65,
  dribbling: 60,
  shooting: 55,
  finishing: 55,
  shotPower: 60,
  longShots: 50,
  defending: 50,
  strength: 75,
  stamina: 80,
  composure: 65,
  heading: 80,
  jumping: 78,
};

function make(id: string, x: number, z: number, heading = 80): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 9,
    position: "ST",
    slot: "ST",
    side: "home",
    attrs: { ...attrs, heading },
    overall: 72,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("ball flight physics", () => {
  it("lofts a cross above head height and keeps it aerial long enough to challenge", () => {
    const ball = new Ball();
    ball.reset(0, 0);
    const kick = passKickVector(0, 0, 28, 8, "cross");
    kickBall(ball, kick.vx, kick.vz, kick.vy);
    let maxY = ball.y;
    let aerialFrames = 0;
    for (let i = 0; i < 180; i++) {
      stepBall(ball, 1 / 60);
      maxY = Math.max(maxY, ball.y);
      if (ball.y > 1.4) aerialFrames += 1;
    }
    expect(maxY).toBeGreaterThan(3.2);
    expect(aerialFrames).toBeGreaterThan(45);
    const loft = new Ball();
    loft.y = 1;
    loft.vy = 8;
    expect(flightApexY(loft)).toBeGreaterThan(2.5);
  });

  it("bounces with residual energy then settles into a roll", () => {
    const ball = new Ball();
    ball.reset(0, 0);
    kickBall(ball, 8, 0, 6);
    let bounces = 0;
    let prevVy = ball.vy;
    for (let i = 0; i < 240; i++) {
      stepBall(ball, 1 / 60);
      if (prevVy < -0.5 && ball.vy > 0.2 && ball.y <= BALL_RADIUS + 0.05) bounces += 1;
      prevVy = ball.vy;
    }
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(ball.y).toBeLessThanOrEqual(BALL_RADIUS + 0.08);
    expect(Math.hypot(ball.vx, ball.vz)).toBeLessThan(6);
  });

  it("uses shared gravity constant for loft math", () => {
    expect(BALL_GRAVITY).toBeGreaterThan(12);
    expect(BALL_GRAVITY).toBeLessThan(18);
  });
});

describe("heading contests", () => {
  it("marks lofted balls as aerial and prefers headers when contested", () => {
    const ball = new Ball();
    ball.y = 1.9;
    ball.vy = -2;
    expect(isAerialBall(ball, false)).toBe(true);
    expect(
      shouldHeaderContest({
        ballY: 1.9,
        contested: true,
        heading: 0.6,
        control: 0.7,
        incomingAerial: true,
      }),
    ).toBe(true);
  });

  it("rewards timing on a descending ball at header height", () => {
    const p = make("h", 0, 0);
    const rising = new Ball();
    rising.y = 1.8;
    rising.vy = 4;
    const falling = new Ball();
    falling.y = 1.8;
    falling.vy = -3;
    expect(aerialTimingScore(p, falling)).toBeGreaterThan(aerialTimingScore(p, rising));
  });

  it("resolves a duel toward the stronger header", () => {
    const ball = new Ball();
    ball.x = 0;
    ball.z = 0;
    ball.y = 1.85;
    ball.vy = -2;
    const strong = make("strong", 0.3, 0, 92);
    const weak = make("weak", 0.4, 0.1, 35);
    weak.attrs.jumping = 40;
    let strongWins = 0;
    for (let i = 0; i < 40; i++) {
      const duel = resolveAerialDuel([strong, weak], ball);
      if (duel?.winner.id === "strong") strongWins += 1;
    }
    expect(strongWins).toBeGreaterThan(28);
  });

  it("produces a lofted clearance and a driven goal header", () => {
    const winner = make("w", 30, 0);
    const clear = headerKickVector(winner, "clear", 45, 8);
    const goal = headerKickVector(winner, "goal", 52, 0);
    expect(clear.lift).toBeGreaterThan(goal.lift);
    expect(goal.power).toBeGreaterThan(8);
    const ball = new Ball();
    ball.reset(30, 0);
    ball.y = 1.8;
    headerKick(ball, clear.vx, clear.vz, { power: clear.power, lift: clear.lift });
    expect(ball.vy).toBeGreaterThan(3);
    expect(ball.ownerId).toBeNull();
  });
});
