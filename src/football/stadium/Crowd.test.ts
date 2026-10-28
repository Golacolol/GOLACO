import { describe, expect, it } from "vitest";
import { deluxeCornerCrowdGrid, deluxeCornerSpecs, standCrowdGrid, standCrowdInset } from "./Crowd";

describe("crowd fill", () => {
  it("covers the full width of each Home Park stand", () => {
    const north = standCrowdGrid("north");
    const south = standCrowdGrid("south");
    const end = standCrowdGrid("east");
    expect(north.cols * north.colPitch).toBeGreaterThan(90);
    expect(north.rows).toBe(18);
    expect(south.cols * south.colPitch).toBeGreaterThan(84);
    expect(south.rows).toBe(14);
    expect(end.cols * end.colPitch).toBeGreaterThan(58);
    expect(end.rows).toBe(16);
    expect(standCrowdInset("four")).toBe(8.6);
  });

  it("fits the smaller Central Park single stand without changing Home Park", () => {
    const north = standCrowdGrid("north", "one");
    expect(north.cols * north.colPitch).toBeLessThanOrEqual(72);
    expect(north.cols * north.colPitch).toBeGreaterThan(60);
    expect(north.rows).toBe(8);
    expect(standCrowdInset("one")).toBe(6.5);
    expect(standCrowdGrid("north", "four").rows).toBe(18);
    expect(standCrowdInset("four")).toBe(8.6);
  });

  it("sizes Premiership deluxe bowls larger than Home Park", () => {
    const north = standCrowdGrid("north", "deluxe");
    const end = standCrowdGrid("east", "deluxe");
    const near = standCrowdGrid("south", "deluxe");
    expect(north.rows).toBe(26);
    expect(north.cols * north.colPitch).toBeGreaterThan(90);
    expect(end.rows).toBe(22);
    expect(near.rows).toBe(12);
    expect(standCrowdInset("deluxe")).toBe(10.2);
    expect(standCrowdGrid("north", "four").rows).toBe(18);
  });

  it("defines four wrap-around corner arcs for deluxe bowls", () => {
    const corners = deluxeCornerSpecs();
    expect(corners).toHaveLength(4);
    expect(corners.map((c) => c.id).sort()).toEqual(["ne", "nw", "se", "sw"]);
    for (const c of corners) {
      expect(Math.abs(c.a1 - c.a0)).toBeGreaterThan(Math.PI / 2);
      expect(deluxeCornerCrowdGrid(c).cols).toBeGreaterThan(10);
      expect(deluxeCornerCrowdGrid(c).rows).toBe(c.rows);
    }
  });
});
