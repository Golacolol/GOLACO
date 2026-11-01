import { describe, expect, it } from "vitest";
import { ballThreatensGoal, clampGkPosition, FLICK_PITCH, gkMoveBounds, halfLength, halfWidth } from "./FlickPitch";
import { applyFlickImpulse, kickoffFormation } from "./FlickFigure";
import { checkFlickGoal, createFlickBall } from "./FlickBall";
import { decideFlickAI, powerForCoastDistance } from "./FlickAI";
import { checkFlickOutOfPlay, estimateFlickCoastDistance } from "./FlickPhysics";
import { normalizeFlickConfig } from "./FlickSetup";

describe("FlickMatch rules helpers", () => {
  it("normalizes flick config", () => {
    const c = normalizeFlickConfig({ firstTo: 99, opponent: "HUMAN" });
    expect(c.firstTo).toBe(21);
    expect(c.opponent).toBe("HUMAN");
    expect(c.humanSide).toBe("home");
    expect(c.turnBased).toBe(true);
    expect(normalizeFlickConfig({ turnBased: false }).turnBased).toBe(false);
  });

  it("conceding side would restart after a goal at either end", () => {
    // Mirrors FlickMatch.onGoalDone: scorer from checkFlickGoal → other side kicks off.
    const ball = createFlickBall(FLICK_PITCH);
    const hl = halfLength(FLICK_PITCH);
    ball.x = hl + ball.radius;
    ball.z = 0;
    const homeScore = checkFlickGoal(ball, FLICK_PITCH);
    expect(homeScore).toBe("home");
    const afterHomeGoal = homeScore === "home" ? "away" : "home";
    expect(afterHomeGoal).toBe("away");

    ball.x = -hl - ball.radius;
    const awayScore = checkFlickGoal(ball, FLICK_PITCH);
    expect(awayScore).toBe("away");
    const afterAwayGoal = awayScore === "home" ? "away" : "home";
    expect(afterAwayGoal).toBe("home");
  });

  it("detects ball threat in the defending box for GK window", () => {
    const hl = halfLength(FLICK_PITCH);
    expect(ballThreatensGoal(-hl + 4, 0, "home", FLICK_PITCH)).toBe(true);
    expect(ballThreatensGoal(0, 0, "home", FLICK_PITCH)).toBe(false);
    expect(ballThreatensGoal(hl - 3, 0.2, "away", FLICK_PITCH)).toBe(true);
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

  it("AI power scales with distance and keeps surplus speed for a hard hit", () => {
    const figures = kickoffFormation(FLICK_PITCH);
    const ball = createFlickBall(FLICK_PITCH);
    // Ball deep toward home goal — away needs a long strike from their half.
    ball.x = -20;
    ball.z = 0;
    const d = decideFlickAI(figures, ball, "away", "HARD");
    expect(d).toBeTruthy();
    const fig = figures.find((f) => f.id === d!.figureId)!;
    const dist = Math.hypot(fig.x - ball.x, fig.z - ball.z);
    applyFlickImpulse(fig, d!.pullDx, d!.pullDz);
    const speed = Math.hypot(fig.vx, fig.vz);
    // Coast past the ball with leftover contact speed (not a soft arrive-and-stop).
    expect(estimateFlickCoastDistance(speed)).toBeGreaterThan(dist + 8);
    expect(speed).toBeGreaterThan(powerForCoastDistance(dist) + 20);
  });

  it("registers a goal as soon as the ball is fully over the line", () => {
    const ball = createFlickBall(FLICK_PITCH);
    const hl = halfLength(FLICK_PITCH);
    // Exactly whole-of-ball over the line (inclusive).
    ball.x = hl + ball.radius;
    ball.z = 0;
    expect(checkFlickGoal(ball, FLICK_PITCH)).toBe("home");
    ball.x = -hl - ball.radius;
    expect(checkFlickGoal(ball, FLICK_PITCH)).toBe("away");
  });

  it("kickoff formation has 11 per side including one GK each", () => {
    const figures = kickoffFormation(FLICK_PITCH);
    expect(figures.filter((f) => f.side === "home")).toHaveLength(11);
    expect(figures.filter((f) => f.side === "away")).toHaveLength(11);
    expect(figures.filter((f) => f.isGK)).toHaveLength(2);
  });

  it("places GKs near their own goal lines on the REAL pitch", () => {
    const figures = kickoffFormation(FLICK_PITCH);
    const hl = halfLength(FLICK_PITCH);
    const homeGk = figures.find((f) => f.side === "home" && f.isGK)!;
    const awayGk = figures.find((f) => f.side === "away" && f.isGK)!;
    expect(homeGk.x).toBeLessThan(-hl * 0.8);
    expect(awayGk.x).toBeGreaterThan(hl * 0.8);
  });

  it("clamps GK movement to the goal mouth / near-six-yard area", () => {
    const home = gkMoveBounds("home", FLICK_PITCH);
    const pinned = clampGkPosition(0, 40, "home", FLICK_PITCH);
    expect(pinned.x).toBeGreaterThanOrEqual(home.minX);
    expect(pinned.x).toBeLessThanOrEqual(home.maxX);
    expect(pinned.z).toBeGreaterThanOrEqual(home.minZ);
    expect(pinned.z).toBeLessThanOrEqual(home.maxZ);
    expect(Math.abs(pinned.z)).toBeLessThanOrEqual(FLICK_PITCH.goalWidth / 2 + FLICK_PITCH.figureRadius);
  });

  it("awards Subbuteo-style throw-ins, corners, and goal kicks", () => {
    const ball = createFlickBall(FLICK_PITCH);
    const hl = halfLength(FLICK_PITCH);
    const hw = halfWidth(FLICK_PITCH);

    ball.x = 10;
    ball.z = hw + ball.radius + 0.05;
    const throwIn = checkFlickOutOfPlay(ball, "home", FLICK_PITCH);
    expect(throwIn?.kind).toBe("throwIn");
    expect(throwIn?.awardTo).toBe("away");

    // Defender last-touches over own goal-line outside the mouth → corner.
    ball.x = hl + ball.radius + 0.1;
    ball.z = FLICK_PITCH.goalWidth;
    const corner = checkFlickOutOfPlay(ball, "away", FLICK_PITCH);
    expect(corner?.kind).toBe("corner");
    expect(corner?.awardTo).toBe("home");

    // Attacker last-touches over opponent goal-line outside the mouth → goal kick.
    const gk = checkFlickOutOfPlay(ball, "home", FLICK_PITCH);
    expect(gk?.kind).toBe("goalKick");
    expect(gk?.awardTo).toBe("away");
  });
});
