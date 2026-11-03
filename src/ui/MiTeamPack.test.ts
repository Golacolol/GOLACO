import { describe, expect, it } from "vitest";
import {
  miteamFoilHtml,
  miteamFoilSerrationClip,
  packTierForOverall,
  MITEAM_GOLD_OVR,
} from "./MiTeamPack";

describe("MiTeamPack tiers", () => {
  it("uses gold at 90+ overall", () => {
    expect(packTierForOverall(89)).toBe("silver");
    expect(packTierForOverall(MITEAM_GOLD_OVR)).toBe("gold");
    expect(packTierForOverall(99)).toBe("gold");
  });

  it("renders gold foil chrome for gold packs", () => {
    const gold = miteamFoilHtml("gold");
    expect(gold).toContain("miteam-foil-shell-gold");
    expect(gold).toContain("miteam-foil-gold");
    expect(gold).toContain("miteam-foil-well");
    expect(gold).toContain("miteam-foil-card-peek");
    expect(gold).toContain("GOLD PACK");
    expect(gold).toContain("miteam-foil-holo");
    expect(gold).toContain("clip-path:polygon(");
    expect(gold).toContain("miteam-foil-wrap-left");
    expect(gold).toContain("miteam-foil-lip-top");
    expect(gold).toContain("miteam-foil-tear-top");
    expect(gold.match(/golaco-logo\.png/g)?.length).toBe(1);
    const silver = miteamFoilHtml("silver");
    expect(silver).toContain("miteam-foil-silver");
    expect(silver).toContain("SILVER PACK");
    expect(silver).not.toContain("miteam-foil-gold");
  });

  it("serrates top and bottom tear edges only", () => {
    const clip = miteamFoilSerrationClip();
    expect(clip.startsWith("polygon(")).toBe(true);
    expect(clip).toContain("0.0% 0.0%");
    expect(clip).toContain("100.0% 100.0%");
    expect(clip).toContain("0.0% 100.0%");
    // Shallow notches — recessed well / card lip, not an opened pack.
    expect(clip).toContain("2.8%");
    expect(clip).toContain("97.2%");
    // No mid-side zigzag points (e.g. inset x at ~50% height).
    expect(clip).not.toMatch(/9[0-9]\.[0-9]% 5[0-9]\.[0-9]%/);
  });
});
