import { describe, expect, it } from "vitest";
import { HALF_LENGTH, PENALTY_SPOT } from "../constants";
import { resolveSpotKick } from "./SpotKick";

describe("spot-kick placement", () => {
  it("turns a penalty-area click into a penalty on the spot", () => {
    const placed = resolveSpotKick(HALF_LENGTH - 8, 2, "home");
    expect(placed.kind).toBe("PENALTY");
    expect(placed.ballX).toBeCloseTo(HALF_LENGTH - PENALTY_SPOT);
    expect(placed.ballZ).toBe(0);
  });

  it("keeps a click outside the box as a free kick", () => {
    const placed = resolveSpotKick(22, 8, "home");
    expect(placed.kind).toBe("FREE_KICK");
    expect(placed.ballX).toBeCloseTo(22);
    expect(placed.ballZ).toBeCloseTo(8);
  });
});
