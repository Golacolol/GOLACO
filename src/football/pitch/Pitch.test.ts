import { describe, expect, it } from "vitest";
import { CENTRE_CIRCLE_RADIUS, HALF_LENGTH, PENALTY_AREA_LENGTH, PENALTY_SPOT } from "../constants";
import { penaltyArcSweep } from "./Pitch";

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
