import { describe, expect, it } from "vitest";
import { ballThreatensGoal, FLICK_PITCH, halfLength } from "./FlickPitch";
import { applyFlickImpulse, kickoffFormation } from "./FlickFigure";
import { checkFlickGoal, createFlickBall } from "./FlickBall";
import { decideFlickAI } from "./FlickAI";
import { normalizeFlickConfig } from "./FlickSetup";

describe("FlickMatch rules helpers", () => {
  it("normalizes flick config", () => {
    const c = normalizeFlickConfig({ firstTo: 99, opponent: "HUMAN" });
    expect(c.firstTo).toBe(21);
    expect(c.opponent).toBe("HUMAN");
    expect(c.humanSide).toBe("home");
  });

  it("detects ball threat in the defending box for GK window", () => {
    const hl = halfLength(FLICK_PITCH);
    expect(ballThreatensGoal(-hl + 0.8, 0, "home", FLICK_PITCH)).toBe(true);
    expect(ballThreatensGoal(0, 0, "home", FLICK_PITCH)).toBe(false);
    expect(ballThreatensGoal(hl - 0.6, 0.2, "away", FLICK_PITCH)).toBe(true);
  });

  it("scores when the ball fully crosses the goal line in the mouth", () => {
    const ball = createFlickBall(FLICK_PITCH);
    const hl = halfLength(FLICK_PITCH);
    ball.x = hl + ball.radius + 0.02;
    ball.z = 0;
    expect(checkFlickGoal(ball, FLICK_PITCH)).toBe("home");
    ball.x = -(hl + ball.radius + 0.02);
    expect(checkFlickGoal(ball, FLICK_PITCH)).toBe("away");
    ball.x = hl + ball.radius + 0.02;
    ball.z = FLICK_PITCH.goalWidth;
    expect(checkFlickGoal(ball, FLICK_PITCH)).toBeNull();
  });

  it("AI picks an away outfield figure and pulls opposite travel", () => {
    const figures = kickoffFormation(FLICK_PITCH);
    const ball = createFlickBall(FLICK_PITCH);
    ball.x = 1;
    ball.z = 0;
    const d = decideFlickAI(figures, ball, "away", "NORMAL");
    expect(d).toBeTruthy();
    const fig = figures.find((f) => f.id === d!.figureId)!;
    expect(fig.side).toBe("away");
    expect(fig.isGK).toBe(false);
    // Pull back should oppose desired travel toward ball/goal (−X for away).
    applyFlickImpulse(fig, d!.pullDx, d!.pullDz);
    expect(Math.hypot(fig.vx, fig.vz)).toBeGreaterThan(0.5);
  });

  it("kickoff formation has 11 per side including one GK each", () => {
    const figures = kickoffFormation(FLICK_PITCH);
    expect(figures.filter((f) => f.side === "home")).toHaveLength(11);
    expect(figures.filter((f) => f.side === "away")).toHaveLength(11);
    expect(figures.filter((f) => f.isGK)).toHaveLength(2);
  });
});
