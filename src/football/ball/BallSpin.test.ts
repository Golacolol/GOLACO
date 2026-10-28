import { describe, expect, it } from "vitest";
import { Ball } from "./Ball";
import { kickBall, stepBall } from "./BallPhysics";

describe("ball spin", () => {
  it("applies sidespin bend while airborne", () => {
    const ball = new Ball();
    kickBall(ball, 18, 0, 4, { sidespin: 1.2, backspin: 0.4 });
    for (let i = 0; i < 45; i++) stepBall(ball, 1 / 60);
    expect(Math.abs(ball.z)).toBeGreaterThan(0.35);
  });

  it("clears spin on reset", () => {
    const ball = new Ball();
    ball.spinY = 1;
    ball.spinX = 0.5;
    ball.reset();
    expect(ball.spinY).toBe(0);
    expect(ball.spinX).toBe(0);
  });
});
