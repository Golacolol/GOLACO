import { describe, expect, it } from "vitest";
import { SLIDE_COMMIT_RANGE, slideTimingQuality } from "./TackleModel";

describe("slideTimingQuality", () => {
  it("peaks in the sweet spot and drops when too early or late", () => {
    const sweet = slideTimingQuality(1.1);
    const early = slideTimingQuality(SLIDE_COMMIT_RANGE);
    const late = slideTimingQuality(0.35);
    expect(sweet).toBeGreaterThan(early);
    expect(sweet).toBeGreaterThan(late);
    expect(sweet).toBeGreaterThan(0.7);
  });
});
