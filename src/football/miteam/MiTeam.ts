import type { LineupRecord, TeamKit, TeamMembership, TeamRecord } from "../../data/schema";
import type { GameDatabase } from "../../core/Database";
import {
  MITEAM_BENCH_SLOTS,
  MITEAM_DEFAULT_BADGE,
  MITEAM_DEFAULT_CLUB_NAME,
  MITEAM_DEFAULT_PRIMARY,
  MITEAM_DEFAULT_SECONDARY,
  MITEAM_ERA,
  MITEAM_FORMATION,
  MITEAM_LINEUP_ID,
  MITEAM_TEAM_ID,
  type MiTeamRosterSlot,
  type MiTeamSave,
  type SaveManager,
} from "../../core/SaveManager";
import { DEFAULT_TEAM_ID } from "../constants";
import { getFormation } from "../teams/Formation";

export type MiTeamShellColors = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export function miteamTeamShell(
  clubName: string,
  badgeAsset?: string | null,
  colors?: MiTeamShellColors,
): TeamRecord {
  const name = clubName.trim() || MITEAM_DEFAULT_CLUB_NAME;
  const crest = badgeAsset?.trim() || MITEAM_DEFAULT_BADGE;
  const primary = colors?.primaryColor?.trim() || MITEAM_DEFAULT_PRIMARY;
  const secondary = colors?.secondaryColor?.trim() || MITEAM_DEFAULT_SECONDARY;
  return {
    id: MITEAM_TEAM_ID,
    name,
    abbreviation: abbreviate(name),
    teamType: "CUSTOM_TEAM",
    custom: true,
    city: "User",
    primaryColor: primary,
    secondaryColor: secondary,
    badgeAsset: crest,
    defaultKit: {
      shirt: primary,
      shorts: secondary,
      socks: primary,
      trim: secondary,
      numberColor: secondary,
    },
    awayKit: {
      shirt: secondary,
      shorts: primary,
      socks: secondary,
      trim: primary,
      numberColor: primary,
    },
    goalkeeperKit: {
      shirt: "#C9A227",
      shorts: secondary,
      socks: "#C9A227",
      trim: secondary,
      numberColor: secondary,
    },
    defaultStadiumId: "home_park",
    defaultFormation: MITEAM_FORMATION,
    historicSeason: MITEAM_ERA,
  };
}

function abbreviate(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (letters.length >= 3) return letters.slice(0, 3);
  return (letters + "MIT").slice(0, 3);
}

export function miteamXiSlots(formation = MITEAM_FORMATION): string[] {
  return getFormation(formation).map((s) => s.id);
}

export function miteamBenchSlotIds(): string[] {
  return Array.from({ length: MITEAM_BENCH_SLOTS }, (_, i) => `BENCH_${i + 1}`);
}

/** Guided fill order: GK first, then remaining formation slots, then bench. */
export function miteamFillOrder(formation = MITEAM_FORMATION): string[] {
  const xi = miteamXiSlots(formation);
  const gk = xi.filter((s) => s === "GK");
  const rest = xi.filter((s) => s !== "GK");
  return [...gk, ...rest, ...miteamBenchSlotIds()];
}

export function ensureMiTeamSave(save: SaveManager, clubName = MITEAM_DEFAULT_CLUB_NAME): MiTeamSave {
  if (save.data.miteam) return save.data.miteam;
  const created: MiTeamSave = {
    teamId: MITEAM_TEAM_ID,
    clubName: clubName.trim() || MITEAM_DEFAULT_CLUB_NAME,
    badgeAsset: null,
    primaryColor: null,
    secondaryColor: null,
    roster: [],
    nextFixtureId: null,
  };
  save.data.miteam = created;
  save.save();
  return created;
}

