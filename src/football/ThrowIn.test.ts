import { describe, expect, it } from "vitest";
import { HALF_WIDTH } from "./constants";
import {
  TOUCHLINE_SAFE_MARGIN,
  throwInKickVector,
  throwInLanding,
  throwInMaxDistance,
  throwInReceiveSpot,
} from "./ThrowIn";

describe("throw-in delivery", () => {
  it("caps the strongest throws at about half the pitch width", () => {
    expect(throwInMaxDistance(1)).toBeLessThan(HALF_WIDTH * 0.5);
    expect(throwInMaxDistance(99)).toBeCloseTo(HALF_WIDTH, 5);
  });

  it("clamps a long aimed throw to the thrower's strength range", () => {
    const weak = throwInLanding(0, 34, 40, 0, 40, 1);
    const strong = throwInLanding(0, 34, 40, 0, 95, 1);
    expect(weak.dist).toBeLessThan(strong.dist);
    expect(strong.dist).toBeLessThanOrEqual(HALF_WIDTH + 0.01);
  });

  it("never lands a throw along the touchline", () => {
    const along = throwInLanding(0, HALF_WIDTH - 0.32, 12, HALF_WIDTH - 0.5, 80, 0.8);
    expect(Math.abs(along.z)).toBeLessThanOrEqual(HALF_WIDTH - TOUCHLINE_SAFE_MARGIN + 0.01);
    expect(Math.sign(along.z - (HALF_WIDTH - 0.32))).toBe(-1);
  });

  it("builds a faster kick for longer charged throws", () => {
    const soft = throwInKickVector(0, 34, 0, 20, 70, 0.1);
    const hard = throwInKickVector(0, 34, 0, 10, 90, 1);
    expect(Math.hypot(hard.vx, hard.vz)).toBeGreaterThan(Math.hypot(soft.vx, soft.vz));
    expect(soft.vy).toBeGreaterThanOrEqual(2.2);
    expect(hard.vy).toBeGreaterThan(soft.vy);
  });

  it("places the receive spot inside the touchline", () => {
    const spot = throwInReceiveSpot(10, HALF_WIDTH - 0.32, 1);
    expect(Math.abs(spot.z)).toBeLessThanOrEqual(HALF_WIDTH - TOUCHLINE_SAFE_MARGIN + 0.01);
  });
});
