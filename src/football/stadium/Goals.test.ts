import { describe, expect, it } from "vitest";
import { HALF_LENGTH } from "../constants";
import { createGoals } from "./Goals";

describe("createGoals", () => {
  function postLineXs(halfLength?: number): number[] {
    const g = createGoals(halfLength);
    const xs = new Set<number>();
    g.traverse((obj) => {
      if (obj.name !== "goal-post") return;
      xs.add(Math.round(obj.position.x * 100) / 100);
    });
    return [...xs].sort((a, b) => a - b);
  }

  it("defaults to the FIFA half-length goal lines", () => {
    expect(postLineXs()).toEqual([-HALF_LENGTH, HALF_LENGTH]);
  });

  it("can sit on a community pitch goal line", () => {
    expect(postLineXs(50)).toEqual([-50, 50]);
  });
});
