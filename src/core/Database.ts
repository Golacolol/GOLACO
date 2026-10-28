import type {
  AdvertisingBoardRecord,
  FixtureRecord,
  LineupRecord,
  PlayerRecord,
  StadiumRecord,
  StoryRecord,
  TeamMembership,
  TeamRecord,
} from "../data/schema";
import { applyOverride, deriveOverall, resolveAttributes } from "../football/players/PlayerStats";
import type { SaveManager } from "./SaveManager";
import { DEFAULT_TEAM_ID } from "../football/constants";
import {
  ARGYLE_101_ABBREVIATION,
  ARGYLE_101_FORMATION,
  ARGYLE_101_LINEUP,
  ARGYLE_101_MEMBERSHIPS,
  ARGYLE_101_NAME,
  ARGYLE_101_PLAYERS,
  ARGYLE_101_TEAM_ID,
} from "../data/argyle101";
import {
  ARGYLE_FANS_ABBREVIATION,
  ARGYLE_FANS_FORMATION,
  ARGYLE_FANS_LINEUP,
  ARGYLE_FANS_MEMBERSHIPS,
  ARGYLE_FANS_NAME,
  ARGYLE_FANS_PLAYERS,
  ARGYLE_FANS_TEAM_ID,
} from "../data/argyleFansXi";
import { CLASSIC_TEAM_DEFINITIONS, buildClassicTeamArtifacts } from "../data/classicTeams";
import { buildEnglishLeagueFixtures, nextFixtureForTeam, todayIso } from "../data/leagueSchedule";
import { loadAssetPackManifest, resolvePlayerPortraitUrl } from "../data/AssetPack";
import playersData from "../../public/data/players.json";
import teamsData from "../../public/data/teams.json";
import membershipsData from "../../public/data/teamMemberships.json";
import lineupsData from "../../public/data/lineups.json";
import fixturesData from "../../public/data/fixtures.json";
import stadiumsData from "../../public/data/stadiums.json";
import advertisingData from "../../public/data/advertising.json";
import storiesData from "../../public/data/stories.json";

export interface SquadPlayer {
  player: PlayerRecord;
  membership: TeamMembership;
  attrs: PlayerRecord;
  overall: number;
  shirtNumber: number;
}

export class GameDatabase {
  players = new Map<string, PlayerRecord>();
  teams = new Map<string, TeamRecord>();
  memberships: TeamMembership[] = [];
  lineups: LineupRecord[] = [];
  fixtures: FixtureRecord[] = [];
  stadiums = new Map<string, StadiumRecord>();
  advertising: AdvertisingBoardRecord[] = [];
  stories: StoryRecord[] = [];
  userTeamId = DEFAULT_TEAM_ID;
  private attractIndex = 0;
  private fixtureTemplate: FixtureRecord | null = null;

  static async load(save: SaveManager): Promise<GameDatabase> {
    const db = new GameDatabase();
    const players = playersData as PlayerRecord[];
    const teams = teamsData as TeamRecord[];
    const memberships = membershipsData as TeamMembership[];
    const lineups = lineupsData as LineupRecord[];
    const fixtures = fixturesData as FixtureRecord[];
    const stadiums = stadiumsData as StadiumRecord[];
    const advertising = advertisingData as AdvertisingBoardRecord[];
    const stories = storiesData as StoryRecord[];

    for (const p of players) db.players.set(p.id, p);
    for (const t of teams) db.teams.set(t.id, t);
    db.memberships = memberships;
    db.lineups = lineups;
    db.fixtureTemplate = fixtures[0] ?? null;
    db.fixtures = buildEnglishLeagueFixtures(teams, fixtures[0], (teamId) => db.defaultLineupId(teamId));
    if (!db.fixtures.length) db.fixtures = fixtures;
    for (const s of stadiums) db.stadiums.set(s.id, s);
    db.advertising = advertising;
    db.stories = stories;
    db.applySave(save);
    db.applyArgyleFansXi();
    db.applyArgyle101();
    db.applyClassicTeams();
    await db.applyAssetPack();
    return db;
  }

