import { describe, expect, it } from "vitest";
import {
  clubFilterLabel,
  isMiTeamBenchSlot,
  parseFilter,
  positionsForSlot,
  serializeFilter,
  teamMatchesFilter,
} from "./MiTeamPool";
import type { TeamRecord } from "../../data/schema";

function team(partial: Partial<TeamRecord> & { id: string }): TeamRecord {
  return {
    name: partial.name ?? partial.id,
    abbreviation: "TST",
    teamType: partial.teamType ?? "CURRENT_TEAM",
    primaryColor: "#fff",
    secondaryColor: "#000",
    defaultKit: { shirt: "#fff", shorts: "#000", socks: "#fff" },
    goalkeeperKit: { shirt: "#ff0", shorts: "#000", socks: "#ff0" },
    defaultStadiumId: "home_park",
    defaultFormation: "4-4-2",
    ...partial,
  };
}

describe("MiTeamPool", () => {
  it("maps XI slots to the correct line without cross-contamination", () => {
    expect(positionsForSlot("GK")).toEqual(["GK"]);
    expect(positionsForSlot("ST")).toEqual(["ST"]);
    expect(positionsForSlot("RCB")).toEqual(["CB"]);
    expect(positionsForSlot("RM")).toEqual(["RM", "RW"]);
    expect(positionsForSlot("LM")).toEqual(["LM", "LW"]);
    expect(positionsForSlot("RCM")).toEqual(["CM", "DM", "AM"]);
    // Mid packs must never include full-backs / centre-backs.
    expect(positionsForSlot("RM")).not.toContain("RB");
    expect(positionsForSlot("LM")).not.toContain("LB");
    expect(positionsForSlot("RCM")).not.toContain("CB");
    expect(positionsForSlot("RB")).not.toContain("RM");
  });

  it("treats substitute slots as any-position packs", () => {
    expect(isMiTeamBenchSlot("BENCH_1")).toBe(true);
    expect(isMiTeamBenchSlot("BENCH_7")).toBe(true);
    expect(isMiTeamBenchSlot("RCM")).toBe(false);
    const bench = positionsForSlot("BENCH_1");
    expect(bench).toEqual(expect.arrayContaining(["GK", "CB", "CM", "ST", "RB", "LW"]));
    expect(bench.length).toBeGreaterThan(positionsForSlot("RCM").length);
  });

  it("serializes and parses pool filters", () => {
    expect(serializeFilter({ kind: "all" })).toBe("all");
    expect(parseFilter("classic")).toEqual({ kind: "classic" });
    expect(parseFilter("league:LA_LIGA")).toEqual({ kind: "league", league: "LA_LIGA" });
    expect(parseFilter("club:arsenal_current")).toEqual({ kind: "club", teamId: "arsenal_current" });
  });

  it("filters teams by league / classic / club", () => {
    const pl = team({ id: "a", league: "PREMIER_LEAGUE", teamType: "CURRENT_TEAM" });
    const classic = team({ id: "classic_x", teamType: "HISTORIC_TEAM" });
    expect(teamMatchesFilter(pl, { kind: "league", league: "PREMIER_LEAGUE" })).toBe(true);
    expect(teamMatchesFilter(pl, { kind: "league", league: "SERIE_A" })).toBe(false);
    expect(teamMatchesFilter(classic, { kind: "classic" })).toBe(true);
    expect(teamMatchesFilter(pl, { kind: "club", teamId: "a" })).toBe(true);
    expect(teamMatchesFilter(team({ id: "miteam_user", teamType: "CUSTOM_TEAM", custom: true }), { kind: "all" })).toBe(
      false,
    );
  });

  it("labels classic clubs with eras so repeats stay distinct", () => {
    const a = team({
      id: "classic_plymouth_argyle_1995_96",
      name: "Plymouth Argyle — 1995/96",
      teamType: "HISTORIC_TEAM",
      historicSeason: "1995/96",
    });
    const b = team({
      id: "classic_plymouth_argyle_2003_04",
      name: "Plymouth Argyle — 2003/04",
      teamType: "HISTORIC_TEAM",
      historicSeason: "2003/04",
    });
    const current = team({
      id: "argyle_current",
      name: "Plymouth Argyle",
      teamType: "CURRENT_TEAM",
      league: "LEAGUE_ONE",
    });
    expect(clubFilterLabel(a)).toBe("Plymouth Argyle 95-96");
    expect(clubFilterLabel(b)).toBe("Plymouth Argyle 03-04");
    expect(clubFilterLabel(current)).toBe("Plymouth Argyle");
  });
});
