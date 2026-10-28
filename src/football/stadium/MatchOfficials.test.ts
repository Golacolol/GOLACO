import { describe, expect, it } from "vitest";
import { HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_LENGTH } from "../constants";
import {
  AR_FAR_Z,
  AR_NEAR_Z,
  AR_TOUCHLINE_OFFSET,
  REF_MAX_SPEED,
  assistantTargetX,
  chaseToward,
  isPassiveOfficialsPhase,
  refereeSetPieceTarget,
  refereeTarget,
} from "./MatchOfficials";

describe("match officials", () => {
  it("places assistants just outside each touchline", () => {
    expect(AR_TOUCHLINE_OFFSET).toBeGreaterThan(0.5);
    expect(AR_FAR_Z).toBeCloseTo(-(HALF_WIDTH + AR_TOUCHLINE_OFFSET));
    expect(AR_NEAR_Z).toBeCloseTo(HALF_WIDTH + AR_TOUCHLINE_OFFSET);
    expect(AR_NEAR_Z).toBeGreaterThan(HALF_WIDTH);
    expect(AR_FAR_Z).toBeLessThan(-HALF_WIDTH);
  });

  it("gives each assistant one half and keeps the referee off the ball corridor", () => {
    expect(assistantTargetX(30, true)).toBeGreaterThan(20);
    expect(assistantTargetX(30, false)).toBeLessThan(5);
    expect(assistantTargetX(-30, false)).toBeLessThan(-20);
    expect(assistantTargetX(-30, true)).toBeGreaterThan(-5);
    const aim = refereeTarget(20, 12);
    expect(aim.z).toBeLessThan(12 * 0.42);
    expect(Math.abs(aim.x - 20)).toBeGreaterThan(3);
  });

  it("holds a passive mark clear of the penalty spot on spot-kicks", () => {
    expect(isPassiveOfficialsPhase("penalty")).toBe(true);
    expect(isPassiveOfficialsPhase("spot")).toBe(true);
    expect(isPassiveOfficialsPhase("open")).toBe(false);
    const spotX = HALF_LENGTH - 11;
    const aim = refereeSetPieceTarget("penalty", spotX, 0);
    expect(Math.abs(aim.x - spotX)).toBeGreaterThan(6);
    expect(Math.abs(aim.z)).toBeGreaterThan(8);
    expect(aim.x).toBeLessThan(HALF_LENGTH - PENALTY_AREA_LENGTH + 1);
  });

  it("chases at a capped natural speed instead of snapping to the ball", () => {
    let x = 0;
    let z = 0;
    let vx = 0;
    let vz = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) {
      const next = chaseToward(x, z, vx, vz, 40, 0, dt, REF_MAX_SPEED, 14);
      x = next.x;
      z = next.z;
      vx = next.vx;
      vz = next.vz;
      expect(Math.hypot(vx, vz)).toBeLessThanOrEqual(REF_MAX_SPEED + 0.05);
    }
    // After one second at ref pace, still well short of a 40m teleport.
    expect(x).toBeGreaterThan(4);
    expect(x).toBeLessThan(REF_MAX_SPEED + 1.5);
  });
});