export function restartMiTeam(save: SaveManager): MiTeamSave {
  const prev = save.data.miteam;
  const next: MiTeamSave = {
    teamId: MITEAM_TEAM_ID,
    clubName: prev?.clubName ?? MITEAM_DEFAULT_CLUB_NAME,
    badgeAsset: prev?.badgeAsset ?? null,
    primaryColor: prev?.primaryColor ?? null,
    secondaryColor: prev?.secondaryColor ?? null,
    roster: [],
    nextFixtureId: null,
  };
  save.data.miteam = next;
  save.save();
  return next;
}

export function deleteMiTeam(save: SaveManager, db: GameDatabase): void {
  save.data.miteam = null;
  if (save.data.settings.defaultTeamId === MITEAM_TEAM_ID) {
    save.data.settings.defaultTeamId = db.userTeamId !== MITEAM_TEAM_ID ? db.userTeamId : DEFAULT_TEAM_ID;
  }
  delete save.data.teamTactics[MITEAM_TEAM_ID];
  save.save();
  removeMiTeamFromDb(db);
}

export function removeMiTeamFromDb(db: GameDatabase): void {
  db.teams.delete(MITEAM_TEAM_ID);
  db.memberships = db.memberships.filter((m) => m.teamId !== MITEAM_TEAM_ID);
  db.lineups = db.lineups.filter((l) => l.teamId !== MITEAM_TEAM_ID);
  if (db.userTeamId === MITEAM_TEAM_ID) db.userTeamId = DEFAULT_TEAM_ID;
}

/** Apply (or refresh) MiTeam shell + memberships + lineup from save. */
export function applyMiTeamToDb(db: GameDatabase, save: SaveManager): void {
  const mt = save.data.miteam;
  if (!mt) {
    removeMiTeamFromDb(db);
    return;
  }
  const shell = miteamTeamShell(mt.clubName, mt.badgeAsset, {
    primaryColor: mt.primaryColor,
    secondaryColor: mt.secondaryColor,
  });
  db.teams.set(MITEAM_TEAM_ID, shell);

  const memberships: TeamMembership[] = [];
  const starters: LineupRecord["starters"] = [];
  const xiSlots = new Set(miteamXiSlots(MITEAM_FORMATION));
  const usedShirts = new Set<number>();

  for (const row of mt.roster) {
    if (!db.players.has(row.playerId)) continue;
    let shirt = Math.max(1, Math.min(99, Math.round(row.shirtNumber)));
    while (usedShirts.has(shirt)) shirt = (shirt % 99) + 1;
    usedShirts.add(shirt);
    const isXi = xiSlots.has(row.slot);
    memberships.push({
      playerId: row.playerId,
      teamId: MITEAM_TEAM_ID,
      shirtNumber: shirt,
      squadRole: isXi ? "FIRST_TEAM" : "BENCH",
    });
    if (isXi) starters.push({ playerId: row.playerId, slot: row.slot });
  }

  db.memberships = db.memberships.filter((m) => m.teamId !== MITEAM_TEAM_ID).concat(memberships);

  const lineup: LineupRecord = {
    id: MITEAM_LINEUP_ID,
    teamId: MITEAM_TEAM_ID,
    formation: MITEAM_FORMATION,
    starters,
  };
  db.lineups = db.lineups.filter((l) => l.teamId !== MITEAM_TEAM_ID).concat(lineup);
}

export function setMiTeamClubName(save: SaveManager, db: GameDatabase, clubName: string): void {
  const mt = ensureMiTeamSave(save, clubName);
  mt.clubName = clubName.trim() || MITEAM_DEFAULT_CLUB_NAME;
  save.save();
  applyMiTeamToDb(db, save);
}

export function setMiTeamBadge(save: SaveManager, db: GameDatabase, badgeAsset: string | null): void {
  const mt = ensureMiTeamSave(save);
  const next = badgeAsset?.trim() || null;
  mt.badgeAsset = next && next !== MITEAM_DEFAULT_BADGE ? next : null;
  save.save();
  applyMiTeamToDb(db, save);
}

