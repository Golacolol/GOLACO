import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { PROFILE_AXIS_IDS, deriveProfileAxes, effectiveComposure, resolveAttributes } from "./PlayerStats";

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
