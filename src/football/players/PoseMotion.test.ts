import { describe, expect, it } from "vitest";
import {
  divePhase,
  diveRoll01,
  firstTouchCushion01,
  headerLean01,
  jumpLift01,
  jumpLiftMetres,
  kickPhase,
  kickPlant01,
  kickSwing01,
  slideFlat01,
  startDive,
  startJump,
  timerProgress,
} from "./PoseMotion";
import type { Player } from "./Player";

function stub(): Player {
  return {
    jumpTimer: 0,
    jumpDuration: 0,
    diveTimer: 0,
    diveDuration: 0,
    diveDirZ: 0,
  } as Player;
}

describe("PoseMotion", () => {
  it("keeps jump lift peak brief then lands", () => {
    expect(jumpLift01(0.4)).toBeGreaterThan(0.9);
    expect(jumpLift01(0.95)).toBeLessThan(0.25);
    expect(jumpLiftMetres(0.4, 0.8)).toBeLessThan(0.45);
  });

  it("does not re-extend an almost-finished jump into a long hang", () => {
    const p = stub();
    startJump(p, 0.26);
    p.jumpTimer = 0.05;
    startJump(p, 0.4);
    expect(p.jumpTimer).toBeLessThanOrEqual(0.26 * 0.85);
  });

  it("phases dive launch → stretch → land", () => {
    expect(divePhase(0.1)).toBe("launch");
    expect(divePhase(0.4)).toBe("stretch");
    expect(divePhase(0.85)).toBe("land");
    expect(diveRoll01(0.5)).toBeGreaterThan(diveRoll01(0.1));
  });

  it("flattens a slide then stands up on recover", () => {
    expect(slideFlat01(true, 0.1, 0)).toBeLessThan(0.5);
    expect(slideFlat01(true, 0.8, 0)).toBeGreaterThan(0.85);
    expect(slideFlat01(false, 1, 0.9)).toBeLessThan(0.35);
  });

  it("tracks timer progress and starts dives", () => {
    expect(timerProgress(0.25, 0.5)).toBeCloseTo(0.5);
    const gk = stub();
    startDive(gk, -1, 0.5);
    expect(gk.diveDirZ).toBe(-1);
    expect(gk.diveTimer).toBe(0.5);
    expect(gk.diveDuration).toBe(0.5);
  });

  it("does not re-extend an almost-finished dive into a long flop", () => {
    const gk = stub();
    startDive(gk, 1, 0.5);
    gk.diveTimer = 0.08;
    startDive(gk, 1, 0.58);
    expect(gk.diveTimer).toBeLessThanOrEqual(0.58 * 0.85);
  });

  it("phases kick windup → strike → follow with peaking plant", () => {
    expect(kickPhase(0.1)).toBe("windup");
    expect(kickPhase(0.4)).toBe("strike");
    expect(kickPhase(0.8)).toBe("follow");
    expect(kickPlant01(0.4)).toBeGreaterThan(kickPlant01(0.1));
    expect(kickSwing01(0.4)).toBeGreaterThan(kickSwing01(0.1));
  });

  it("cushions first touch then eases, and leans into header peak", () => {
    expect(firstTouchCushion01(0)).toBe(0);
    expect(firstTouchCushion01(0.18, 0.35)).toBeGreaterThan(0.4);
    expect(headerLean01(0.4)).toBeGreaterThan(headerLean01(0.1));
    expect(headerLean01(0.95)).toBeLessThan(0.2);
  });
});
