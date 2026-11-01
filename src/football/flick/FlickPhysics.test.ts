import { describe, expect, it } from "vitest";
import { createFlickBall } from "./FlickBall";
import {
  applyFlickImpulse,
  createFigure,
  figureSpeed,
  FLICK_MAX_POWER,
  FLICK_POWER_SCALE,
  flickPowerFromPull,
} from "./FlickFigure";
import { FLICK_PITCH, halfLength } from "./FlickPitch";
import {
  collideFigureBall,
  estimateFlickCoastDistance,
  everythingSettled,
  FLICK_FIGURE_FRICTION,
  FLICK_REST_SPEED,
  stepFlickWorld,
  updateFigureLean,
} from "./FlickPhysics";

describe("FlickPhysics", () => {
  it("applies flick impulse opposite the pull-back", () => {
    const fig = createFigure("a", "home", "CM", 0, 0, false);
    // Pull south (−Z) → travel north (+Z); full-pitch min pull is ~0.55m
    expect(applyFlickImpulse(fig, 0, -4)).toBe(true);
    expect(fig.vz).toBeGreaterThan(0);
    expect(Math.abs(fig.vx)).toBeLessThan(0.01);
  });

  it("rejects tiny pulls", () => {
    const fig = createFigure("a", "home", "CM", 0, 0, false);
    expect(applyFlickImpulse(fig, 0.1, 0.1)).toBe(false);
    expect(figureSpeed(fig)).toBe(0);
  });

  it("snaps lean upright when settled — no wobble", () => {
    const fig = createFigure("a", "home", "CM", 0, 0, false);
    fig.vx = 4;
    fig.vz = 0;
    updateFigureLean(fig);
    expect(fig.settled).toBe(false);
    expect(Math.abs(fig.leanZ) + Math.abs(fig.leanX)).toBeGreaterThan(0);

    fig.vx = 0;
    fig.vz = 0;
    updateFigureLean(fig);
    expect(fig.settled).toBe(true);
    expect(fig.leanX).toBe(0);
    expect(fig.leanZ).toBe(0);
  });

  it("damps motion until the world settles", () => {
    const fig = createFigure("a", "home", "CM", 0, 0, false);
    fig.vx = 3;
    fig.vz = 1;
    fig.settled = false;
    const ball = createFlickBall(FLICK_PITCH);
    for (let i = 0; i < 240; i++) stepFlickWorld([fig], ball, 1 / 60, FLICK_PITCH);
    expect(figureSpeed(fig)).toBeLessThanOrEqual(FLICK_REST_SPEED);
    expect(everythingSettled([fig], ball)).toBe(true);
    expect(fig.leanX).toBe(0);
    expect(fig.leanZ).toBe(0);
  });

  it("max-power flick coasts at least a half-length on the REAL pitch", () => {
    const coast = estimateFlickCoastDistance(FLICK_MAX_POWER);
    expect(coast).toBeGreaterThanOrEqual(halfLength(FLICK_PITCH));
    // Pull that saturates the cap (~FLICK_MAX_POWER / scale).
    const pull = FLICK_MAX_POWER / FLICK_POWER_SCALE + 0.5;
    expect(flickPowerFromPull(-pull, 0)).toBe(FLICK_MAX_POWER);

    // Travel along +X (pitch length) so touchlines do not clip the coast.
    const startX = -halfLength(FLICK_PITCH) + 8;
    const fig = createFigure("a", "home", "CM", startX, 0, false);
    applyFlickImpulse(fig, -pull, 0);
    const ball = createFlickBall(FLICK_PITCH);
    ball.x = 0;
    ball.z = 30; // keep clear of the figure path
    for (let i = 0; i < 900; i++) stepFlickWorld([fig], ball, 1 / 60, FLICK_PITCH);
    const travelled = fig.x - startX;
    // Soft walls / rest cutoff leave a little short of analytic coast — still past half.
    expect(travelled).toBeGreaterThan(halfLength(FLICK_PITCH) * 0.92);
    expect(FLICK_FIGURE_FRICTION).toBeLessThan(2.2);
  });

  it("medium pull still covers a useful mid-range (~25m+)", () => {
    const power = flickPowerFromPull(0, -4);
    expect(estimateFlickCoastDistance(power)).toBeGreaterThan(25);
  });

  it("closing flick transfers most figure speed into the ball", () => {
    const fig = createFigure("a", "home", "ST", 0, 0, false);
    fig.vx = 40;
    fig.vz = 0;
    const ball = createFlickBall(FLICK_PITCH);
    ball.x = fig.radius + ball.radius - 0.05;
    ball.z = 0;
    ball.vx = 0;
    ball.vz = 0;
    expect(collideFigureBall(fig, ball)).toBe(true);
    expect(Math.hypot(ball.vx, ball.vz)).toBeGreaterThan(35);
  });

  it("fast flick still hits the full ball disc across a long frame (no tunneling)", () => {
    const fig = createFigure("a", "home", "ST", 0, 0, false);
    // 50ms hitch at near-max power: travel ≫ base+ball, so end-of-frame alone would miss.
    fig.vx = 118;
    fig.vz = 0;
    const ball = createFlickBall(FLICK_PITCH);
    ball.x = 2.5;
    ball.z = 0;
    ball.vx = 0;
    ball.vz = 0;
    const startDist = Math.hypot(ball.x - fig.x, ball.z - fig.z);
    expect(startDist).toBeGreaterThan(fig.radius + ball.radius);
    stepFlickWorld([fig], ball, 1 / 20, FLICK_PITCH);
    expect(Math.hypot(ball.vx, ball.vz)).toBeGreaterThan(40);
  });
});