export function setMiTeamColors(
  save: SaveManager,
  db: GameDatabase,
  colors: { primaryColor?: string | null; secondaryColor?: string | null },
): void {
  const mt = ensureMiTeamSave(save);
  if ("primaryColor" in colors) {
    const p = colors.primaryColor?.trim() || null;
    mt.primaryColor = p && /^#[0-9a-fA-F]{6}$/.test(p) ? p : null;
  }
  if ("secondaryColor" in colors) {
    const s = colors.secondaryColor?.trim() || null;
    mt.secondaryColor = s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null;
  }
  save.save();
  applyMiTeamToDb(db, save);
}

/** Resolve the club a MiTeam player was packed from (for cards / pitch counters). */
export function findMiTeamOriginTeam(
  db: GameDatabase,
  playerId: string,
  preferredTeamId?: string | null,
): TeamRecord | null {
  if (preferredTeamId && preferredTeamId !== MITEAM_TEAM_ID && db.teams.has(preferredTeamId)) {
    const preferred = db.getTeam(preferredTeamId);
    if (db.getSquad(preferredTeamId).some((s) => s.player.id === playerId)) return preferred;
  }
  for (const team of db.teams.values()) {
    if (team.id === MITEAM_TEAM_ID) continue;
    if (db.getSquad(team.id).some((s) => s.player.id === playerId)) return team;
  }
  return null;
}

export function setMiTeamRoster(save: SaveManager, db: GameDatabase, roster: MiTeamRosterSlot[]): void {
  const mt = ensureMiTeamSave(save);
  mt.roster = roster;
  save.save();
  applyMiTeamToDb(db, save);
}

export function xiComplete(roster: MiTeamRosterSlot[], formation = MITEAM_FORMATION): boolean {
  const need = new Set(miteamXiSlots(formation));
  for (const r of roster) need.delete(r.slot);
  return need.size === 0;
}

export function nextEmptySlot(roster: MiTeamRosterSlot[], formation = MITEAM_FORMATION): string | null {
  const filled = new Set(roster.map((r) => r.slot));
  for (const slot of miteamFillOrder(formation)) {
    if (!filled.has(slot)) return slot;
  }
  return null;
}

function isBenchSlot(slot: string): boolean {
  return slot.startsWith("BENCH_");
}

/** True when the user changed MiTeam name, colours, or emblem from defaults. */
export function miTeamIdentityCustomized(mt: MiTeamSave | null | undefined): boolean {
  if (!mt) return false;
  const name = mt.clubName.trim();
  if (name && name !== MITEAM_DEFAULT_CLUB_NAME) return true;
  if (mt.primaryColor?.trim()) return true;
  if (mt.secondaryColor?.trim()) return true;
  if (mt.badgeAsset?.trim()) return true;
  return false;
}

export type MiTeamPlayerDisplay = {
  teamName: string;
  teamColor: string;
  teamSecondaryColor: string;
  team: TeamRecord;
};

/**
 * Card / marker look for a MiTeam player.
 * Unmodified MiTeam → origin club identity; customized shell → MiTeam kit/name/crest.
 */
export function resolveMiTeamPlayerDisplay(
  db: GameDatabase,
  mt: MiTeamSave,
  playerId: string,
  sourceTeamId?: string | null,
): MiTeamPlayerDisplay {
  const shell = db.teams.get(MITEAM_TEAM_ID) ?? miteamTeamShell(mt.clubName, mt.badgeAsset, {
    primaryColor: mt.primaryColor,
    secondaryColor: mt.secondaryColor,
  });
  if (miTeamIdentityCustomized(mt)) {
    return {
      teamName: shell.name,
      teamColor: shell.primaryColor,
      teamSecondaryColor: shell.secondaryColor,
      team: shell,
    };
  }
  const origin = findMiTeamOriginTeam(db, playerId, sourceTeamId);
  if (origin) {
    return {
      teamName: origin.name,
      teamColor: origin.primaryColor,
      teamSecondaryColor: origin.secondaryColor,
      team: origin,
    };
  }
  return {
    teamName: shell.name,
    teamColor: shell.primaryColor,
    teamSecondaryColor: shell.secondaryColor,
    team: shell,
  };
}

