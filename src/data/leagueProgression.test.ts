import { describe, expect, it } from "vitest";
import teamsJson from "../../public/data/teams.json";
import type { FixtureRecord, TeamRecord } from "./schema";
import { nextFixtureForTeam, buildEnglishLeagueFixtures } from "./leagueSchedule";
import { standingsFor } from "../football/league/Standings";
import { applyUserMatchweek, simulateDatesBefore, simulateScore, simulateUserMatchweek } from "../football/league/Simulate";

const teams = teamsJson as TeamRecord[];
const clubs: TeamRecord[] = [
  team("alpha", "Alpha", "LEAGUE_ONE"),
  team("bravo", "Bravo", "LEAGUE_ONE"),
  team("charlie", "Charlie", "LEAGUE_ONE"),
  team("delta", "Delta", "LEAGUE_ONE"),
];

describe("league standings", () => {
  it("orders by points, then goal difference, then goals scored", () => {
    const fixtures: FixtureRecord[] = [
      played("a", "alpha", "bravo", "2026-08-08", 2, 0),
      played("b", "charlie", "delta", "2026-08-08", 1, 1),
      played("c", "alpha", "charlie", "2026-08-15", 1, 0),
      played("d", "bravo", "delta", "2026-08-15", 0, 3),
    ];
    const table = standingsFor(fixtures, clubs, "LEAGUE_ONE");
    expect(table.map((r) => r.teamId)).toEqual(["alpha", "delta", "charlie", "bravo"]);
    expect(table[0]).toMatchObject({ pts: 6, played: 2, gd: 3, gf: 3 });
    expect(table[1]).toMatchObject({ pts: 4, played: 2, gf: 4, ga: 1 });
  });
});