  /**
   * Apply asset-pack manifest mappings only (avoids mass 404s for missing files).
   * Drop-in convention paths are still tried at render time via Portrait helpers
   * when a player/team id is known and the file exists.
   */
  private async applyAssetPack(): Promise<void> {
    const pack = await loadAssetPackManifest();
    for (const [id, url] of Object.entries(pack.players ?? {})) {
      const player = this.players.get(id);
      if (!player || player.appearance?.portraitAsset) continue;
      player.appearance = { ...player.appearance, portraitAsset: url };
    }
    for (const [id, url] of Object.entries(pack.crests ?? {})) {
      const team = this.teams.get(id);
      if (!team || team.badgeAsset) continue;
      team.badgeAsset = url;
    }
    // Convention fallbacks for records that still have nothing set.
    for (const player of this.players.values()) {
      if (player.appearance?.portraitAsset) continue;
      const resolved = resolvePlayerPortraitUrl(player.id, null);
      // Only use pack fallback pool here — not every conventional path (404 spam).
      if (resolved && (pack.fallbackPortraits ?? []).includes(resolved)) {
        player.appearance = { ...player.appearance, portraitAsset: resolved };
      }
    }
  }

  private applyNamedSquad(options: {
    teamId: string;
    playerPrefix: string;
    players: PlayerRecord[];
    memberships: TeamMembership[];
    lineup: LineupRecord;
    formation: string;
    rename?: { name: string; abbreviation: string; historicSeason?: string };
  }): void {
    for (const player of options.players) {
      const existing = this.players.get(player.id);
      if (!existing) {
        this.players.set(player.id, player);
        continue;
      }
      // Named-squad TS is source of truth for ratings/position; keep enriched bios + portraits from JSON.
      this.players.set(player.id, {
        ...existing,
        ...player,
        id: player.id,
        heightCm: existing.heightCm ?? player.heightCm,
        weightKg: existing.weightKg ?? player.weightKg,
        age: existing.age ?? player.age,
        appearance: {
          ...player.appearance,
          ...existing.appearance,
          portraitAsset: existing.appearance?.portraitAsset ?? player.appearance?.portraitAsset ?? null,
          birthplace: existing.appearance?.birthplace ?? player.appearance?.birthplace,
          heightScale: existing.appearance?.heightScale ?? player.appearance?.heightScale,
        },
      });
    }
    const squadMem = this.memberships.filter((m) => m.teamId === options.teamId);
    if (!squadMem.some((m) => m.playerId.startsWith(options.playerPrefix))) {
      this.memberships = this.memberships.filter((m) => m.teamId !== options.teamId).concat(options.memberships);
    }
    const lineup = this.lineups.find((l) => l.teamId === options.teamId);
    if (!lineup?.starters.some((s) => s.playerId.startsWith(options.playerPrefix))) {
      this.lineups = this.lineups.filter((l) => l.teamId !== options.teamId).concat(options.lineup);
    }
    const team = this.teams.get(options.teamId);
    if (team) {
      team.defaultFormation = options.formation;
      if (options.rename) {
        team.name = options.rename.name;
        team.abbreviation = options.rename.abbreviation;
        if (options.rename.historicSeason !== undefined) team.historicSeason = options.rename.historicSeason;
      }
    }
  }

  private applyArgyleFansXi(): void {
    this.applyNamedSquad({
      teamId: ARGYLE_FANS_TEAM_ID,
      playerPrefix: "player_fan_",
      players: ARGYLE_FANS_PLAYERS,
      memberships: ARGYLE_FANS_MEMBERSHIPS,
      lineup: ARGYLE_FANS_LINEUP,
      formation: ARGYLE_FANS_FORMATION,
      rename: { name: ARGYLE_FANS_NAME, abbreviation: ARGYLE_FANS_ABBREVIATION },
    });
  }

