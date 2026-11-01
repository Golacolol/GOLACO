/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { CENTRE_CIRCLE_RADIUS, HALF_LENGTH, PENALTY_AREA_LENGTH, PENALTY_SPOT } from "../constants";
import { createPitch, penaltyArcSweep } from "./Pitch";

describe("penalty arcs", () => {
  it("meets the 16-yard line on both ends of each D", () => {
    const inner = CENTRE_CIRCLE_RADIUS - 0.06;
    for (const dir of [1, -1] as const) {
      const { thetaStart, thetaLength } = penaltyArcSweep(dir);
      const spotX = dir * (HALF_LENGTH - PENALTY_SPOT);
      const boxX = dir * (HALF_LENGTH - PENALTY_AREA_LENGTH);
      for (const theta of [thetaStart, thetaStart + thetaLength]) {
        const x = spotX + inner * Math.cos(theta);
        // Ends overlap the 16-yard line so the D reads as attached.
        expect(Math.abs(x - boxX)).toBeLessThan(0.45);
        if (dir > 0) expect(x).toBeGreaterThanOrEqual(boxX - 0.02);
        else expect(x).toBeLessThanOrEqual(boxX + 0.02);
        expect(Math.abs(inner * Math.sin(theta))).toBeGreaterThan(6);
      }
      expect(thetaLength).toBeGreaterThan(1.8);
      expect(thetaLength).toBeLessThan(2.3);
    }
  });
});

describe("createPitch markings", () => {
  function cornerPositions(length: number, width: number) {
    const pitch = createPitch(length, width, { park: true });
    return pitch.children
      .filter((c) => c.name === "corner-arc")
      .map((c) => ({ x: c.position.x, z: c.position.z }));
  }

  it("places four corner quarter-circles on the pitch corners", () => {
    const positions = cornerPositions(105, 68);
    expect(positions).toHaveLength(4);
    for (const [x, z] of [
      [52.5, 34],
      [52.5, -34],
      [-52.5, 34],
      [-52.5, -34],
    ] as const) {
      expect(positions.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.z - z) < 1e-6)).toBe(true);
    }
  });

  it("scales corner arcs to a shorter community pitch", () => {
    const positions = cornerPositions(100, 64);
    expect(positions.some((p) => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.z - 32) < 1e-6)).toBe(true);
    expect(positions.some((p) => Math.abs(p.x + 50) < 1e-6 && Math.abs(p.z + 32) < 1e-6)).toBe(true);
  });
});
