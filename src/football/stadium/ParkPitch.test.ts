import { describe, expect, it } from "vitest";
import type { StadiumRecord } from "../../data/schema";
import stadiumsData from "../../../public/data/stadiums.json";
import { createGoals } from "./Goals";
import { parkPathCentreX } from "./Stadium";

describe("Central Park venue data", () => {
  const stadiums = stadiumsData as StadiumRecord[];
  const central = stadiums.find((s) => s.id === "central_park_pitch");

  it("uses a full FIFA-sized pitch so markings and grass line up", () => {
    expect(central).toBeTruthy();
    expect(central!.environment).toBe("park");
    expect(central!.pitchLength).toBe(105);
    expect(central!.pitchWidth).toBe(68);
  });
});

describe("park pitch layout", () => {
  it("keeps the footpath clear of the playing surface and grass apron", () => {
    for (const length of [100, 105]) {
      const halfL = length / 2;
      const pathHalf = 4;
      const apron = 5; // park grassPad / 2
      expect(parkPathCentreX(length) - pathHalf).toBeGreaterThan(halfL + apron - 0.01);
    }
  });

  it("places goals on the venue goal lines, not a fixed FIFA constant", () => {
    const g = createGoals(50);
    const xs = new Set<number>();
    g.traverse((obj) => {
      if (obj.name === "goal-post") xs.add(obj.position.x);
    });
    expect([...xs].sort((a, b) => a - b)).toEqual([-50, 50]);
  });
});
