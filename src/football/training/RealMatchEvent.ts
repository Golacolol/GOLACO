/**
 * Canonical schema for real-world football match events used to train / calibrate AI.
 * Vendor feeds (Opta, StatsBomb, Wyscout) should map into this shape — not the reverse.
 *
 * Pitch: engine coords (length 105, width 68). Home attacks +x, touchlines ±z.
 */

import type { OfficialCompetition } from "../../data/officialResults";
import type { AttackAction } from "../ai/AttackingDecision";
import type { FreeKickAction } from "../ai/FreeKickDecision";

export const REAL_MATCH_EVENT_SCHEMA_VERSION = 1 as const;

export type RealMatchEventType =
  | "pass"
  | "carry"
  | "shot"
  | "cross"
  | "through"
  | "tackle"
  | "clearance"
  | "free_kick"
  | "corner"
  | "throw_in"
  | "reception";

export type RealPassSubtype = "short" | "long" | "switch" | "through" | "cross" | "back";
export type RealEventOutcome =
  | "complete"
  | "incomplete"
  | "blocked"
  | "saved"
  | "goal"
  | "off_target"
  | "won"
  | "lost";

/** Labeled action the AI should prefer in this frame (attack or free-kick family). */
export type RealLabeledAction = AttackAction | FreeKickAction;

export interface PitchPoint {
  x: number;
  z: number;
}

export interface RealMatchMeta {
  id: string;
  competition: OfficialCompetition | string;
  date: string;
  time?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  /** Always engine pitch — document for adapters. */
  pitch: { length: number; width: number };
  coordSystem: "engine";
  source: "manual_annotation" | "opta" | "statsbomb" | "wyscout" | "other";
  notes?: string;
}

/**
 * One observed / annotated frame from a real match.
 * Prefer dense decision moments (on-ball choices) over every touch.
 */
export interface RealMatchEvent {
  id: string;
  minute: number;
  second?: number;
  period: 1 | 2;
  teamId: string;
  /** Formation slot when known (e.g. RCM, ST). */
  playerSlot?: string;
  playerId?: string;
  type: RealMatchEventType;
  subtype?: RealPassSubtype | string;
  /** Ground-truth action label for policy training. */
  labelAction: RealLabeledAction;
  start: PitchPoint;
  end?: PitchPoint;
  outcome?: RealEventOutcome;
  /** 0..1 estimated defensive pressure on the ball carrier. */
  pressure?: number;
  progressive?: boolean;
  crossField?: boolean;
  /** Straight-line pass / carry length in metres. */
  lengthM?: number;
  /** True when the acting team is the home side in this corpus. */
  actingTeamIsHome: boolean;
  phase?: "buildup" | "chance" | "set_piece" | "transition" | "defend";
  meta?: Record<string, string | number | boolean | null>;
}

export interface RealMatchCorpus {
  schemaVersion: typeof REAL_MATCH_EVENT_SCHEMA_VERSION;
  match: RealMatchMeta;
  events: RealMatchEvent[];
}

/** Empirical play-style targets derived from a corpus (used to train / gate sims). */
export interface PlayStyleTargets {
  matchId: string;
  eventCount: number;
  labeledDecisionCount: number;
  shortPassShare: number;
  longPassShare: number;
  crossFieldShare: number;
  progressivePassShare: number;
  shotShare: number;
  holdOrRecycleShare: number;
  avgPassLengthM: number;
  /** Among free_kick events with a label. */
  freeKickShotShare: number;
  freeKickNearBoxShotShare: number;
  /** Passes with lengthM < 18. */
  shortPassLengthShare: number;
}
