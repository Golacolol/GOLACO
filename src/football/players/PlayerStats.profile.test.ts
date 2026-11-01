import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import {
  PROFILE_ATTR_SPOKES,
  PROFILE_AXIS_IDS,
  deriveProfileAxes,
  effectiveComposure,
  listProfileAttrSpokes,
  resolveAttributes,
} from "./PlayerStats";
import { nextProfileStatsMode, profileFullSvg, profileStatsBlock } from "../../ui/ProfileHex";

const attrs: PlayerAttributes = {
  pace: 80,
  acceleration: 78,
  agility: 72,
  balance: 70,
  passing: 75,
  longPassing: 70,
  vision: 74,
  crossing: 68,
  control: 76,
  dribbling: 73,
  shooting: 82,
  finishing: 84,
  shotPower: 80,
  longShots: 78,
  heading: 70,
  penalties: 72,
  setPieces: 71,
  defending: 40,
  defensiveAwareness: 42,
  tackling: 38,
  jumping: 65,
  aggression: 55,
  strength: 68,
  stamina: 77,
  composure: 79,
  form: 82,
  concentration: 77,
  attackingAwareness: 81,
  reactions: 76,
};

describe("deriveProfileAxes", () => {
  it("returns six overalls for hex comparison", () => {
    const axes = deriveProfileAxes(attrs);
    expect(Object.keys(axes).sort()).toEqual([...PROFILE_AXIS_IDS].sort());
    for (const id of PROFILE_AXIS_IDS) {
      expect(axes[id]).toBeGreaterThanOrEqual(1);
      expect(axes[id]).toBeLessThanOrEqual(100);
    }
    expect(axes.attack).toBeGreaterThan(axes.defence);
    expect(axes.technique).toBeGreaterThan(50);
  });

  it("infers form and concentration and blends them into effective composure", () => {
    const resolved = resolveAttributes({
      pace: 70,
      passing: 70,
      longPassing: 70,
      vision: 70,
      control: 70,
      dribbling: 70,
      shooting: 70,
      finishing: 70,
      shotPower: 70,
      longShots: 70,
      defending: 70,
      strength: 70,
      stamina: 70,
      composure: 80,
      primaryPosition: "CM",
    });
    expect(resolved.form).toBe(80);
    expect(resolved.concentration).toBe(80);
    expect(effectiveComposure({ ...resolved, form: 40, concentration: 40 })).toBeLessThan(80);
    expect(effectiveComposure({ ...resolved, form: 95, concentration: 95 })).toBeGreaterThan(80);
  });
});

describe("full attribute radar spokes", () => {
  it("lists every non-GK spoke and grows when GK ratings are present", () => {
    const outfield = listProfileAttrSpokes(attrs);
    const expectedOutfield = PROFILE_ATTR_SPOKES.filter((s) => !s.gk).length;
    expect(outfield).toHaveLength(expectedOutfield);
    expect(outfield.every((s) => s.value >= 1 && s.value <= 100)).toBe(true);

    const keeper = listProfileAttrSpokes({ ...attrs, gkReflexes: 82, gkDiving: 78 });
    expect(keeper.length).toBe(PROFILE_ATTR_SPOKES.length);
    expect(keeper.some((s) => s.key === "gkReflexes")).toBe(true);
  });

  it("keeps the full shape inside the same fixed footprint as the hex", () => {
    const hex = profileStatsBlock(attrs, { mode: "hex", size: 168 });
    const full = profileStatsBlock(attrs, { mode: "full", size: 168 });
    expect(hex).toMatch(/width:168px;height:168px/);
    expect(full).toMatch(/width:168px;height:168px/);
    expect(full).toContain("profile-hex-full");
    const svg = profileFullSvg(listProfileAttrSpokes(attrs), 168);
    expect(svg).toContain('viewBox="0 0 168 168"');
    expect(svg.match(/profile-hex-shape/g)?.length).toBe(1);
  });

  it("cycles hex → full → detail → hex", () => {
    expect(nextProfileStatsMode("hex")).toBe("full");
    expect(nextProfileStatsMode("full")).toBe("detail");
    expect(nextProfileStatsMode("detail")).toBe("hex");
  });
});
