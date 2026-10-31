import { describe, expect, it } from "vitest";
import { createFlickBall } from "./FlickBall";
import { applyFlickImpulse, createFigure, figureSpeed } from "./FlickFigure";
import { FLICK_PITCH } from "./FlickPitch";
import {
  everythingSettled,
  FLICK_REST_SPEED,
  stepFlickWorld,
  updateFigureLean,
} from "./FlickPhysics";

describe("FlickPhysics", () => {
  it("applies flick impulse opposite the pull-back", () => {
    const fig = createFigure("a", "home", "CM", 0, 0, false);
    // Pull south (−Z) → travel north (+Z)
    expect(applyFlickImpulse(fig, 0, -0.5)).toBe(true);
    expect(fig.vz).toBeGreaterThan(0);
    expect(Math.abs(fig.vx)).toBeLessThan(0.01);
  });

  it("rejects tiny pulls", () => {
    const fig = createFigure("a", "home", "CM", 0, 0, false);
    expect(applyFlickImpulse(fig, 0.01, 0.01)).toBe(false);
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
});