/** Origin-club looks for every roster player when MiTeam is still the default shell. */
export function buildMiTeamPlayerClubLooks(
  db: GameDatabase,
  mt: MiTeamSave | null | undefined,
): Map<string, MiTeamPlayerDisplay> | null {
  if (!mt || miTeamIdentityCustomized(mt)) return null;
  const map = new Map<string, MiTeamPlayerDisplay>();
  for (const row of mt.roster) {
    map.set(row.playerId, resolveMiTeamPlayerDisplay(db, mt, row.playerId, row.sourceTeamId));
  }
  return map.size ? map : null;
}

/** Match kit for a MiTeam player — origin club kit while the shell is unmodified. */
export function resolveMiTeamPlayerKit(
  db: GameDatabase,
  mt: MiTeamSave | null | undefined,
  playerId: string,
  isGk: boolean,
  fallback: TeamKit,
): TeamKit {
  if (!mt || mt.teamId !== MITEAM_TEAM_ID || miTeamIdentityCustomized(mt)) return fallback;
  const row = mt.roster.find((r) => r.playerId === playerId);
  const origin = findMiTeamOriginTeam(db, playerId, row?.sourceTeamId);
  if (!origin) return fallback;
  return isGk ? origin.goalkeeperKit : origin.defaultKit;
}

/**
 * Move / swap a roster player onto `toSlot` (bench↔XI or XI↔XI).
 * Bench → XI onto GK requires a goalkeeper (and vice versa), matching Formation.
 * Returns a new roster array, or null if the move is illegal / a no-op.
 */
export function placeMiTeamPlayerOnSlot(
  roster: MiTeamRosterSlot[],
  playerId: string,
  toSlot: string,
  primaryPositionOf: (playerId: string) => string | null | undefined,
): MiTeamRosterSlot[] | null {
  const from = roster.find((r) => r.playerId === playerId);
  if (!from || from.slot === toSlot) return null;

  const fromIsBench = isBenchSlot(from.slot);
  const toIsXi = !isBenchSlot(toSlot);
  if (fromIsBench && toIsXi) {
    const toIsGk = toSlot === "GK";
    const inIsGk = primaryPositionOf(playerId) === "GK";
    if (toIsGk !== inIsGk) return null;
  }

  const occupant = roster.find((r) => r.slot === toSlot);
  if (!occupant) {
    return roster.map((r) => (r.playerId === playerId ? { ...r, slot: toSlot } : r));
  }

  // When swapping a starter onto the GK slot (or GK off it), enforce GK pairing.
  if (!fromIsBench && (from.slot === "GK" || toSlot === "GK")) {
    const movingIsGk = primaryPositionOf(playerId) === "GK";
    const otherIsGk = primaryPositionOf(occupant.playerId) === "GK";
    if (movingIsGk !== otherIsGk) return null;
  }

  const fromSlot = from.slot;
  return roster.map((r) => {
    if (r.playerId === playerId) return { ...r, slot: toSlot };
    if (r.playerId === occupant.playerId) return { ...r, slot: fromSlot };
    return r;
  });
}

export function randomOpponentTeamId(db: GameDatabase): string {
  const ids = [...db.teams.values()]
    .map((t) => t.id)
    .filter((id) => id !== MITEAM_TEAM_ID && db.getSquad(id).length >= 11);
  if (!ids.length) return DEFAULT_TEAM_ID;
  return ids[Math.floor(Math.random() * ids.length)]!;
}

export function randomMiTeamFixture(db: GameDatabase): import("../../data/schema").FixtureRecord {
  const opp = randomOpponentTeamId(db);
  const miteamHome = Math.random() < 0.5;
  const home = miteamHome ? MITEAM_TEAM_ID : opp;
  const away = miteamHome ? opp : MITEAM_TEAM_ID;
  return db.friendlyVs(home, away);
}
