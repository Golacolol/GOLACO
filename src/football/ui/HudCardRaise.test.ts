import { describe, expect, it } from "vitest";
import { HUD_CARD_FADE_MS, HUD_CARD_RAISE_MS, hudSheetFading, hudSheetShowing } from "./HudCardRaise";

describe("HUD player-details sheet", () => {
  it("stays up for 20 seconds then fades", () => {
    expect(HUD_CARD_RAISE_MS).toBe(20000);
    expect(HUD_CARD_FADE_MS).toBe(900);
    expect(hudSheetShowing(1000, 999)).toBe(true);
    expect(hudSheetFading(1000, 999)).toBe(false);
    expect(hudSheetFading(1000, 1000)).toBe(true);
    expect(hudSheetShowing(1000, 1000)).toBe(true);
    expect(hudSheetShowing(1000, 1000 + HUD_CARD_FADE_MS)).toBe(false);
    expect(hudSheetShowing(0, 50)).toBe(false);
  });
});
