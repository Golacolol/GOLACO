import { describe, expect, it } from "vitest";
import { MATCH_CARD_FADE_LEAD } from "../football/constants";
import { matchCardLabel, matchCardShowsScorers, shouldFadeMatchCard } from "./MatchCard";

describe("match overlay card", () => {
  it("labels kick-off, goal, half and full time", () => {
    expect(matchCardLabel("kickoff")).toBe("KICK-OFF");
    expect(matchCardLabel("goal")).toBe("GOAL");
    expect(matchCardLabel("half")).toBe("HALF TIME");
    expect(matchCardLabel("full")).toBe("FULL TIME");
  });

  it("shows scorers after kick-off, including goals", () => {
    expect(matchCardShowsScorers("kickoff")).toBe(false);
    expect(matchCardShowsScorers("goal")).toBe(true);
    expect(matchCardShowsScorers("half")).toBe(true);
    expect(matchCardShowsScorers("full")).toBe(true);
  });

  it("starts fading before the restart kick-off", () => {
    expect(shouldFadeMatchCard(5)).toBe(false);
    expect(shouldFadeMatchCard(MATCH_CARD_FADE_LEAD)).toBe(true);
    expect(shouldFadeMatchCard(0.2)).toBe(true);
  });
});
