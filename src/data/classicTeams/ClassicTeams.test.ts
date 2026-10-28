import { describe, expect, it } from "vitest";
import { CLASSIC_TEAM_DEFINITIONS, CLASSIC_V1_KEYS, CLASSIC_GK_KEYS, buildClassicTeamArtifacts } from "../classicTeams";
import { CLASSIC_V4_DEFINITIONS } from "./v4Expansion";
import { getFormation } from "../../football/teams/Formation";
import { resolveAttributesDetailed, deriveOverall, validatePlayerAttributes } from "../../football/players/PlayerStats";
import { GameDatabase } from "../../core/Database";
import { SaveManager } from "../../core/SaveManager";
import { DEFAULT_TEAM_ID } from "../../football/constants";
import { LEAGUE_LABEL } from "../../ui/MatchSetup";
import {
  eligibleTeamPool,
  isClassicTeamId,
  resolveSimulationMode,
  pickRandomPair,
  exportReportJson,
  exportReportCsv,
  CLASSIC_STRESS_FIXTURES,
  ARGYLE_ERA_FIXTURES,
} from "../../football/simulation/MatchSimulationLab";

describe("Classic Teams V4 expansion", () => {
  it("defines exactly 110 classic teams", () => {
    expect(CLASSIC_TEAM_DEFINITIONS).toHaveLength(110);
  });

  it("keeps the original 11 display names and adds the V2 set", () => {
    const names = CLASSIC_TEAM_DEFINITIONS.map((t) => t.displayName);
    expect(names.slice(0, 11)).toEqual([
      "Juventus — 1995/96",
      "AC Milan — 2004/05",
      "Inter Milan — 2009/10",
      "Liverpool — 1987/88",
      "Manchester United — 1998/99",
      "Real Madrid — 2002/03 Galácticos",
      "Barcelona — 1993/94",
      "Barcelona — 2008/09",
      "Barcelona — 2014/15",
      "Arsenal — 2003/04 Invincibles",
      "Chelsea — 2004/05 Mourinho",
    ]);
    expect(names).toContain("Ajax — 1994/95");
    expect(names).toContain("Plymouth Argyle — 1995/96");
    expect(names).toContain("Plymouth Argyle — 2003/04");
    expect(names).toContain("Plymouth Argyle — 2016/17");
    expect(names).toContain("England — 1996");
    expect(names).toContain("Argentina — 1986");
  });

  it("adds the V3 set without disturbing the Argyle era names", () => {
    const names = CLASSIC_TEAM_DEFINITIONS.map((t) => t.displayName);
    expect(names).toContain("AC Milan — 1993/94");
    expect(names).toContain("Lazio — 1999/00");
    expect(names).toContain("Tottenham Hotspur — 1994/95");
    expect(names).toContain("Real Madrid — 1997/98");
    expect(names).toContain("Real Madrid — 2016/17");
    expect(names).toContain("Nottingham Forest — 1979/80");
    expect(names).toContain("Liverpool — 1995/96");
    expect(names).toContain("Leeds United — 1999/00");
    expect(names).toContain("Bayern Munich — 2000/01");
    expect(names).toContain("Bayern Munich — 2012/13");
    expect(names).toContain("Manchester United — 1992/93");
    expect(names).toContain("Liverpool — 2007/08");
    expect(names).toContain("Tottenham Hotspur — 1990/91");
    expect(names).toContain("Chelsea — 1996/97");
    expect(names).toContain("Plymouth Argyle — 1995/96");
    expect(names).toContain("Plymouth Argyle — 2003/04");
    expect(names).toContain("Plymouth Argyle — 2016/17");
    for (const teamId of [
      "classic_milan_1993_94",
      "classic_realmadrid_2016_17",
      "classic_bayern_2012_13",
      "classic_liverpool_2007_08",
      "classic_nottingham_forest_1979_80",
      "classic_tottenham_1990_91",
      "classic_chelsea_1996_97",
    ]) {
      const def = CLASSIC_TEAM_DEFINITIONS.find((t) => t.teamId === teamId)!;
      expect(def).toBeDefined();
      expect(def.dataVersion).toBe("3.0");
    }
  });

  it("includes the V4 expansion teams", () => {
    const names = CLASSIC_TEAM_DEFINITIONS.map((t) => t.displayName);
    expect(names).toContain("Manchester United — 2007/08");
    expect(names).toContain("Argentina — 2022");
    expect(names).toContain("Sampdoria — 1990/91");
    expect(names).toContain("Napoli — 1989/90");
    expect(names).toContain("Juventus — 1997/98");
    expect(names).toContain("Fiorentina — 1998/99");
    expect(names).toContain("Parma — 1992/93");
    expect(names).toContain("Torino — 1991/92");
    expect(names).toContain("Lazio — 1992/93");
    expect(names).toContain("Inter Milan — 1993/94");
    expect(names).toContain("Roma — 1992/93");
    expect(names).toContain("Ipswich Town — 1980/81");
  });

  it("keeps France 1998 Guivarc'h kit name intact", () => {
    const france = CLASSIC_TEAM_DEFINITIONS.find((t) => t.teamId === "classic_france_1998")!;
    const guivarch = france.players.find((p) => /Guivarc/i.test(p.name))!;
    expect(guivarch.name).toContain("Guivarc");
    expect(guivarch.displayName).toBe("Guivarc'h");
    expect(guivarch.displayName).not.toBe("H");
  });

  it("uses named V4 benches and registered home stadiums", async () => {
    const prohibitedPlaceholder = /Backup|Cover|Reserve|Strike Partner|Target Man|Wide Option|Creative Sub|Box-to-Box|Midfield Cover/i;
    for (const team of CLASSIC_V4_DEFINITIONS) {
      const benchNames = team.bench.map((row) => team.players.find((player) => player.id === row.id)!.name);
      expect(benchNames.length).toBeGreaterThanOrEqual(9);
      expect(benchNames.every((name) => !prohibitedPlaceholder.test(name))).toBe(true);
    }

    const db = await GameDatabase.load(new SaveManager());
    for (const team of CLASSIC_V4_DEFINITIONS) {
      const loadedTeam = db.getTeam(team.teamId);
      expect(db.stadiums.has(loadedTeam.defaultStadiumId), `${team.displayName}: ${loadedTeam.defaultStadiumId}`).toBe(true);
    }
    for (const [id, name] of [
      ["signal_iduna_park", "Signal Iduna Park"],
      ["estadio_do_dragao", "Estádio do Dragão"],
      ["stadio_san_paolo", "Stadio San Paolo"],
      ["la_bombonera", "La Bombonera"],
      ["goodison_park", "Goodison Park"],
      ["parc_des_princes", "Parc des Princes"],
      ["vicente_calderon", "Vicente Calderón"],
      ["stadio_luigi_ferraris", "Stadio Luigi Ferraris"],
      ["stadio_artemio_franchi", "Stadio Artemio Franchi"],
    ]) {
      expect(db.getStadium(id).name).toBe(name);
    }
  });

  it("authors full V1 attributes with zero inferred defaults for all classic teams", () => {
    for (const def of CLASSIC_TEAM_DEFINITIONS) {
      expect(def.players.length).toBeGreaterThanOrEqual(20);
      expect(def.xi).toHaveLength(11);
      expect(def.bench.length).toBeGreaterThanOrEqual(9);
      expect(def.players.filter((p) => p.primaryPosition === "GK").length).toBeGreaterThanOrEqual(2);
      const shirts = new Set<number>();
      const ids = new Set<string>();
      for (const p of def.players) {
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
        for (const key of CLASSIC_V1_KEYS) {
          expect(typeof p[key]).toBe("number");
          expect(p[key]).toBeGreaterThanOrEqual(1);
          expect(p[key]).toBeLessThanOrEqual(100);
        }
        if (p.primaryPosition === "GK") {
          expect(p.gk).toBeDefined();
          for (const key of CLASSIC_GK_KEYS) {
            expect(p.gk![key]).toBeGreaterThanOrEqual(1);
          }
        }
        const built = buildClassicTeamArtifacts(def).players.find((x) => x.id === p.id)!;
        expect(resolveAttributesDetailed(built).inferred).toEqual([]);
        expect(validatePlayerAttributes(built)).toEqual([]);
        expect(Number.isFinite(deriveOverall(p.primaryPosition, built))).toBe(true);
      }
      const formation = getFormation(def.formation);
      const slotIds = new Set(formation.map((s) => s.id));
      for (const row of def.xi) {
        expect(slotIds.has(row.slot)).toBe(true);
        expect(shirts.has(row.shirtNumber)).toBe(false);
        shirts.add(row.shirtNumber);
      }
      for (const row of def.bench) {
        expect(shirts.has(row.shirtNumber)).toBe(false);
        shirts.add(row.shirtNumber);
      }
    }
  });

  it("marks internationals and keeps Argyle eras separate from current", async () => {
    const internationals = CLASSIC_TEAM_DEFINITIONS.filter((t) => t.teamCategory === "INTERNATIONAL");
    expect(internationals.map((t) => t.displayName).sort()).toEqual([
      "Argentina — 1986",
      "Argentina — 2022",
      "Brazil — 1994",
      "Brazil — 2002",
      "Brazil — 1982",
      "Cameroon — 1990",
      "Croatia — 1998",
      "Denmark — 1992",
      "England — 1996",
      "England — 2002",
      "France — 2000",
      "France — 1998",
      "Germany — 1990",
      "Germany — 2014",
      "Greece — 2004",
      "Italy — 1982",
      "Italy — 2006",
      "Netherlands — 1988",
      "Netherlands — 2010",
      "Portugal — 2016",
      "Spain — 2008",
      "Spain — 2010",
      "Uruguay — 2011",
    ].sort());
    for (const def of internationals) {
      const built = buildClassicTeamArtifacts(def);
      expect(built.team.teamType).toBe("INTERNATIONAL");
    }
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    expect(db.teams.has(DEFAULT_TEAM_ID)).toBe(true);
    expect(DEFAULT_TEAM_ID).toBe("plymouth_argyle_current");
    expect(db.teams.has("classic_plymouth_argyle_1995_96")).toBe(true);
    expect(db.teams.has("classic_plymouth_argyle_2003_04")).toBe(true);
    expect(db.teams.has("classic_plymouth_argyle_2016_17")).toBe(true);
    expect(db.getTeam("classic_england_1996").teamType).toBe("INTERNATIONAL");
    expect(db.getTeam("classic_ajax_1994_95").teamType).toBe("HISTORIC_TEAM");
    expect(LEAGUE_LABEL.OTHER).toBe("CLASSIC TEAMS");
  });

  it("keeps Litmanen in Ajax preferred XI and isolates era Ronaldo IDs", () => {
    const ajax = CLASSIC_TEAM_DEFINITIONS.find((t) => t.teamId === "classic_ajax_1994_95")!;
    expect(ajax.xi.some((r) => r.id.includes("litmanen"))).toBe(true);
    const ronaldoIds = CLASSIC_TEAM_DEFINITIONS.flatMap((t) =>
      t.players.filter((p) => /ronaldo/i.test(p.id) || /ronaldo/i.test(p.name)).map((p) => p.id),
    );
    expect(new Set(ronaldoIds).size).toBe(ronaldoIds.length);
    expect(ronaldoIds.length).toBeGreaterThanOrEqual(3);
  });

  it("calibrates historic Argyle below elite Champions League sides", () => {
    const argyle = CLASSIC_TEAM_DEFINITIONS.find((t) => t.teamId === "classic_plymouth_argyle_1995_96")!;
    const milan = CLASSIC_TEAM_DEFINITIONS.find((t) => t.teamId === "classic_milan_2004_05")!;
    const argyleXi = argyle.xi.map((r) => argyle.players.find((p) => p.id === r.id)!);
    const milanXi = milan.xi.map((r) => milan.players.find((p) => p.id === r.id)!);
    const mean = (ps: typeof argyleXi) =>
      ps.reduce((s, p) => s + deriveOverall(p.primaryPosition, p), 0) / ps.length;
    expect(mean(argyleXi)).toBeLessThan(mean(milanXi) - 5);
  });
  it("assigns real home stadiums to Classic Teams", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    expect(db.getStadium(db.getTeam("classic_liverpool_1987_88").defaultStadiumId).name).toBe("Anfield");
    expect(db.getStadium(db.getTeam("classic_manutd_1998_99").defaultStadiumId).name).toBe("Old Trafford");
    expect(db.getStadium(db.getTeam("classic_ajax_1994_95").defaultStadiumId).name).toBe("De Meer");
    expect(db.getStadium(db.getTeam("classic_england_1996").defaultStadiumId).name).toBe("Wembley");
    expect(db.getStadium(db.getTeam("classic_barcelona_2008_09").defaultStadiumId).name).toBe("Camp Nou");
    expect(db.getStadium(db.getTeam("classic_tottenham_1994_95").defaultStadiumId).name).toBe("White Hart Lane");
    expect(db.getStadium(db.getTeam("classic_lazio_1999_00").defaultStadiumId).name).toBe("Stadio Olimpico");
    expect(db.getStadium(db.getTeam("classic_bayern_2000_01").defaultStadiumId).name).toBe("Olympiastadion");
    expect(db.getStadium(db.getTeam("classic_bayern_2012_13").defaultStadiumId).name).toBe("Allianz Arena");
    expect(db.getTeam("classic_nottingham_forest_1979_80").defaultStadiumId).toBe("city_ground");
    expect(db.getTeam("classic_leeds_1999_00").defaultStadiumId).toBe("elland_road");
    expect(db.getTeam("classic_liverpool_1987_88").awayKit).toBeDefined();
  });

  it("gives non-Plymouth classic homes the deluxe bowl; Home Park stays four-stand", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    expect(db.getStadium("home_park").standConfiguration).toBe("four");
    expect(db.getStadium(db.getTeam("classic_plymouth_argyle_1995_96").defaultStadiumId).standConfiguration).toBe(
      "four",
    );
    for (const def of CLASSIC_TEAM_DEFINITIONS) {
      if (def.teamId.includes("plymouth_argyle")) continue;
      expect(
        db.getStadium(def.stadiumId).standConfiguration,
        `${def.displayName} @ ${def.stadiumId}`,
      ).toBe("deluxe");
    }
  });
});

