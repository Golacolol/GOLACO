import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Player } from "../players/Player";
import { isInOffsidePosition, offsideLineX, playersOffsideAtPass } from "./Offside";

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 50,
  finishing: 50,
  shotPower: 60,
  longShots: 50,
  defending: 60,
  strength: 70,
  stamina: 80,
  composure: 70,
};

function make(id: string, side: "home" | "away", x: number, z = 0, slot = "ST"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 9,
    position: slot.includes("GK") ? "GK" : "ST",
    slot,
    side,
    attrs,
    overall: 70,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("offside", () => {
  it("uses the second-last defender as the offside line", () => {
    const away = [make("gk", "away", 50, 0, "GK"), make("cb", "away", 28, 0, "CB"), make("fb", "away", 22, 8, "RB")];
    expect(offsideLineX(away, 1)).toBeCloseTo(28);
    const home = [make("hgk", "home", -50, 0, "GK"), make("hcb", "home", -30, 0, "CB"), make("hfb", "home", -18, 0, "LB")];
    expect(offsideLineX(home, -1)).toBeCloseTo(-30);
  });

  it("uses attack direction after ends flip (home attacking −X)", () => {
    const away = [make("gk", "away", -50, 0, "GK"), make("cb", "away", -28, 0, "CB"), make("fb", "away", -22, 8, "RB")];
    expect(offsideLineX(away, -1)).toBeCloseTo(-28);
    const st = make("st", "home", -34, 0, "ST");
    st.attackSign = -1;
    expect(isInOffsidePosition(st, -10, away)).toBe(true);
    expect(isInOffsidePosition(st, -36, away)).toBe(false);
  });

  it("flags a striker beyond the last defender and the ball", () => {
    const st = make("st", "home", 34, 0, "ST");
    const defenders = [make("gk", "away", 50, 0, "GK"), make("cb", "away", 30, 0, "CB")];
    expect(isInOffsidePosition(st, 10, defenders)).toBe(true);
    expect(isInOffsidePosition(st, 36, defenders)).toBe(false);
  });

  it("does not flag players in their own half", () => {
    const st = make("st", "home", -4, 0, "ST");
    const defenders = [make("gk", "away", 50, 0, "GK"), make("cb", "away", 20, 0, "CB")];
    expect(isInOffsidePosition(st, -10, defenders)).toBe(false);
  });

  it("lists offside teammates at the moment of the pass", () => {
    const passer = make("cm", "home", 8, 0, "CM");
    const onside = make("w", "home", 24, 12, "RW");
    const off = make("st", "home", 36, 0, "ST");
    const defenders = [make("gk", "away", 50, 0, "GK"), make("cb", "away", 30, 0, "CB")];
    expect(playersOffsideAtPass(passer, [passer, onside, off], defenders, passer.x)).toEqual(["st"]);
  });
});
