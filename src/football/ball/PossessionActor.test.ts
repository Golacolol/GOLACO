import { describe, expect, it } from "vitest";
import { Ball } from "./Ball";
import {
  PossessionActor,
  classifyContactZone,
  settleFirstTouch,
  strengthKickScale,
} from "./PossessionActor";

describe("PossessionActor", () => {
  it("allows only one resolving claim per frame, preferring higher priority", () => {
    const actor = new PossessionActor();
    actor.beginFrame();
    expect(actor.tryClaim("collect", "a")).toBe(true);
    expect(actor.tryClaim("disturb", "b")).toBe(false);
    expect(actor.tryClaim("kick", "c")).toBe(true);
    expect(actor.kind).toBe("kick");
    expect(actor.actor).toBe("c");
  });

  it("resets between frames", () => {
    const actor = new PossessionActor();
    actor.beginFrame();
    actor.tryClaim("kick", "a");
    actor.beginFrame();
    expect(actor.resolved).toBe(false);
    expect(actor.tryClaim("collect", "b")).toBe(true);
  });

  it("marks fast loose balls as busy", () => {
    const actor = new PossessionActor();
    const ball = new Ball();
    ball.vx = 14;
    ball.vz = 0;
    expect(actor.ballBusy(ball, null)).toBe(true);
    expect(actor.ballBusy(ball, "owner")).toBe(false);
  });
});

describe("settleFirstTouch", () => {
  it("damps flight and classifies air contact", () => {
    const ball = new Ball();
    ball.y = 2.1;
    ball.vx = 8;
    ball.vz = 2;
    ball.vy = 3;
    const zone = classifyContactZone(ball, true);
    expect(zone).toBe("air");
    const result = settleFirstTouch(ball, {
      control: 80,
      strength: 70,
      pressure: 0.2,
      energy: 1,
      aerial: true,
      rng: () => 0.5,
    });
    expect(result.zone).toBe("air");
    expect(result.lost).toBe(false);
    expect(Math.hypot(ball.vx, ball.vz)).toBeLessThan(8);
    expect(result.firstTouchTimer).toBeGreaterThan(0.1);
  });

  it("nearly kills residual speed on routine foot collects", () => {
    const ball = new Ball();
    ball.y = 0.22;
    ball.vx = 12;
    ball.vz = 3;
    ball.vy = 0.4;
    const result = settleFirstTouch(ball, {
      control: 78,
      strength: 70,
      pressure: 0.15,
      energy: 1,
      aerial: false,
      zone: "foot",
      rng: () => 0.5,
    });
    expect(result.zone).toBe("foot");
    expect(result.lost).toBe(false);
    expect(result.settle).toBeGreaterThanOrEqual(0.9);
    expect(Math.hypot(ball.vx, ball.vz)).toBeLessThan(1.2);
  });

  it("strength scales kick power", () => {
    expect(strengthKickScale(90)).toBeGreaterThan(strengthKickScale(40));
  });
});
