import { describe, expect, it } from "vitest";
import { AWAY_DUGOUT_X, HOME_DUGOUT_X, technicalArea } from "./Dugouts";
import { HALF_WIDTH } from "../constants";

describe("manager dugouts", () => {
  it("gives each manager a technical area beside their dugout", () => {
    const home = technicalArea("home");
    const away = technicalArea("away");
    expect(HOME_DUGOUT_X).toBeLessThan(0);
    expect(AWAY_DUGOUT_X).toBeGreaterThan(0);
    expect(home.maxX).toBeLessThan(away.minX);
    expect(home.minZ).toBeGreaterThan(HALF_WIDTH);
    expect(away.maxZ - away.minZ).toBeGreaterThan(2);
    expect(home.maxX - home.minX).toBeGreaterThan(10);
  });
});
