import { describe, expect, it } from "vitest";
import { gaitFromSpeed } from "./PlayerAnimation";

describe("running animation states", () => {
  it("changes gait with speed", () => {
    expect(gaitFromSpeed(0, false, false)).toBe("IDLE");
    expect(gaitFromSpeed(2, false, false)).toBe("WALK");
    expect(gaitFromSpeed(4.5, false, false)).toBe("JOG");
    expect(gaitFromSpeed(6.5, false, false)).toBe("RUN");
  });

  it("uses sprint only when sprinting at high speed", () => {
    expect(gaitFromSpeed(8.2, true, false)).toBe("SPRINT");
    expect(gaitFromSpeed(8.2, false, false)).toBe("RUN");
    expect(gaitFromSpeed(2.5, false, true)).toBe("WALK");
  });

  it("still treats a celebrating scorer as running when they have speed", () => {
    expect(gaitFromSpeed(8.2, true, false)).toBe("SPRINT");
    expect(gaitFromSpeed(6.2, false, false)).toBe("RUN");
  });
});