  private applyArgyle101(): void {
    this.applyNamedSquad({
      teamId: ARGYLE_101_TEAM_ID,
      playerPrefix: "player_101_",
      players: ARGYLE_101_PLAYERS,
      memberships: ARGYLE_101_MEMBERSHIPS,
      lineup: ARGYLE_101_LINEUP,
      formation: ARGYLE_101_FORMATION,
      rename: { name: ARGYLE_101_NAME, abbreviation: ARGYLE_101_ABBREVIATION, historicSeason: "2021-22" },
    });
  }

  private applyClassicTeams(): void {
    for (const def of CLASSIC_TEAM_DEFINITIONS) {
      const built = buildClassicTeamArtifacts(def);
      // Ensure team shell exists (historics are not in English league JSON).
      if (!this.teams.has(def.teamId)) {
        this.teams.set(def.teamId, built.team);
      } else {
        const existing = this.teams.get(def.teamId)!;
        this.teams.set(def.teamId, {
          ...existing,
          ...built.team,
          id: def.teamId,
        });
      }
      // Always replace classic squads so authored V1 data wins over any stubs.
      for (const player of built.players) {
        this.players.set(player.id, player);
      }
      this.memberships = this.memberships.filter((m) => m.teamId !== def.teamId).concat(built.memberships);
      this.lineups = this.lineups.filter((l) => l.teamId !== def.teamId).concat(built.lineup);
      const team = this.teams.get(def.teamId);
      if (team) {
        team.defaultFormation = def.formation;
        team.name = def.displayName;
        team.abbreviation = def.abbreviation;
        team.historicSeason = def.season;
        team.teamType = built.team.teamType;
        delete (team as { league?: string }).league;
      }
    }
    this.applyClassicDeluxeStadiums();
  }

  /** Non-Plymouth classic homes use the wrap-around deluxe bowl. */
  private applyClassicDeluxeStadiums(): void {
    for (const def of CLASSIC_TEAM_DEFINITIONS) {
      if (def.teamId.includes("plymouth_argyle") || def.stadiumId === "home_park") continue;
      const stadium = this.stadiums.get(def.stadiumId);
      if (!stadium || stadium.standConfiguration === "deluxe") continue;
      this.stadiums.set(def.stadiumId, { ...stadium, standConfiguration: "deluxe" });
    }
  }

  private applySave(save: SaveManager): void {
    for (const p of save.data.players as PlayerRecord[]) {
      if (p?.id) this.players.set(p.id, { ...(this.players.get(p.id) ?? p), ...p });
    }
    for (const t of save.data.teams as TeamRecord[]) {
      if (t?.id) this.teams.set(t.id, { ...(this.teams.get(t.id) ?? t), ...t });
    }
    if (save.data.memberships.length) this.memberships = save.data.memberships as TeamMembership[];
    const savedTeam = (save.data.settings as { defaultTeamId?: string }).defaultTeamId;
    if (savedTeam && this.teams.has(savedTeam)) this.userTeamId = savedTeam;
    if (save.data.settings.leagueProgression && save.data.playedListedFixture && save.data.fixtures.length) {
      this.applyCareerFixtures(save.data.fixtures as FixtureRecord[]);
    } else {
      this.overlayUserFixtureResults(save.data.fixtures as FixtureRecord[]);
    }
    if (save.data.advertising.length) this.advertising = save.data.advertising as AdvertisingBoardRecord[];
  }

  /** Rebuild the English league calendar from scratch (casual / REAL baseline). */
  resetFixturesBaseline(): void {
    this.fixtures = buildEnglishLeagueFixtures(
      [...this.teams.values()],
      this.fixtureTemplate ?? undefined,
      (teamId) => this.defaultLineupId(teamId),
    );
  }

