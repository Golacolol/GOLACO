import { describe, expect, it } from "vitest";
import {
  bodyAlignment,
  firstTouchKickScale,
  idealPassHold01,
  kickCommitReady,
  receiveApproachAlignment,
} from "./BodyMechanics";

describe("BodyMechanics", () => {
  it("scores hips square to the kick as high alignment", () => {
    // Facing +Z, kick +Z → 1
    expect(bodyAlignment(0, 0, 1)).toBeGreaterThan(0.98);
    // Facing +Z, kick −Z → near 0
    expect(bodyAlignment(0, 0, -1)).toBeLessThan(0.05);
  });

  it("blocks kicks during the first-touch plant", () => {
    expect(kickCommitReady(0.25, 0, 0.1)).toBe(false);
    expect(kickCommitReady(0.05, 0, 0.1)).toBe(true);
    expect(kickCommitReady(0, 0.2, 0.1)).toBe(false);
  });

  it("scales kick quality down while settling", () => {
    expect(firstTouchKickScale(0)).toBe(1);
    expect(firstTouchKickScale(0.4)).toBeLessThan(firstTouchKickScale(0.12));
  });

  it("shortens pass hold under pressure", () => {
    const calm = idealPassHold01("short", 16, { pressure: 0.1, composure: 80, tempo: 1 });
    const rushed = idealPassHold01("short", 16, { pressure: 0.85, composure: 50, tempo: 1.15 });
    expect(rushed).toBeLessThan(calm);
  });

  it("rewards facing into an incoming pass", () => {
    // Ball coming from +Z, face −Z (into it)
    const good = receiveApproachAlignment(Math.PI, 0, 8);
    const bad = receiveApproachAlignment(0, 0, 8);
    expect(good).toBeGreaterThan(bad);
  });
});
