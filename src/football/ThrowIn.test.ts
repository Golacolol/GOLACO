import { describe, expect, it } from "vitest";
import { HALF_WIDTH } from "./constants";
import { throwInKickVector, throwInLanding, throwInMaxDistance, throwInReceiveSpot } from "./ThrowIn";

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

  it("builds a faster kick for longer charged throws", () => {
    const soft = throwInKickVector(0, 34, 0, 20, 70, 0.1);
    const hard = throwInKickVector(0, 34, 0, 10, 90, 1);
    expect(Math.hypot(hard.vx, hard.vz)).toBeGreaterThan(Math.hypot(soft.vx, soft.vz));
    expect(soft.vy).toBeGreaterThanOrEqual(2.2);
    expect(hard.vy).toBeGreaterThan(soft.vy);
  });

  it("places the receive spot inside the touchline", () => {
    const spot = throwInReceiveSpot(10, HALF_WIDTH - 0.32, 1);
    expect(Math.abs(spot.z)).toBeLessThan(HALF_WIDTH);
  });
});
