import { describe, expect, it } from "vitest";
import type { FixtureRecord } from "../../data/schema";
import {
  autoSelectPredictionFixtures,
  blankPredictions,
  ensurePredictionWeek,
  matchOutcome,
  maxPredictionWeekStart,
  predictionWeekStart,
  scorePrediction,
  setAdminPredictionFixtures,
  shiftPredictionWeek,
  updatePredictionPick,
} from "./Predictions";

function fix(
  id: string,
  date: string,
  home: string,
  away: string,
  extra: Partial<FixtureRecord> = {},
): FixtureRecord {
  return {
    id,
    date,
    time: "15:00",
    durationSeconds: 600,
    homeTeamId: home,
    awayTeamId: away,
    venueId: "v",
    competition: "Premier League",
    weather: "MILD",
    timeOfDay: "DAY",
    played: false,
    ...extra,
  };
}

describe("prediction week calendar", () => {
  it("maps Sat–Thu to that Saturday and Friday to the next Saturday", () => {
    expect(predictionWeekStart("2026-09-12")).toBe("2026-09-12"); // Sat
    expect(predictionWeekStart("2026-09-15")).toBe("2026-09-12"); // Tue
    expect(predictionWeekStart("2026-09-17")).toBe("2026-09-12"); // Thu
    expect(predictionWeekStart("2026-09-18")).toBe("2026-09-19"); // Fri → next Sat
  });

  it("allows browsing current and next week only as the forward limit", () => {
    expect(maxPredictionWeekStart("2026-09-15")).toBe("2026-09-19");
    expect(shiftPredictionWeek("2026-09-12", 1)).toBe("2026-09-19");
  });
});
describe("prediction scoring", () => {
  it("awards exact, goal and result points", () => {
    expect(scorePrediction(2, 1, 2, 1)).toBe(8); // 5+1+1+1
    expect(scorePrediction(1, 0, 2, 0)).toBe(2); // away goals + home win
    expect(scorePrediction(0, 0, 1, 1)).toBe(1); // draw result only
    expect(matchOutcome(2, 2)).toBe("DRAW");
  });
});

describe("prediction slate", () => {
  it("auto-selects ten fixtures in the Sat–Thu window from Friday", () => {
    const weekStart = "2026-09-19";
    const fixtures = Array.from({ length: 14 }, (_, i) =>
      fix(`f${i}`, i < 10 ? "2026-09-19" : "2026-09-20", `h${i}`, `a${i}`, { official: true }),
    );
    const state = ensurePredictionWeek(blankPredictions(), fixtures, "2026-09-18"); // Friday
    const week = state.weeks.find((w) => w.weekStart === weekStart)!;
    expect(week.fixtureIds).toHaveLength(10);
    expect(week.adminSet).toBe(false);
  });

  it("lets admin set and re-set the slate", () => {
    let state = setAdminPredictionFixtures(blankPredictions(), "2026-09-19", ["a", "b", "c"]);
    expect(state.weeks[0]!.fixtureIds).toEqual(["a", "b", "c"]);
    expect(state.weeks[0]!.adminSet).toBe(true);
    state = setAdminPredictionFixtures(state, "2026-09-19", ["x", "y"]);
    expect(state.weeks[0]!.fixtureIds).toEqual(["x", "y"]);
  });

  it("locks picks so score rollers cannot change until unlocked", () => {
    let state = setAdminPredictionFixtures(blankPredictions(), "2026-09-19", ["f1"]);
    state = updatePredictionPick(state, "2026-09-19", "f1", { home: 2, away: 1, locked: true });
    state = updatePredictionPick(state, "2026-09-19", "f1", { home: 5 });
    expect(state.weeks[0]!.picks[0]).toMatchObject({ home: 2, away: 1, locked: true });
    state = updatePredictionPick(state, "2026-09-19", "f1", { locked: false, home: 3 });
    expect(state.weeks[0]!.picks[0]!.home).toBe(3);
  });

  it("prefers diverse official ties when auto-selecting", () => {
    const fixtures = [
      fix("1", "2026-09-19", "a", "b", { official: true }),
      fix("2", "2026-09-19", "a", "c", { official: true }),
      fix("3", "2026-09-20", "d", "e", { official: true }),
    ];
    const ids = autoSelectPredictionFixtures(fixtures, "2026-09-19");
    expect(ids[0]).toBe("1");
    expect(ids).toContain("3");
  });
});
