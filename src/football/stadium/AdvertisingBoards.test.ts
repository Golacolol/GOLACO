import { describe, expect, it } from "vitest";
import { HALF_LENGTH, HALF_WIDTH, PITCH_LENGTH, PITCH_WIDTH } from "../constants";
import { pitchAdSpans } from "./AdvertisingBoards";

describe("pitch advertising boards", () => {
  it("runs the full length of both touchlines and the full width of both goal lines", () => {
    const spans = pitchAdSpans();
    expect(spans.length).toBeGreaterThan(8);

    const touch = spans.filter((s) => Math.abs(s.z) > HALF_WIDTH);
    const ends = spans.filter((s) => Math.abs(s.x) > HALF_LENGTH);
    expect(touch.length).toBeGreaterThan(4);
    expect(ends.length).toBeGreaterThan(4);

    const northLen = touch.filter((s) => s.z > 0).reduce((n, s) => n + s.w, 0);
    const southLen = touch.filter((s) => s.z < 0).reduce((n, s) => n + s.w, 0);
    expect(northLen).toBeGreaterThan(PITCH_LENGTH - 6);
    expect(southLen).toBeGreaterThan(PITCH_LENGTH - 6);

    const eastLen = ends.filter((s) => s.x > 0).reduce((n, s) => n + s.w, 0);
    const westLen = ends.filter((s) => s.x < 0).reduce((n, s) => n + s.w, 0);
    expect(eastLen).toBeGreaterThan(PITCH_WIDTH - 6);
    expect(westLen).toBeGreaterThan(PITCH_WIDTH - 6);
  });
});