  /** Restore played / simulated flags from a saved career season. */
  applyCareerFixtures(saved: FixtureRecord[]): void {
    if (!saved?.length) return;
    const byId = new Map(saved.filter((f) => f?.id).map((f) => [f.id, f]));
    this.fixtures = this.fixtures.map((fixture) => {
      const hit = byId.get(fixture.id);
      if (!hit) return fixture;
      // Official calendar scores always win over career catch-up / stale saves.
      if (fixture.official && fixture.played) {
        return fixture;
      }
      return {
        ...fixture,
        played: !!hit.played,
        homeScore: hit.homeScore,
        awayScore: hit.awayScore,
        simulated: hit.simulated,
      };
    });
  }

  private overlayUserFixtureResults(saved: FixtureRecord[]): void {
    if (!saved?.length) return;
    const userPlayed = new Map<string, FixtureRecord>();
    for (const fixture of saved) {
      if (!fixture?.played || fixture.simulated !== false) continue;
      userPlayed.set(`${fixture.competition}|${fixture.homeTeamId}|${fixture.awayTeamId}`, fixture);
    }
    if (!userPlayed.size) return;
    this.fixtures = this.fixtures.map((fixture) => {
      const played = userPlayed.get(`${fixture.competition}|${fixture.homeTeamId}|${fixture.awayTeamId}`);
      if (!played || fixture.played) return fixture;
      return {
        ...fixture,
        played: true,
        homeScore: played.homeScore,
        awayScore: played.awayScore,
        simulated: false,
      };
    });
  }

  getPlayer(id: string): PlayerRecord {
    const p = this.players.get(id);
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  }

  getTeam(id: string): TeamRecord {
    const t = this.teams.get(id);
    if (!t) throw new Error(`Unknown team ${id}`);
    return t;
  }

  getStadium(id: string): StadiumRecord {
    const s = this.stadiums.get(id);
    if (!s) throw new Error(`Unknown stadium ${id}`);
    return s;
  }

  membershipsForTeam(teamId: string): TeamMembership[] {
    return this.memberships.filter((m) => m.teamId === teamId && (m.to === null || m.to === undefined));
  }

  membershipsForPlayer(playerId: string): TeamMembership[] {
    return this.memberships.filter((m) => m.playerId === playerId);
  }

  resolveSquadPlayer(membership: TeamMembership): SquadPlayer {
    const player = this.getPlayer(membership.playerId);
    const attrs = applyOverride(resolveAttributes(player), membership.ratingOverride);
    const overall = membership.ratingOverride?.overall ?? deriveOverall(player.primaryPosition, attrs);
    return {
      player,
      membership,
      attrs: { ...player, ...attrs, overall },
      overall,
      shirtNumber: membership.shirtNumber,
    };
  }

  getSquad(teamId: string): SquadPlayer[] {
    return this.membershipsForTeam(teamId).map((m) => this.resolveSquadPlayer(m));
  }

  getLineup(id: string | undefined, teamId: string): LineupRecord {
    const found = this.lineups.find((l) => l.id === id && l.teamId === teamId) ?? this.lineups.find((l) => l.teamId === teamId);
    if (!found) throw new Error(`No lineup for team ${teamId}`);
    return found;
  }

  defaultLineupId(teamId: string): string | undefined {
    return this.lineups.find((l) => l.teamId === teamId)?.id;
  }

  getStartingSquad(lineup: LineupRecord): SquadPlayer[] {
    return lineup.starters.map((slot) => {
      const membership =
        this.memberships.find((m) => m.teamId === lineup.teamId && m.playerId === slot.playerId) ??
        ({
          playerId: slot.playerId,
          teamId: lineup.teamId,
          shirtNumber: 0,
          squadRole: "FIRST_TEAM",
        } satisfies TeamMembership);
      const resolved = this.resolveSquadPlayer(membership);
      return resolved;
    });
  }

  nextFixture(teamId = this.userTeamId, skipPlayed = false): FixtureRecord {
    const listed = nextFixtureForTeam(this.fixtures, teamId, todayIso(), { skipPlayed });
    if (listed) return listed;
    return this.friendlyFor(teamId);
  }

  teamStrength(teamId: string): number {
    try {
      const lineup = this.getLineup(this.defaultLineupId(teamId), teamId);
      const xi = this.getStartingSquad(lineup);
      if (!xi.length) return 70;
      return xi.reduce((sum, p) => sum + p.overall, 0) / xi.length;
    } catch {
      return 70;
    }
  }

