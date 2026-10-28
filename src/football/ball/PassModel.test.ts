import { describe, expect, it } from "vitest";
import { computePassError, passKickVector, scorePassCandidate } from "./PassModel";
import { Ball } from "./Ball";
import { kickBall, stepBall } from "./BallPhysics";
import { aimOnGoal, aiShotAimIntent, computeShot } from "./ShotModel";

const attrs = {
  pace: 70,
  passing: 85,
  longPassing: 85,
  vision: 80,
  control: 78,
  dribbling: 74,
  shooting: 80,
  finishing: 85,
  shotPower: 75,
  longShots: 70,
  defending: 50,
  strength: 60,
  stamina: 80,
  composure: 80,
};

const weak = { ...attrs, passing: 55, longPassing: 50, finishing: 50, shooting: 52, composure: 50 };

describe("passing model", () => {
  it("scores analogue alignment higher than a nearer misaligned teammate", () => {
    const aligned = scorePassCandidate({ alignment: 0.95, distance: 22, laneClear: 0.8, tactical: 0.5, passType: "short" });
    const near = scorePassCandidate({ alignment: 0.2, distance: 8, laneClear: 0.8, tactical: 0.5, passType: "short" });
    expect(aligned.total).toBeGreaterThan(near.total);
  });

  it("increases error with distance for the same passer", () => {
    const ctx = { pressure: 0.2, bodyAlignment: 0.9, energy: 1, attrs, passType: "short" as const, hold01: 0.4 };
    const samples = (distance: number) =>
      Array.from({ length: 40 }, () => Math.abs(computePassError({ ...ctx, distance }).angleError)).reduce((a, b) => a + b, 0) / 40;
    expect(samples(32)).toBeGreaterThan(samples(8));
  });

  it("gives high long-passers lower typical error than weak ones", () => {
    const ctx = { distance: 30, pressure: 0.3, bodyAlignment: 0.85, energy: 0.9, passType: "long" as const, hold01: 0.7 };
    const good =
      Array.from({ length: 50 }, () => Math.abs(computePassError({ ...ctx, attrs }).angleError)).reduce((a, b) => a + b) / 50;
    const bad =
      Array.from({ length: 50 }, () => Math.abs(computePassError({ ...ctx, attrs: weak }).angleError)).reduce((a, b) => a + b) / 50;
    expect(good).toBeLessThan(bad);
  });

  it("carries a 16m short pass to the receiver instead of dying at the passer", () => {
    const ball = new Ball();
    ball.reset(0, 0);
    const kick = passKickVector(0, 0, 16, 0, "short");
    ball.y = 0.28;
    kickBall(ball, kick.vx, kick.vz, kick.vy);
    let closest = Infinity;
    for (let i = 0; i < 90; i++) {
      stepBall(ball, 1 / 60);
      closest = Math.min(closest, Math.hypot(ball.x - 16, ball.z));
    }
    expect(closest).toBeLessThan(3);
    expect(ball.x).toBeGreaterThan(12);
  });

  it("carries a 24m long pass into the landing area", () => {
    const ball = new Ball();
    ball.reset(0, 0);
    const kick = passKickVector(0, 0, 24, 0, "long");
    ball.y = 0.28;
    kickBall(ball, kick.vx, kick.vz, kick.vy);
    let closest = Infinity;
    for (let i = 0; i < 150; i++) {
      stepBall(ball, 1 / 60);
      closest = Math.min(closest, Math.hypot(ball.x - 24, ball.z));
    }
    expect(closest).toBeLessThan(5);
    expect(ball.x).toBeGreaterThan(18);
  });
});

describe("shooting model", () => {
  it("maps analogue aim onto the goal plane", () => {
    const leftUp = aimOnGoal(-1, 1);
    const rightDown = aimOnGoal(1, -1);
    expect(leftUp.x).toBeLessThan(0);
    expect(leftUp.y).toBeGreaterThan(rightDown.y);
    expect(rightDown.x).toBeGreaterThan(0);
  });

  it("aims AI shots toward a post away from the keeper with lift on long efforts", () => {
    const aim = aiShotAimIntent({
      shooterX: 20,
      shooterZ: 4,
      goalX: 52.5,
      gkZ: -1.5,
      longShot: true,
    });
    expect(aim.aimX).toBeGreaterThan(0);
    expect(aim.aimY).toBeGreaterThan(0.2);
    expect(aim.bodyAlignment).toBeGreaterThan(0.35);
  });

  it("keeps shot deviation bounded", () => {
    const shot = computeShot({
      distance: 18,
      pressure: 1,
      bodyAlignment: 0.2,
      energy: 0.4,
      attrs: weak,
      hold01: 1,
    });
    expect(Math.abs(shot.dx)).toBeLessThanOrEqual(2.4);
    expect(Math.abs(shot.dy)).toBeLessThanOrEqual(1.5);
  });

  it("overcharging a shot makes it wilder than a timed strike", () => {
    const ctx = { distance: 16, pressure: 0.2, bodyAlignment: 0.9, energy: 1, attrs, hold01: 0.5 };
    const timed = Array.from({ length: 30 }, () => Math.hypot(computeShot(ctx).dx, computeShot(ctx).dy)).reduce((a, b) => a + b) / 30;
    const wild = Array.from({ length: 30 }, () => {
      const s = computeShot({ ...ctx, hold01: 1, overcharged: true });
      return Math.hypot(s.dx, s.dy);
    }).reduce((a, b) => a + b) / 30;
    expect(wild).toBeGreaterThan(timed);
  });
});
