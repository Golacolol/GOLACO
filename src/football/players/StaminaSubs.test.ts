import { describe, expect, it } from "vitest";
import { PlayerEnergy, staminaMatchDrainScale } from "./PlayerEnergy";
import { DEFAULT_MATCH_DURATION } from "../constants";
import {
  SUB_ANNOUNCE_SECONDS,
  isSubstitutionWindow,
  subAnnounceDone,
  subAnnounceFading,
} from "../Substitution";
import { FootballState } from "../FootballState";
import { Team } from "../teams/Team";

describe("stamina scaling", () => {
  it("drains slower on a default 5-minute match than on a long match", () => {
    expect(staminaMatchDrainScale(DEFAULT_MATCH_DURATION)).toBeLessThan(staminaMatchDrainScale(2700));
    expect(staminaMatchDrainScale(DEFAULT_MATCH_DURATION)).toBeLessThan(0.85);
  });

  it("recovers while intensity is low and drains while sprinting", () => {
    const walk = new PlayerEnergy(80);
    const sprint = new PlayerEnergy(80);
    walk.value = 0.55;
    sprint.value = 0.55;
    const scale = staminaMatchDrainScale(DEFAULT_MATCH_DURATION);
    for (let i = 0; i < 80; i++) {
      walk.update(0.05, 0.12, 0.12, scale);
      sprint.update(0.05, 1.1, 0.12, scale);
    }
    expect(walk.value).toBeGreaterThan(0.55);
    expect(sprint.value).toBeLessThan(0.55);
  });

  it("restores energy at half-time", () => {
    const energy = new PlayerEnergy(75);
    energy.value = 0.35;
    energy.restoreHalfTime();
    expect(energy.value).toBeGreaterThan(0.55);
    expect(energy.value).toBeLessThanOrEqual(1);
  });
});

describe("substitutions", () => {
  it("allows at most five substitutions", () => {
    expect(Team.MAX_SUBS).toBe(5);
  });

  it("fades the sub banner in the final second of a five-second card", () => {
    expect(subAnnounceFading(SUB_ANNOUNCE_SECONDS - 0.5)).toBe(true);
    expect(subAnnounceFading(1)).toBe(false);
    expect(subAnnounceDone(SUB_ANNOUNCE_SECONDS)).toBe(true);
  });

  it("waits for kick-off after a goal rather than completing mid-celebration", () => {
    expect(isSubstitutionWindow(FootballState.GOAL_CELEBRATION)).toBe(false);
    expect(isSubstitutionWindow(FootballState.PLAYING)).toBe(false);
    expect(isSubstitutionWindow(FootballState.KICK_OFF)).toBe(true);
    expect(isSubstitutionWindow(FootballState.THROW_IN)).toBe(true);
    expect(isSubstitutionWindow(FootballState.HALF_TIME)).toBe(true);
  });
});
