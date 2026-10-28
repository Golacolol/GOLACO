import { describe, expect, it } from "vitest";
import { HALF_LENGTH } from "../constants";
import { attackDir, defendGoalX, defendingSideAtWorldEnd, scorerForWorldGoal } from "./PitchEnds";

describe("pitch ends", () => {
  it("keeps home attacking +X in the first half", () => {
    expect(attackDir("home", false)).toBe(1);
    expect(attackDir("away", false)).toBe(-1);
    expect(defendGoalX("home", false)).toBe(-HALF_LENGTH);
    expect(defendGoalX("away", false)).toBe(HALF_LENGTH);
  });

  it("swaps ends after half-time", () => {
    expect(attackDir("home", true)).toBe(-1);
    expect(attackDir("away", true)).toBe(1);
    expect(defendGoalX("home", true)).toBe(HALF_LENGTH);
    expect(defendGoalX("away", true)).toBe(-HALF_LENGTH);
  });

  it("awards goals to the team attacking that world end", () => {
    expect(scorerForWorldGoal("away", false)).toBe("home");
    expect(scorerForWorldGoal("home", false)).toBe("away");
    expect(scorerForWorldGoal("away", true)).toBe("away");
    expect(scorerForWorldGoal("home", true)).toBe("home");
  });

  it("assigns the correct defender to each world end", () => {
    expect(defendingSideAtWorldEnd("home", false)).toBe("home");
    expect(defendingSideAtWorldEnd("away", false)).toBe("away");
    expect(defendingSideAtWorldEnd("home", true)).toBe("away");
    expect(defendingSideAtWorldEnd("away", true)).toBe("home");
  });
});
