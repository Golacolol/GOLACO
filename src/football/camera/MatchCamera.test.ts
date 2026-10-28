import { describe, expect, it } from "vitest";
import { computeCameraTarget, supportsViewZoom, ZOOMABLE_VIEWS } from "./MatchCamera";
import { FootballState } from "../FootballState";

describe("match camera tracking", () => {
  it("keeps the camera offset with play along the pitch, not parked at midfield", () => {
    const framed = computeCameraTarget(
      "MEDIUM",
      "PLAYER",
      { x: 42, z: 22, vx: 0 },
      { x: 40, z: 20, hasBall: true },
      FootballState.PLAYING,
    );
    expect(framed.lookX).toBeGreaterThan(30);
    expect(framed.lookZ).toBeGreaterThan(14);
    expect(framed.targetZ).toBeGreaterThan(framed.lookZ + 20);
    expect(framed.targetX).toBeGreaterThan(30);
  });

  it("follows the ball into the far corner in ball track mode", () => {
    const framed = computeCameraTarget("WIDE", "BALL", { x: -48, z: -30 }, null, FootballState.PLAYING);
    expect(framed.lookX).toBeCloseTo(-48);
    expect(framed.lookZ).toBeCloseTo(-30);
    expect(framed.targetZ).toBeCloseTo(22);
  });

  it("stays on the camera sideline so the near touchline is in front of the lens", () => {
    const framed = computeCameraTarget("CLOSE", "BALL", { x: 0, z: 32 }, { x: 0, z: 32, hasBall: true }, FootballState.PLAYING);
    expect(framed.targetZ).toBeGreaterThan(framed.lookZ);
    expect(framed.targetY).toBeGreaterThan(12);
  });

  it("frames a close bird's-eye view over the ball with no sideline offset", () => {
    const framed = computeCameraTarget("BIRD", "DYNAMIC", { x: 12, z: -8 }, { x: 40, z: 20, hasBall: true }, FootballState.PLAYING);
    expect(framed.targetX).toBeCloseTo(12);
    expect(framed.targetZ).toBeCloseTo(-8);
    expect(framed.lookX).toBeCloseTo(12);
    expect(framed.lookZ).toBeCloseTo(-8);
    expect(framed.targetZ).toBeCloseTo(framed.lookZ);
    expect(framed.targetY).toBeGreaterThan(30);
    expect(framed.targetY).toBeLessThan(80);
  });

  it("zooms the close bird's-eye view with birdZoom", () => {
    const base = computeCameraTarget("BIRD", "BALL", { x: 0, z: 0 }, null, FootballState.PLAYING, { birdZoom: 1 });
    const inClose = computeCameraTarget("BIRD", "BALL", { x: 0, z: 0 }, null, FootballState.PLAYING, { birdZoom: 1.8 });
    const outFar = computeCameraTarget("BIRD", "BALL", { x: 0, z: 0 }, null, FootballState.PLAYING, { birdZoom: 0.7 });
    expect(inClose.targetY).toBeLessThan(base.targetY);
    expect(outFar.targetY).toBeGreaterThan(base.targetY);
  });

  it("frames a far bird's-eye view over the whole pitch without following the ball", () => {
    const framed = computeCameraTarget("BIRD_FAR", "BALL", { x: 48, z: 22 }, null, FootballState.PLAYING);
    expect(framed.targetX).toBe(0);
    expect(framed.targetZ).toBe(0);
    expect(framed.lookX).toBe(0);
    expect(framed.lookZ).toBe(0);
    expect(framed.targetY).toBeGreaterThan(80);
  });

  it("does not yaw a bird's-eye camera for celebrations", () => {
    const framed = computeCameraTarget(
      "BIRD",
      "PLAYER",
      { x: 40, z: 20 },
      { x: 44, z: 24, facing: Math.PI / 4 },
      FootballState.GOAL_CELEBRATION,
    );
    expect(framed.targetX).toBeCloseTo(40);
    expect(framed.targetZ).toBeCloseTo(20);
    expect(framed.targetY).toBeGreaterThan(30);
  });

  it("follows a celebrating scorer from behind toward the corner", () => {
    const framed = computeCameraTarget(
      "MEDIUM",
      "PLAYER",
      { x: 40, z: 20 },
      { x: 44, z: 24, facing: Math.PI / 4 },
      FootballState.GOAL_CELEBRATION,
    );
    expect(framed.lookX).toBeGreaterThan(44);
    expect(framed.lookZ).toBeGreaterThan(24);
    expect(framed.targetX).toBeLessThan(44);
    expect(framed.targetY).toBeLessThan(12);
  });

  it("zooms CLOSE/MEDIUM/WIDE with viewZoom", () => {
    expect(ZOOMABLE_VIEWS).toEqual(["CLOSE", "MEDIUM", "WIDE"]);
    expect(supportsViewZoom("CLOSE")).toBe(true);
    expect(supportsViewZoom("MEDIUM")).toBe(true);
    expect(supportsViewZoom("WIDE")).toBe(true);
    expect(supportsViewZoom("BIRD")).toBe(true);
    expect(supportsViewZoom("PLAYER")).toBe(false);
    expect(supportsViewZoom("BIRD_FAR")).toBe(false);
    const base = computeCameraTarget("MEDIUM", "BALL", { x: 0, z: 0 }, null, FootballState.PLAYING, { viewZoom: 1 });
    const tight = computeCameraTarget("MEDIUM", "BALL", { x: 0, z: 0 }, null, FootballState.PLAYING, { viewZoom: 1.6 });
    expect(tight.targetY).toBeLessThan(base.targetY);
    expect(tight.targetZ - tight.lookZ).toBeLessThan(base.targetZ - base.lookZ);
  });

  it("places the player-perspective camera behind the focus looking level and forward", () => {
    const framed = computeCameraTarget(
      "PLAYER",
      "PLAYER",
      { x: 20, z: 0 },
      { x: 10, z: 0, facing: Math.PI / 2, hasBall: true },
      FootballState.PLAYING,
    );
    expect(framed.targetY).toBeGreaterThan(1.4);
    expect(framed.targetY).toBeLessThan(2.2);
    // Facing +X (sin(π/2)=1): camera sits behind (smaller x) looking forward at eye height.
    expect(framed.targetX).toBeLessThan(10);
    expect(framed.lookX).toBeGreaterThan(framed.targetX);
    expect(framed.lookY).toBeCloseTo(framed.targetY);
  });

  it("keeps player-view look height level when tracking the ball on the ground", () => {
    const framed = computeCameraTarget(
      "PLAYER",
      "BALL",
      { x: 30, z: 8 },
      { x: 10, z: 0, facing: Math.PI / 2, hasBall: false },
      FootballState.PLAYING,
    );
    expect(framed.lookY).toBeCloseTo(framed.targetY);
    expect(framed.lookY).toBeGreaterThan(1.4);
  });
});
