import type { LineupRecord, LineupSlot } from "../../data/schema";
import { isPlayStyleId, type PlayStyleChoice, type PlayStyleId } from "../ai/PlayStyle";
import { isFormationName, USER_FORMATION, type FormationName } from "./Formation";

export type TeamTacticsUserSnapshot = {
  /** Underlying shape used for pitch slots (never USER). */
  formation: FormationName;
  playStyle?: PlayStyleId | null;
  starters: LineupSlot[];
};

/** Per-team formation / play-style prefs persisted across sessions. */
export type TeamTacticsSave = {
  /** Dropdown selection — a base shape or USER. */
  selection: FormationName | typeof USER_FORMATION;
  /** Working shape for getFormation (never USER). */
  formation: FormationName;
  playStyle?: PlayStyleId | null;
  starters: LineupSlot[];
  /** Retained custom — survives switching back to a clean base. */
  user?: TeamTacticsUserSnapshot;
};

export function normalizeFormationName(name: string | null | undefined, fallback: FormationName = "4-2-3-1"): FormationName {
  if (name && isFormationName(name)) return name;
  return fallback;
}

export function lineupToTacticsSnapshot(
  lineup: LineupRecord,
  selection?: FormationName | typeof USER_FORMATION,
): TeamTacticsSave {
  const formation = normalizeFormationName(lineup.formation);
  const playStyle = isPlayStyleId(lineup.playStyle ?? undefined) ? lineup.playStyle : null;
  const sel = selection === USER_FORMATION ? USER_FORMATION : normalizeFormationName(selection ?? formation);
  return {
    selection: sel,
    formation,
    playStyle,
    starters: lineup.starters.map((s) => ({ ...s })),
  };
}

export function applyTacticsToLineup(lineup: LineupRecord, tactics: TeamTacticsSave): void {
  lineup.formation = tactics.formation;
  lineup.starters = tactics.starters.map((s) => ({ ...s }));
  if (!tactics.playStyle) delete lineup.playStyle;
  else lineup.playStyle = tactics.playStyle;
}

export function snapshotWorkingAsUser(args: {
  formation: string;
  playStyle: PlayStyleChoice;
  starters: LineupSlot[];
}): TeamTacticsUserSnapshot {
  return {
    formation: normalizeFormationName(args.formation),
    playStyle: args.playStyle === "auto" ? null : args.playStyle,
    starters: args.starters.map((s) => ({ ...s })),
  };
}

export function mergeTeamTactics(
  existing: TeamTacticsSave | undefined,
  next: TeamTacticsSave,
): TeamTacticsSave {
  return {
    ...next,
    user: next.user ?? existing?.user,
  };
}
