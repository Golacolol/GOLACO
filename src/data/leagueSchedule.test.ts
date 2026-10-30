import { describe, expect, it } from "vitest";
import teamsJson from "../../public/data/teams.json";
import type { TeamRecord } from "./schema";
import {
  buildEnglishLeagueFixtures,
  clubBadge,
  nextFixtureForTeam,
  roundRobinRounds,
  SEASON_START,
} from "./leagueSchedule";

const teams = teamsJson as TeamRecord[];

describe("league schedule", () => {
  it("pairs every club once per round without playing itself", () => {
    const ids = ["a", "b", "c", "d"];
    const rounds = roundRobinRounds(ids);
    expect(rounds).toHaveLength(3);
    for (const round of rounds) {
      const seen = new Set<string>();
      for (const [h, a] of round) {
        expect(h).not.toBe(a);
        expect(seen.has(h)).toBe(false);
        expect(seen.has(a)).toBe(false);
        seen.add(h);
        seen.add(a);
      }
      expect(seen.size).toBe(4);
    }
  });

  it("builds a full home-and-away season for all five domestic leagues", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const count = (league: string) => teams.filter((t) => t.league === league && t.teamType === "CURRENT_TEAM").length;
    expect(fixtures.filter((f) => f.competition === "Premier League")).toHaveLength(count("PREMIER_LEAGUE") * (count("PREMIER_LEAGUE") - 1));
    expect(fixtures.filter((f) => f.competition === "Championship")).toHaveLength(count("CHAMPIONSHIP") * (count("CHAMPIONSHIP") - 1));
    expect(fixtures.filter((f) => f.competition === "League One")).toHaveLength(count("LEAGUE_ONE") * (count("LEAGUE_ONE") - 1));
    expect(fixtures.filter((f) => f.competition === "La Liga")).toHaveLength(count("LA_LIGA") * (count("LA_LIGA") - 1));
    expect(fixtures.filter((f) => f.competition === "Serie A")).toHaveLength(count("SERIE_A") * (count("SERIE_A") - 1));
    const argyle = fixtures.filter((f) => f.homeTeamId === "plymouth_argyle_current" || f.awayTeamId === "plymouth_argyle_current");
    expect(argyle).toHaveLength(46);
    expect(argyle.every((f) => f.competition === "League One")).toBe(true);
    const home = argyle.find((f) => f.homeTeamId === "plymouth_argyle_current")!;
    const argyleTeam = teams.find((t) => t.id === "plymouth_argyle_current")!;
    expect(home.venueId).toBe(argyleTeam.defaultStadiumId);
    expect(fixtures.some((f) => f.date <= SEASON_START && f.played)).toBe(true);
  });

  it("returns the next listed match for a club on or after a date", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const next = nextFixtureForTeam(fixtures, "arsenal_current", "2026-09-07", { skipPlayed: true });
    expect(next).toBeTruthy();
    expect(next!.homeTeamId === "arsenal_current" || next!.awayTeamId === "arsenal_current").toBe(true);
    expect(next!.date >= "2026-09-07").toBe(true);
    expect(next!.competition).toBe("Premier League");
    expect(next!.played).toBeFalsy();
    const venueTeam = teams.find((t) => t.id === next!.homeTeamId)!;
    expect(next!.venueId).toBe(venueTeam.defaultStadiumId);
  });

  it("keeps PAFC on the Argyle badge", () => {
    expect(clubBadge({ id: "plymouth_argyle_current", abbreviation: "ARG" })).toBe("PAFC");
    expect(clubBadge({ id: "arsenal_current", abbreviation: "ARS" })).toBe("ARS");
  });

  it("does not schedule a club twice on the same date", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const seen = new Set<string>();
    for (const fixture of fixtures) {
      const home = `${fixture.date}|${fixture.homeTeamId}`;
      const away = `${fixture.date}|${fixture.awayTeamId}`;
      expect(seen.has(home)).toBe(false);
      expect(seen.has(away)).toBe(false);
      seen.add(home);
      seen.add(away);
    }
  });

  it("records the full League One card for 12 September, including Argyle's win", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const week = fixtures.filter((f) => f.competition === "League One" && f.date === "2026-09-12");
    expect(week).toHaveLength(11);
    expect(week.some((f) => f.homeTeamId === "plymouth_argyle_current" && f.awayTeamId === "barnsley_current")).toBe(true);
    expect(week.every((f) => f.played && f.official && !f.simulated)).toBe(true);
    const argyle = week.find((f) => f.homeTeamId === "plymouth_argyle_current")!;
    expect(argyle).toMatchObject({ homeScore: 3, awayScore: 0 });
  });

  it("includes midweek League One and Championship fixtures in the official calendar", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const midweek = fixtures.filter(
      (f) =>
        f.official &&
        f.played &&
        ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"].includes(f.date),
    );
    expect(midweek.some((f) => f.homeTeamId === "stevenage_current" && f.awayTeamId === "luton_town_current")).toBe(true);
    expect(midweek.some((f) => f.homeTeamId === "bromley_current" && f.awayTeamId === "afc_wimbledon_current")).toBe(true);
    expect(midweek.some((f) => f.homeTeamId === "southampton_current" && f.awayTeamId === "swansea_city_current")).toBe(true);
    expect(midweek.some((f) => f.homeTeamId === "west_ham_united_current" && f.awayTeamId === "wrexham_current")).toBe(true);
  });
});
