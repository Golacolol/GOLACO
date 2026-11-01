import { describe, expect, it } from "vitest";
import type { TeamRecord } from "../data/schema";
import {
  buildMenuTeamOptions,
  clubBaseName,
  erasForClub,
  findTeamOption,
  formatEraRoll,
  secondaryDialLabel,
  teamsInGroup,
  uniqueClubsInGroup,
} from "./menuTeamSelect";

function team(partial: Partial<TeamRecord> & Pick<TeamRecord, "id" | "name">): TeamRecord {
  return {
    abbreviation: "X",
    shortName: partial.name,
    defaultStadiumId: "ground",
    primaryColor: "#000",
    secondaryColor: "#fff",
    defaultKit: { primary: "#000", secondary: "#fff", socks: "#000" },
    teamType: "CURRENT_TEAM",
    ...partial,
  } as TeamRecord;
}

describe("menuTeamSelect", () => {
  it("strips era suffixes from classic display names", () => {
    expect(clubBaseName("Real Madrid — 2002/03 Galácticos")).toBe("Real Madrid");
    expect(clubBaseName("Chelsea — 2004/05 Mourinho")).toBe("Chelsea");
  });

  it("formats season rolls as short dates, never nicknames", () => {
    expect(formatEraRoll("2004/05")).toBe("04-05");
    expect(formatEraRoll("1991/92")).toBe("91-92");
    expect(formatEraRoll("2000")).toBe("00");
    expect(formatEraRoll("2021-22")).toBe("21-22");
    expect(formatEraRoll("Chelsea — 2004/05 Mourinho")).toBe("04-05");
    expect(formatEraRoll("101")).toBe("101");
    expect(formatEraRoll("FANS")).toBe("FANS");
  });

  it("keeps Argyle fans / historic sides under Plymouth Argyle even with stale names", () => {
    const options = buildMenuTeamOptions([
      team({
        id: "classic_plymouth_argyle_1995_96",
        name: "Plymouth Argyle — 1995/96",
        teamType: "HISTORIC_TEAM",
        historicSeason: "1995/96",
      }),
      team({
        id: "argyle_historic_sample",
        name: "Argyle 101 Legends",
        teamType: "HISTORIC_TEAM",
        historicSeason: "101",
      }),
      team({
        id: "argyle_fans_xi",
        name: "Argyle Fans XI",
        teamType: "FANS_TEAM",
        historicSeason: "FANSXI",
        fanTeam: true,
      }),
    ]);
    const clubs = uniqueClubsInGroup(options, "CLASSIC");
    expect(clubs).toHaveLength(1);
    expect(clubs[0]!.clubKey).toBe("plymouth argyle");
    expect(clubs[0]!.label).toBe("Plymouth Argyle");
    expect(erasForClub(options, "plymouth argyle").map((o) => o.id)).toEqual([
      "argyle_historic_sample",
      "classic_plymouth_argyle_1995_96",
      "argyle_fans_xi",
    ]);
  });

  it("lists club-only Classic dial labels with date eras; keeps full TeamRecord names elsewhere", () => {
    const options = buildMenuTeamOptions([
      team({ id: "arsenal_current", name: "Arsenal", league: "PREMIER_LEAGUE", teamType: "CURRENT_TEAM" }),
      team({
        id: "classic_chelsea_2004_05",
        name: "Chelsea — 2004/05 Mourinho",
        teamType: "HISTORIC_TEAM",
        historicSeason: "2004/05",
      }),
      team({
        id: "classic_chelsea_2011_12",
        name: "Chelsea — 2011/12",
        teamType: "HISTORIC_TEAM",
        historicSeason: "2011/12",
      }),
      team({
        id: "classic_realmadrid_2002_03",
        name: "Real Madrid — 2002/03 Galácticos",
        teamType: "HISTORIC_TEAM",
        historicSeason: "2002/03",
      }),
      team({
        id: "argyle_historic_sample",
        name: "Plymouth Argyle — 2021/22",
        teamType: "HISTORIC_TEAM",
        historicSeason: "2021/22",
      }),
      team({
        id: "argyle_fans_xi",
        name: "Plymouth Argyle — FANS",
        teamType: "FANS_TEAM",
        historicSeason: "FANS",
        fanTeam: true,
      }),
    ]);

    expect(findTeamOption(options, "arsenal_current")).toMatchObject({
      label: "Arsenal",
      group: "PREMIER_LEAGUE",
    });

    const classic = teamsInGroup(options, "CLASSIC");
    expect(classic.map((o) => o.label)).toEqual([
      "Chelsea",
      "Chelsea",
      "Plymouth Argyle",
      "Plymouth Argyle",
      "Real Madrid",
    ]);
    expect(classic.map((o) => o.eraLabel)).toEqual(["04-05", "11-12", "21-22", "FANS", "02-03"]);
    expect(classic.every((o) => !o.eraLabel.includes("Mourinho"))).toBe(true);
    expect(classic.every((o) => !o.label.includes("Mourinho"))).toBe(true);

    const chelseaEras = erasForClub(options, "chelsea");
    expect(chelseaEras.map((o) => o.eraLabel)).toEqual(["04-05", "11-12"]);
    expect(chelseaEras.map((o) => o.id)).toEqual([
      "classic_chelsea_2004_05",
      "classic_chelsea_2011_12",
    ]);

    const argyleEras = erasForClub(options, "plymouth argyle");
    expect(argyleEras.map((o) => o.eraLabel)).toEqual(["21-22", "FANS"]);
    expect(argyleEras.map((o) => o.id)).toEqual(["argyle_historic_sample", "argyle_fans_xi"]);

    const clubs = uniqueClubsInGroup(options, "CLASSIC");
    expect(clubs.map((o) => o.label)).toEqual(["Chelsea", "Plymouth Argyle", "Real Madrid"]);
    expect(clubs.find((o) => o.clubKey === "chelsea")?.id).toBe("classic_chelsea_2004_05");

    expect(secondaryDialLabel(classic[0]!)).toBe("Classics");
    expect(secondaryDialLabel(options[0]!)).toBe("Premier League");
  });
});
