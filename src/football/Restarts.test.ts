import { describe, expect, it } from "vitest";
import { outOfPitch } from "./ball/BallPhysics";
import { Ball } from "./ball/Ball";
import { AUTO_RESTART_MAX, AUTO_RESTART_SECONDS, goalKickSpot, isRestartState, planFoulRestart, planOffsideFreeKick, planRestart, restartDue } from "./Restarts";
import { GOAL_HEIGHT, HALF_LENGTH, PENALTY_SPOT, SIX_YARD_LENGTH, SIX_YARD_WIDTH } from "./constants";
import { inPenaltyArea } from "./pitch/PitchZones";

describe("restarts", () => {
  it("awards a throw-in to the team that did not last touch the ball", () => {
    const plan = planRestart("sideline", "home", 12, 36);
    expect(plan.type).toBe("THROW_IN");
    expect(plan.takingSide).toBe("away");
    expect(Math.abs(plan.ballZ)).toBeGreaterThan(32);
  });

  it("gives a goal kick when the attacking team puts it over the byline", () => {
    expect(planRestart("away-line", "home", 54, 8)).toMatchObject({ type: "GOAL_KICK", takingSide: "away" });
    expect(planRestart("home-line", "away", -54, -6)).toMatchObject({ type: "GOAL_KICK", takingSide: "home" });
  });

  it("swaps goal-kick ownership after ends flip at half-time", () => {
    // Second half: home defends +X (away-line), away defends −X (home-line).
    expect(planRestart("away-line", "away", 54, 8, true)).toMatchObject({ type: "GOAL_KICK", takingSide: "home" });
    expect(planRestart("home-line", "home", -54, -6, true)).toMatchObject({ type: "GOAL_KICK", takingSide: "away" });
    const spot = goalKickSpot("home", 4, true);
    expect(spot.x).toBeCloseTo(HALF_LENGTH - SIX_YARD_LENGTH);
  });

  it("places the goal kick on the six-yard side the ball went out", () => {
    const right = planRestart("away-line", "home", 54, 12);
    expect(right.type).toBe("GOAL_KICK");
    expect(right.takingSide).toBe("away");
    expect(right.ballX).toBeCloseTo(HALF_LENGTH - SIX_YARD_LENGTH);
    expect(right.ballZ).toBeGreaterThan(0);
    expect(right.ballZ).toBeCloseTo(SIX_YARD_WIDTH / 2 - 0.55);

    const left = planRestart("home-line", "away", -54, -9);
    expect(left.type).toBe("GOAL_KICK");
    expect(left.takingSide).toBe("home");
    expect(left.ballX).toBeCloseTo(-HALF_LENGTH + SIX_YARD_LENGTH);
    expect(left.ballZ).toBeLessThan(0);

    const spot = goalKickSpot("home", 4);
    expect(spot.z).toBeGreaterThan(0);
    expect(spot.x).toBeCloseTo(-HALF_LENGTH + SIX_YARD_LENGTH);
  });

  it("gives a corner when the defending team puts it over their own byline", () => {
    expect(planRestart("away-line", "away", 54, 12)).toMatchObject({ type: "CORNER", takingSide: "home" });
    expect(planRestart("home-line", "home", -54, -10)).toMatchObject({ type: "CORNER", takingSide: "away" });
  });

  it("treats a shot over the bar as a byline restart, not a dead ball", () => {
    const ball = new Ball();
    ball.x = 53.2;
    ball.z = 0.4;
    ball.y = GOAL_HEIGHT + 0.3;
    expect(outOfPitch(ball)).toBe("away-line");
    expect(planRestart("away-line", "home", ball.x, ball.z).type).toBe("GOAL_KICK");
  });

  it("plans an offside free kick for the defending side", () => {
    const plan = planOffsideFreeKick("away", 34, 6);
    expect(plan.type).toBe("FREE_KICK");
    expect(plan.takingSide).toBe("away");
    expect(plan.ballX).toBeCloseTo(34);
    expect(plan.ballZ).toBeCloseTo(6);
    expect(isRestartState("FREE_KICK")).toBe(true);
    expect(isRestartState("PENALTY")).toBe(true);
  });

  it("awards a penalty when the foul is inside the defending box", () => {
    const foulX = HALF_LENGTH - 8;
    const foulZ = 4;
    expect(inPenaltyArea(foulX, foulZ, "away")).toBe(true);
    const plan = planFoulRestart("home", foulX, foulZ, false);
    expect(plan.type).toBe("PENALTY");
    expect(plan.takingSide).toBe("home");
    expect(plan.ballX).toBeCloseTo(HALF_LENGTH - PENALTY_SPOT);
    expect(plan.ballZ).toBe(0);
  });

  it("keeps a foul outside the box as a free kick", () => {
    const plan = planFoulRestart("home", 20, 8, false);
    expect(plan.type).toBe("FREE_KICK");
    expect(plan.takingSide).toBe("home");
  });

  it("auto-takes restarts within 5 seconds", () => {
    expect(AUTO_RESTART_SECONDS).toBeLessThanOrEqual(5);
    expect(AUTO_RESTART_MAX).toBeLessThanOrEqual(5);
    expect(restartDue(1.7, true)).toBe(true);
    expect(restartDue(1.0, true)).toBe(false);
    expect(restartDue(4.9, false)).toBe(true);
    expect(restartDue(3.0, false)).toBe(false);
  });
});
