/**
 * Universal position archetypes — league-agnostic job descriptions.
 * League / overall only scale risk via PlayStyle; roles keep the same job.
 */
import type { FootballRole } from "./MatchBrain";
import { classifyFootballRole } from "./MatchBrain";
import type { Player } from "../players/Player";

export interface PositionArchetype {
  role: FootballRole;
  /** On-ball: prefer safe recycle (0–1). */
  safeRecycle: number;
  /** On-ball: progressive risk (0–1). */
  progressiveRisk: number;
  /** On-ball: shoot bias when in range. */
  finishBias: number;
  /** Off-ball attack: stretch ahead of ball. */
  stretchRun: number;
  /** Off-ball attack: check to feet / support pocket. */
  checkToFeet: number;
  /** Defend: stand-off / cover angle (vs hunt). */
  standOff: number;
  /** Defend: willingness to be primary presser. */
  pressTrigger: number;
  /** Defend: hold defensive line discipline. */
  lineHold: number;
}

const ARCHETYPES: Record<FootballRole, Omit<PositionArchetype, "role">> = {
  GK: {
    safeRecycle: 0.95,
    progressiveRisk: 0.05,
    finishBias: 0,
    stretchRun: 0,
    checkToFeet: 0,
    standOff: 1,
    pressTrigger: 0,
    lineHold: 1,
  },
  CB: {
    safeRecycle: 0.88,
    progressiveRisk: 0.18,
    finishBias: 0.05,
    stretchRun: 0.08,
    checkToFeet: 0.12,
    standOff: 0.78,
    pressTrigger: 0.28,
    lineHold: 0.95,
  },
  FB: {
    safeRecycle: 0.55,
    progressiveRisk: 0.45,
    finishBias: 0.08,
    stretchRun: 0.55,
    checkToFeet: 0.35,
    standOff: 0.48,
    pressTrigger: 0.55,
    lineHold: 0.62,
  },
  DM: {
    safeRecycle: 0.78,
    progressiveRisk: 0.35,
    finishBias: 0.1,
    stretchRun: 0.22,
    checkToFeet: 0.45,
    standOff: 0.72,
    pressTrigger: 0.42,
    lineHold: 0.85,
  },
  CM: {
    safeRecycle: 0.58,
    progressiveRisk: 0.55,
    finishBias: 0.18,
    stretchRun: 0.4,
    checkToFeet: 0.55,
    standOff: 0.52,
    pressTrigger: 0.5,
    lineHold: 0.55,
  },
  WM: {
    safeRecycle: 0.42,
    progressiveRisk: 0.5,
    finishBias: 0.2,
    stretchRun: 0.58,
    checkToFeet: 0.4,
    standOff: 0.4,
    pressTrigger: 0.48,
    lineHold: 0.4,
  },
  AM: {
    safeRecycle: 0.32,
    progressiveRisk: 0.72,
    finishBias: 0.42,
    stretchRun: 0.62,
    checkToFeet: 0.48,
    standOff: 0.35,
    pressTrigger: 0.45,
    lineHold: 0.28,
  },
  W: {
    safeRecycle: 0.28,
    progressiveRisk: 0.58,
    finishBias: 0.35,
    stretchRun: 0.7,
    checkToFeet: 0.32,
    standOff: 0.32,
    pressTrigger: 0.5,
    lineHold: 0.25,
  },
  CF: {
    safeRecycle: 0.22,
    progressiveRisk: 0.48,
    finishBias: 0.78,
    stretchRun: 0.75,
    checkToFeet: 0.55,
    standOff: 0.28,
    pressTrigger: 0.55,
    lineHold: 0.15,
  },
};

export function positionArchetype(player: Player): PositionArchetype {
  const role = classifyFootballRole(player);
  return { role, ...ARCHETYPES[role] };
}

export function positionArchetypeForRole(role: FootballRole): PositionArchetype {
  return { role, ...ARCHETYPES[role] };
}