describe("league simulation", () => {
  it("is deterministic for a fixture id", () => {
    const fixture = unplayed("x", "alpha", "bravo", "2026-08-08");
    const a = simulateScore(fixture, 78, 70);
    const b = simulateScore(fixture, 78, 70);
    expect(a).toEqual(b);
  });

  it("records the user result and simulates the rest of that date", () => {
    const fixtures: FixtureRecord[] = [
      unplayed("user", "alpha", "bravo", "2026-08-08"),
      unplayed("other", "charlie", "delta", "2026-08-08"),
      unplayed("later", "alpha", "charlie", "2026-08-15"),
    ];
    applyUserMatchweek(fixtures, "user", 2, 1, () => 72);
    expect(fixtures[0]).toMatchObject({ played: true, homeScore: 2, awayScore: 1, simulated: false });
    expect(fixtures[1].played).toBe(true);
    expect(fixtures[1].simulated).toBe(true);
    expect(typeof fixtures[1].homeScore).toBe("number");
    expect(fixtures[2].played).toBeFalsy();
  });

  it("simulates the user fixture and the rest of that matchweek", () => {
    const fixtures: FixtureRecord[] = [
      unplayed("user", "alpha", "bravo", "2026-08-08"),
      unplayed("other", "charlie", "delta", "2026-08-08"),
      unplayed("later", "alpha", "charlie", "2026-08-15"),
    ];
    const recorded = simulateUserMatchweek(fixtures, "user", () => 72);
    expect(recorded).toMatchObject({ id: "user", played: true, simulated: true });
    expect(fixtures[0].simulated).toBe(true);
    expect(fixtures[1].played).toBe(true);
    expect(fixtures[1].simulated).toBe(true);
    expect(fixtures[2].played).toBeFalsy();
  });

  it("catch-up simulates dates before today without touching the next matchweek", () => {
    const fixtures: FixtureRecord[] = [
      unplayed("past-a", "alpha", "bravo", "2026-08-08"),
      unplayed("past-b", "charlie", "delta", "2026-08-08"),
      unplayed("next", "alpha", "charlie", "2026-08-15"),
    ];
    simulateDatesBefore(fixtures, "2026-08-15", () => 70);
    expect(fixtures[0].played).toBe(true);
    expect(fixtures[1].played).toBe(true);
    expect(fixtures[2].played).toBeFalsy();
  });

  it("skips played fixtures when finding the next remaining match", () => {
    const fixtures: FixtureRecord[] = [
      played("done", "alpha", "bravo", "2026-08-08", 1, 0),
      unplayed("next", "alpha", "charlie", "2026-08-15"),
    ];
    const next = nextFixtureForTeam(fixtures, "alpha", "2026-08-01", { skipPlayed: true });
    expect(next?.id).toBe("next");
  });

  it("after official results, Argyle's next remaining league game is Stevenage away", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const next = nextFixtureForTeam(fixtures, "plymouth_argyle_current", "2026-10-18", { skipPlayed: true });
    expect(next?.date).toBe("2026-10-20");
    expect(next?.homeTeamId).toBe("stevenage_current");
    expect(next?.awayTeamId).toBe("plymouth_argyle_current");
    expect(next?.played).toBeFalsy();
    expect(next?.official).toBe(true);
    const barnsley = fixtures.find(
      (f) => f.homeTeamId === "plymouth_argyle_current" && f.awayTeamId === "barnsley_current" && f.date === "2026-09-12",
    );
    expect(barnsley).toMatchObject({ played: true, homeScore: 3, awayScore: 0, simulated: false, official: true });
    const wimbledon = fixtures.find(
      (f) => f.homeTeamId === "plymouth_argyle_current" && f.awayTeamId === "afc_wimbledon_current",
    );
    expect(wimbledon).toMatchObject({
      date: "2026-10-10",
      played: true,
      homeScore: 2,
      awayScore: 1,
      simulated: false,
      official: true,
    });
    const huddersfield = fixtures.find(
      (f) => f.homeTeamId === "plymouth_argyle_current" && f.awayTeamId === "huddersfield_town_current",
    );
    expect(huddersfield).toMatchObject({
      date: "2026-10-17",
      played: true,
      homeScore: 0,
      awayScore: 2,
      simulated: false,
      official: true,
    });
  });

  it("uses official 2026/27 results for League One, Championship and Premier League tables", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const leagueOne = standingsFor(fixtures, teams, "LEAGUE_ONE");
    expect(leagueOne[0]).toMatchObject({ teamId: "bradford_city_current", pts: 20, played: 10 });
    expect(leagueOne.find((r) => r.teamId === "plymouth_argyle_current")).toMatchObject({
      pts: 19,
      played: 11,
      won: 6,
      gd: 4,
    });
    // Full midweek card must come from TheFishy, not the round-robin filler.
    const oct20 = fixtures.filter((f) => f.competition === "League One" && f.date === "2026-10-20");
    expect(oct20).toHaveLength(11);
    expect(oct20.every((f) => f.official && !f.simulated)).toBe(true);
    expect(oct20.some((f) => f.homeTeamId === "stevenage_current" && f.awayTeamId === "plymouth_argyle_current")).toBe(
      true,
    );
    expect(oct20.some((f) => f.homeTeamId === "afc_wimbledon_current" && f.awayTeamId === "mansfield_town_current")).toBe(
      true,
    );
    const championship = standingsFor(fixtures, teams, "CHAMPIONSHIP");
    expect(championship[0]).toMatchObject({ teamId: "swansea_city_current", pts: 23, played: 11 });
    // Southampton carry a 4-point deduction in POINTS_DEDUCTIONS.
    const saints = championship.find((r) => r.teamId === "southampton_current");
    expect(saints?.played).toBeGreaterThanOrEqual(10);
    expect(saints!.pts).toBe(saints!.won * 3 + saints!.drawn - 4);
    const premier = standingsFor(fixtures, teams, "PREMIER_LEAGUE");
    expect(premier[0]).toMatchObject({ teamId: "manchester_city_current", pts: 21, played: 7 });
    expect(premier[1]).toMatchObject({ teamId: "arsenal_current", pts: 18, played: 7 });
    expect(premier.find((r) => r.teamId === "liverpool_current")).toMatchObject({ pts: 12, played: 7 });
    const wolvesBlb = fixtures.find(
      (f) =>
        f.homeTeamId === "wolverhampton_wanderers_current" &&
        f.awayTeamId === "blackburn_rovers_current" &&
        f.date === "2026-08-14",
    );
    expect(wolvesBlb).toMatchObject({ played: true, homeScore: 2, awayScore: 2, official: true });
  });

  it("does not invent scores for official fixtures during catch-up", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const listed = fixtures.find(
      (f) =>
        f.official &&
        !f.played &&
        f.date === "2026-10-20" &&
        f.homeTeamId === "stevenage_current" &&
        f.awayTeamId === "plymouth_argyle_current",
    );
    expect(listed).toBeTruthy();
    simulateDatesBefore(fixtures, "2026-10-21", () => 72);
    expect(listed?.played).toBeFalsy();
  });

  it("keeps real-world tables after casual catch-up (no invented remainder scores)", () => {
    const fixtures = buildEnglishLeagueFixtures(teams);
    const before = {
      pl: standingsFor(fixtures, teams, "PREMIER_LEAGUE").slice(0, 3),
      ch: standingsFor(fixtures, teams, "CHAMPIONSHIP").slice(0, 3),
      l1: standingsFor(fixtures, teams, "LEAGUE_ONE").slice(0, 3),
    };
    expect(fixtures.some((f) => f.id.includes("rem_") && f.date < "2026-10-16" && !f.played)).toBe(false);
    simulateDatesBefore(fixtures, "2026-10-16", () => 72);
    expect(standingsFor(fixtures, teams, "PREMIER_LEAGUE").slice(0, 3)).toEqual(before.pl);
    expect(standingsFor(fixtures, teams, "CHAMPIONSHIP").slice(0, 3)).toEqual(before.ch);
    expect(standingsFor(fixtures, teams, "LEAGUE_ONE").slice(0, 3)).toEqual(before.l1);
    expect(standingsFor(fixtures, teams, "PREMIER_LEAGUE").find((r) => r.teamId === "liverpool_current")).toMatchObject({
      pts: 12,
      played: 7,
    });
  });
});

function team(id: string, name: string, league: TeamRecord["league"]): TeamRecord {
  return {
    id,
    name,
    abbreviation: name.slice(0, 3).toUpperCase(),
    teamType: "CURRENT_TEAM",
    primaryColor: "#333333",
    secondaryColor: "#ffffff",
    defaultKit: { shirt: "#333333", shorts: "#ffffff", socks: "#333333" },
    goalkeeperKit: { shirt: "#111111", shorts: "#111111", socks: "#111111" },
    defaultStadiumId: "home_park",
    defaultFormation: "4-4-2",
    league,
  };
}

function base(id: string, home: string, away: string, date: string): FixtureRecord {
  return {
    id,
    homeTeamId: home,
    awayTeamId: away,
    venueId: "home_park",
    competition: "League One",
    date,
    time: "15:00",
    durationSeconds: 600,
  };
}

function unplayed(id: string, home: string, away: string, date: string): FixtureRecord {
  return base(id, home, away, date);
}

function played(id: string, home: string, away: string, date: string, homeScore: number, awayScore: number): FixtureRecord {
  return { ...base(id, home, away, date), played: true, homeScore, awayScore, simulated: true };
}
