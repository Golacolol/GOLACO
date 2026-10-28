import { describe, expect, it } from "vitest";
import { contrastingKitText, hexLuminance } from "./kitContrast";

describe("kitContrast", () => {
  it("picks dark text on white / light kit colours", () => {
    expect(hexLuminance("#ffffff")).toBeGreaterThan(0.9);
    expect(contrastingKitText("#ffffff", "#000000")).toBe("#000000");
    expect(contrastingKitText("#ffffff", "#ffffff")).toBe("#111111");
    expect(contrastingKitText("#f4f4f4", "#111111")).toBe("#111111");
  });

  it("picks light text on dark kit colours", () => {
    expect(contrastingKitText("#111111", "#f4f4f4")).toBe("#f4f4f4");
    expect(contrastingKitText("#007A3D", "#ffffff")).toBe("#ffffff");
    expect(contrastingKitText("#007A3D", "#C5A572")).toBe("#C5A572");
  });
});

