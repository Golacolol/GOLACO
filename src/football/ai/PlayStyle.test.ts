import { describe, expect, it } from "vitest";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import {
  PLAY_STYLE_IDS,
  PLAY_STYLE_LABELS,
  derivePlayStyle,
  isPlayStyleId,
  playStylePassWeights,
  playStyleProfile,
  resolvePlayStyle,
} from "./PlayStyle";

const ATTRS: PlayerAttributes = {
  pace: 70,
  passing: 70,
  longPassing: 68,
  vision: 70,
  control: 70,
  dribbling: 68,
  shooting: 68,
  finishing: 68,
  shotPower: 70,
  longShots: 65,
  defending: 60,
  strength: 70,
  stamina: 75,
  composure: 70,
  setPieces: 65,
};

function makePlayers(overall: number, n = 10): Player[] {
  return Array.from({ length: n }, (_, i) => {
    const p = new Player({
      id: `p${i}`,
      name: `P${i}`,
      displayName: `P${i}`,
      shirtNumber: i + 1,
      position: i === 0 ? "GK" : "CM",
      slot: i === 0 ? "GK" : "CM",
      side: "home",
      attrs: ATTRS,
      overall,
    });
    return p;
  });
}

describe("PlayStyle", () => {
  it("includes counter as a fifth style", () => {
    expect(PLAY_STYLE_IDS).toContain("counter");
    expect(PLAY_STYLE_LABELS.counter).toBe("Counter");
    expect(PLAY_STYLE_LABELS.auto).toBe("Auto");
    const c = playStyleProfile("counter");
    expect(c.standOffBias).toBeGreaterThan(playStyleProfile("direct").standOffBias);
    expect(c.transitionBurst).toBeGreaterThan(playStyleProfile("possession").transitionBurst);
    expect(c.longBias).toBeLessThan(playStyleProfile("direct").longBias);
  });

  it("resolvePlayStyle honors override and Auto falls back to derive", () => {
    const weak = makePlayers(62);
    const auto = resolvePlayStyle({ league: "LEAGUE_ONE", teamType: "CURRENT_TEAM", id: "t", name: "T" }, weak);
    const forced = resolvePlayStyle(
      { league: "LEAGUE_ONE", teamType: "CURRENT_TEAM", id: "t", name: "T" },
      weak,
      "possession",
    );
    expect(forced.id).toBe("possession");
    expect(isPlayStyleId(auto.id)).toBe(true);
    expect(resolvePlayStyle(null, weak, null).id).toBe(derivePlayStyle(null, weak).id);
  });

  it("derive maps mid-tier toward counter", () => {
    const mid = makePlayers(72);
    const style = derivePlayStyle({ league: "LEAGUE_ONE", teamType: "CURRENT_TEAM", id: "t", name: "T" }, mid);
    expect(["counter", "direct", "balanced", "routeOne"]).toContain(style.id);
  });

  it("pass weights amplify possession short vs route-one long", () => {
    const poss = playStylePassWeights(playStyleProfile("possession"), { phase: "build" });
    const route = playStylePassWeights(playStyleProfile("routeOne"), { phase: "attack" });
    expect(poss.shortBonus).toBeGreaterThan(route.shortBonus);
    expect(route.longBonus).toBeGreaterThan(poss.longBonus);
    expect(poss.buildupCrush).toBeLessThan(route.buildupCrush);

    const counterT = playStylePassWeights(playStyleProfile("counter"), { phase: "transition" });
    const counterB = playStylePassWeights(playStyleProfile("counter"), { phase: "build" });
    expect(counterT.throughBonus).toBeGreaterThan(counterB.throughBonus);
  });
});