  private friendlyFor(teamId: string): FixtureRecord {
    const base = this.fixtureTemplate ?? this.fixtures[0];
    const homeId = this.teams.has(teamId) ? teamId : DEFAULT_TEAM_ID;
    const awayId = cycleAttractOpponent(
      [...this.teams.values()].map((t) => t.id),
      homeId,
      0,
      base?.awayTeamId,
    );
    const home = this.getTeam(homeId);
    return {
      ...(base ?? {
        id: "friendly",
        homeTeamId: homeId,
        awayTeamId: awayId,
        venueId: home.defaultStadiumId,
        competition: "Friendly",
        date: todayIso(),
        time: "15:00",
        durationSeconds: 600,
      }),
      id: `friendly_${homeId}_${awayId}`,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeLineupId: this.defaultLineupId(homeId) ?? base?.homeLineupId,
      awayLineupId: this.defaultLineupId(awayId) ?? base?.awayLineupId,
      venueId: home.defaultStadiumId,
      competition: "Friendly",
      date: todayIso(),
    };
  }

  currentAttractFixture(durationSeconds: number): FixtureRecord {
    const base = this.fixtures[0];
    const homeId = this.teams.has(this.userTeamId) ? this.userTeamId : this.teams.has(DEFAULT_TEAM_ID) ? DEFAULT_TEAM_ID : base.homeTeamId;
    const awayId = cycleAttractOpponent(
      [...this.teams.values()].map((t) => t.id),
      homeId,
      this.attractIndex,
      base.awayTeamId,
    );
    const home = this.getTeam(homeId);
    return {
      ...base,
      id: `sim_${awayId}_${this.attractIndex}`,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeLineupId: this.defaultLineupId(homeId) ?? base.homeLineupId,
      awayLineupId: this.defaultLineupId(awayId) ?? base.awayLineupId,
      venueId: home.defaultStadiumId,
      durationSeconds,
    };
  }

  randomSimulatorFixture(durationSeconds: number): FixtureRecord {
    const base = this.fixtures[0];
    const homeId = this.teams.has(this.userTeamId) ? this.userTeamId : this.teams.has(DEFAULT_TEAM_ID) ? DEFAULT_TEAM_ID : base.homeTeamId;
    const rest = [...this.teams.values()].map((t) => t.id).filter((id) => id !== homeId);
    const awayId = rest[Math.floor(Math.random() * rest.length)] ?? base.awayTeamId;
    const home = this.getTeam(homeId);
    const timeOfDay = (["DAY", "EVENING", "NIGHT"] as const)[Math.floor(Math.random() * 3)];
    const weatherPool = timeOfDay === "NIGHT" ? (["MILD", "RAINY", "SNOWY"] as const) : (["MILD", "RAINY", "SNOWY", "SUNNY"] as const);
    return {
      ...base,
      id: `sim_${awayId}_${Date.now()}`,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeLineupId: this.defaultLineupId(homeId) ?? base.homeLineupId,
      awayLineupId: this.defaultLineupId(awayId) ?? base.awayLineupId,
      venueId: home.defaultStadiumId,
      durationSeconds,
      timeOfDay,
      weather: weatherPool[Math.floor(Math.random() * weatherPool.length)],
    };
  }

  advanceAttractOpponent(): void {
    this.attractIndex += 1 + Math.floor(Math.random() * 3);
  }
}

export function cycleAttractOpponent(teamIds: string[], homeId: string, index: number, preferredAwayId?: string): string {
  const rest = teamIds.filter((id) => id !== homeId);
  if (!rest.length) return homeId;
  const ordered = preferredAwayId && rest.includes(preferredAwayId) ? [preferredAwayId, ...rest.filter((id) => id !== preferredAwayId)] : rest;
  return ordered[((index % ordered.length) + ordered.length) % ordered.length];
}
