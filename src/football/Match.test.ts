import { describe, expect, it } from "vitest";
import { createGoalEvent } from "./GoalEvent";
import { MatchClock } from "./MatchClock";
import { FootballState } from "./FootballState";
import { throwInMaxDistance } from "./ThrowIn";
import { HALF_WIDTH } from "./constants";

describe("goal events", () => {
  it("carries scorer, score and team context", () => {
    const ev = createGoalEvent({
      scoringTeam: "home",
      scorerId: "player_000007",
      scorerName: "M. Cooper",
      scorerNumber: 8,
      gameTime: 72,
      homeScore: 1,
      awayScore: 0,
      shotType: "open",
      venueId: "home_park",
    });
    expect(ev.scorerId).toBe("player_000007");
    expect(ev.homeScore).toBe(1);
    expect(ev.scoringTeam).toBe("home");
  });
});

describe("match clock", () => {
  it("does not advance during celebration and reaches full time across two halves", () => {
    const clock = new MatchClock(4);
    clock.running = true;
    clock.update(1, FootballState.PLAYING);
    clock.update(2, FootballState.GOAL_CELEBRATION);
    expect(clock.elapsed).toBe(1);
    clock.update(1.5, FootballState.PLAYING);
    expect(clock.regulationElapsed).toBe(true);
    clock.update(clock.injuryAllowance, FootballState.PLAYING);
    expect(clock.halfTimeDue).toBe(true);
    expect(clock.fullTime).toBe(false);
    expect(clock.display()).toMatch(/^1ST /);
    clock.startSecondHalf();
    clock.update(2, FootballState.PLAYING);
    clock.update(clock.injuryAllowance, FootballState.PLAYING);
    expect(clock.fullTime).toBe(true);
    expect(clock.display()).toMatch(/^2ND /);
  });

  it("splits duration into two equal halves with short injury time on a 5-minute half", () => {
    const clock = new MatchClock(600);
    expect(clock.halfDuration).toBe(300);
    expect(clock.baseInjury).toBeCloseTo(7.5, 5);
    expect(clock.baseInjury / clock.halfDuration).toBeGreaterThanOrEqual(0.02);
    expect(clock.baseInjury / clock.halfDuration).toBeLessThanOrEqual(0.03);
    clock.running = true;
    clock.update(150, FootballState.PLAYING);
    expect(clock.display()).toBe("1ST 22:30");
    clock.update(150, FootballState.PLAYING);
    expect(clock.regulationElapsed).toBe(true);
    expect(clock.halfTimeDue).toBe(false);
    // 7.5s of 300s half → 1.125′ → ceil → +2
    expect(clock.injuryBoard).toBe(2);
    expect(clock.display()).toBe("1ST 45:00 +2");
    clock.update(clock.injuryAllowance, FootballState.PLAYING);
    expect(clock.halfTimeDue).toBe(true);
    clock.startSecondHalf();
    expect(clock.display()).toBe("2ND 0:00");
    clock.update(300, FootballState.PLAYING);
    clock.update(clock.injuryAllowance, FootballState.PLAYING);
    expect(clock.fullTime).toBe(true);
    expect(clock.display()).toBe("2ND 45:00 +2");
  });

  it("extends injury time when fouls are added", () => {
    const clock = new MatchClock(600);
    const base = clock.injuryAllowance;
    clock.addFoulTime(2);
    expect(clock.injuryAllowance).toBeCloseTo(base + 2, 5);
    // (7.5+2)/300 * 45 = 1.425 → ceil → 2
    expect(clock.injuryBoard).toBe(2);
    clock.addFoulTime(10);
    // (7.5+12)/300 * 45 = 2.925 → ceil → 3
    expect(clock.injuryBoard).toBe(3);
  });
});

describe("throw-in strength", () => {
  it("allows the strongest throws to reach half the pitch width", () => {
    expect(throwInMaxDistance(99)).toBeCloseTo(HALF_WIDTH, 5);
  });
});