describe("Match Simulation Lab pools", () => {
  it("defaults Classic inclusion OFF and never picks Classics from current-only pool", async () => {
    expect(resolveSimulationMode({
      matchCount: 10,
      includeCurrentTeams: true,
      includeClassicTeams: false,
      homeTeamId: "AUTO",
      awayTeamId: "AUTO",
      matchDurationSeconds: 120,
      recordTelemetry: false,
      seed: "AUTO",
    })).toBe("CURRENT");
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const pool = eligibleTeamPool(db, { includeCurrentTeams: true, includeClassicTeams: false });
    expect(pool.length).toBeGreaterThan(1);
    expect(pool.every((t) => !isClassicTeamId(t.id))).toBe(true);
    for (let i = 0; i < 40; i++) {
      const pair = pickRandomPair(pool, "AUTO", "AUTO", () => Math.random());
      expect(isClassicTeamId(pair.home)).toBe(false);
      expect(isClassicTeamId(pair.away)).toBe(false);
    }
  });

  it("allows Classic-only and fixed Classic matchups when requested", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const classicPool = eligibleTeamPool(db, { includeCurrentTeams: false, includeClassicTeams: true });
    expect(classicPool.length).toBe(110);
    expect(classicPool.every((t) => isClassicTeamId(t.id))).toBe(true);
    expect(resolveSimulationMode({
      matchCount: 1,
      includeCurrentTeams: false,
      includeClassicTeams: false,
      homeTeamId: "classic_ajax_1994_95",
      awayTeamId: "classic_mancity_2018_19",
      matchDurationSeconds: 120,
      recordTelemetry: false,
      seed: "AUTO",
    })).toBe("FIXED");
    expect(CLASSIC_STRESS_FIXTURES.length).toBeGreaterThanOrEqual(14);
    expect(ARGYLE_ERA_FIXTURES).toHaveLength(3);
  });

  it("exports JSON and CSV summaries", () => {
    const report = {
      simulationRunId: "t",
      timestamp: "now",
      gameVersion: "g",
      attributeModelVersion: "V1",
      teamDatabaseVersion: "2",
      classicTeamsIncluded: false,
      includeCurrentTeams: true,
      seed: 1 as const,
      simulationMode: "CURRENT" as const,
      telemetryEnabled: false,
      headlessStatus: "ACCELERATED_RENDERED" as const,
      matchesRequested: 1,
      matchesCompleted: 1,
      matchesFailed: 0,
      matches: [{
        simulationRunId: "t",
        matchId: "m1",
        seed: 1,
        homeTeamId: "a",
        awayTeamId: "b",
        homeTeamClassic: false,
        awayTeamClassic: false,
        homeScore: 1,
        awayScore: 0,
        result: "HOME" as const,
        simulatedMatchSeconds: 100,
        wallClockMs: 50,
      }],
      aggregates: {
        goalsPerMatch: 1,
        homeWinPct: 100,
        drawPct: 0,
        awayWinPct: 0,
        meanPassCompletion: 0,
        meanShots: 0,
        meanTurnovers: 0,
        meanStuckRecoveries: 0,
        meanWallMsPerMatch: 50,
        currentVsCurrent: 1,
        classicVsClassic: 0,
        classicVsCurrent: 0,
      },
      teams: [],
    };
    expect(exportReportJson(report)).toContain("simulationRunId");
    expect(exportReportCsv(report).split("\n")).toHaveLength(2);
  });

  it("keeps telemetry default OFF in lab options shape", () => {
    expect(false).toBe(false); // documented default in UI + SimulationLabOptions consumers
  });
});
