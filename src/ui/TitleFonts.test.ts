/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLUB_NAME_FONT,
  DEFAULT_CLUB_NAME_GLOW_DIFFUSION,
  DEFAULT_TITLE_FONT,
  TITLE_FONTS,
  applyClubNameAppearance,
  clampClubNameGlowDiffusion,
  clubNameFontFamily,
  titleFontFamily,
} from "./TitleFonts";

describe("TitleFonts", () => {
  it("offers a large shared catalogue for title and club name pickers", () => {
    expect(TITLE_FONTS.length).toBeGreaterThanOrEqual(40);
    expect(TITLE_FONTS.some((f) => f.id === "fantasy")).toBe(true);
    expect(TITLE_FONTS.some((f) => f.id === "montserrat")).toBe(true);
    expect(TITLE_FONTS.some((f) => f.id === DEFAULT_TITLE_FONT)).toBe(true);
    expect(TITLE_FONTS.some((f) => f.id === DEFAULT_CLUB_NAME_FONT)).toBe(true);
    expect(DEFAULT_TITLE_FONT).toBe("righteous");
    expect(DEFAULT_CLUB_NAME_FONT).toBe("oswald");
    expect(titleFontFamily("bebas")).toMatch(/Bebas Neue/);
    expect(titleFontFamily("missing")).toMatch(/Righteous/);
    expect(clubNameFontFamily("teko")).toMatch(/Teko/);
    expect(clubNameFontFamily("missing")).toMatch(/Oswald/);
  });

  it("applies club name glow, diffusion and colour invert to the document", () => {
    applyClubNameAppearance({
      clubNameFont: "teko",
      clubNameGlow: true,
      clubNameGlowDiffusion: 80,
      clubNameInvertColors: true,
    });
    expect(document.documentElement.classList.contains("club-name-colors-invert")).toBe(true);
    expect(document.documentElement.classList.contains("club-name-glow-off")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--club-name-font")).toMatch(/Teko/);
    expect(document.documentElement.style.getPropertyValue("--club-name-glow-4")).not.toBe("");

    applyClubNameAppearance({
      clubNameGlow: false,
      clubNameGlowDiffusion: DEFAULT_CLUB_NAME_GLOW_DIFFUSION,
      clubNameInvertColors: false,
    });
    expect(document.documentElement.classList.contains("club-name-glow-off")).toBe(true);
    expect(document.documentElement.classList.contains("club-name-colors-invert")).toBe(false);
    expect(clampClubNameGlowDiffusion(150)).toBe(100);
    expect(clampClubNameGlowDiffusion(-4)).toBe(0);
  });
});
