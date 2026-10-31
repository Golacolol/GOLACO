import { describe, expect, it } from "vitest";
import { kitsClash, resolveMatchKits, deriveAwayKit } from "./KitClash";
import type { TeamRecord } from "../../data/schema";

function team(partial: Partial<TeamRecord> & Pick<TeamRecord, "id" | "defaultKit">): TeamRecord {
  return {
    name: partial.name ?? partial.id,
    abbreviation: "T",
    teamType: "CURRENT_TEAM",
    primaryColor: partial.defaultKit.shirt,
    secondaryColor: partial.secondaryColor ?? "#ffffff",
    goalkeeperKit: { shirt: "#222222", shorts: "#111111", socks: "#222222" },
    defaultStadiumId: "home_park",
    defaultFormation: "4-4-2",
    ...partial,
  };
}

describe("Kit clash", () => {
  it("detects similar shirt colours", () => {
    expect(
      kitsClash(
        { shirt: "#007A3D", shorts: "#fff", socks: "#007A3D" },
        { shirt: "#008040", shorts: "#fff", socks: "#008040" },
      ),
    ).toBe(true);
    expect(
      kitsClash(
        { shirt: "#007A3D", shorts: "#fff", socks: "#007A3D" },
        { shirt: "#ffffff", shorts: "#111", socks: "#fff" },
      ),
    ).toBe(false);
  });

  it("switches the away side to awayKit when home shirts clash", () => {
    const home = team({
      id: "green_a",
      defaultKit: { shirt: "#007A3D", shorts: "#ffffff", socks: "#007A3D" },
    });
    const away = team({
      id: "green_b",
      defaultKit: { shirt: "#0A8F4A", shorts: "#ffffff", socks: "#0A8F4A" },
      awayKit: { shirt: "#ffffff", shorts: "#111111", socks: "#ffffff", numberColor: "#111111" },
    });
    const kits = resolveMatchKits(home, away);
    expect(kits.home.shirt).toBe("#007A3D");
    expect(kits.away.shirt).toBe("#ffffff");
    expect(kits.clash).toBe(true);
    expect(kits.away.shirtAsset).toContain("green_b_away");
  });

  it("keeps away home kit when colours are distinct", () => {
    const home = team({
      id: "green",
      defaultKit: { shirt: "#007A3D", shorts: "#ffffff", socks: "#007A3D" },
    });
    const away = team({
      id: "red",
      defaultKit: { shirt: "#C8102E", shorts: "#ffffff", socks: "#C8102E" },
      awayKit: { shirt: "#111111", shorts: "#111111", socks: "#111111" },
    });
    const kits = resolveMatchKits(home, away);
    expect(kits.away.shirt).toBe("#C8102E");
    expect(kits.clash).toBe(false);
    expect(kits.away.shirtAsset).toContain("red_home");
  });

  it("honours Kit Select overrides", () => {
    const home = team({
      id: "green",
      defaultKit: { shirt: "#007A3D", shorts: "#ffffff", socks: "#007A3D" },
    });
    const away = team({
      id: "red",
      defaultKit: { shirt: "#C8102E", shorts: "#ffffff", socks: "#C8102E" },
      awayKit: { shirt: "#111111", shorts: "#111111", socks: "#111111" },
    });
    expect(resolveMatchKits(home, away, { awayChoice: "away" }).away.shirt).toBe("#111111");
    expect(resolveMatchKits(home, away, { homeChoice: "away" }).home.shirt).not.toBe("#007A3D");
  });

  it("keeps opposition on home kit when user forces away and colours still differ", () => {
    const home = team({
      id: "green",
      defaultKit: { shirt: "#007A3D", shorts: "#ffffff", socks: "#007A3D" },
      awayKit: { shirt: "#ffffff", shorts: "#007A3D", socks: "#ffffff" },
    });
    const away = team({
      id: "red",
      defaultKit: { shirt: "#C8102E", shorts: "#ffffff", socks: "#C8102E" },
      awayKit: { shirt: "#111111", shorts: "#111111", socks: "#111111" },
    });
    const kits = resolveMatchKits(home, away, { homeChoice: "away" });
    expect(kits.home.shirt.toLowerCase()).toBe("#ffffff");
    expect(kits.away.shirt).toBe("#C8102E");
  });

  it("switches opposition off home when user away kit would clash", () => {
    const home = team({
      id: "green",
      defaultKit: { shirt: "#007A3D", shorts: "#ffffff", socks: "#007A3D" },
      awayKit: { shirt: "#C8102E", shorts: "#ffffff", socks: "#C8102E" },
    });
    const away = team({
      id: "red",
      defaultKit: { shirt: "#C8102E", shorts: "#ffffff", socks: "#C8102E" },
      awayKit: { shirt: "#111111", shorts: "#111111", socks: "#111111" },
    });
    const kits = resolveMatchKits(home, away, { homeChoice: "away" });
    expect(kits.home.shirt).toBe("#C8102E");
    expect(kits.away.shirt).toBe("#111111");
  });

  it("derives an away kit when none is authored", () => {
    const t = team({
      id: "x",
      secondaryColor: "#ffffff",
      defaultKit: { shirt: "#007A3D", shorts: "#ffffff", socks: "#007A3D" },
    });
    const away = deriveAwayKit(t);
    expect(away.shirt.toLowerCase()).toBe("#ffffff");
  });
});
