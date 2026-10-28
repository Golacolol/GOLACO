import { describe, expect, it } from "vitest";
import { goalMinuteLabel } from "./GoalEvent";

describe("goal minute labels", () => {
  it("maps elapsed match time onto a 90-minute clock", () => {
    expect(goalMinuteLabel(300, 600)).toBe("45'");
    expect(goalMinuteLabel(0, 600)).toBe("1'");
  });
});
