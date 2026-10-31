/**
 * Free-kick taker policy — scored shoot / cross / pass choice.
 * Tunable weights live in FREE_KICK_POLICY so DecisionTelemetry dumps can calibrate offline.
 */
import { clamp, stat01 } from "../../core/math";
import { HALF_LENGTH, PENALTY_AREA_LENGTH } from "../constants";
import type { Player } from "../players/Player";

export type FreeKickAction = "SHOT" | "CROSS" | "PASS";

/** Hand-authored policy — raise nearBoxShotFloor further if sims still recycle too often. */
export const FREE_KICK_POLICY = {
  /** Metres from goal centre: inside this + central → treat as “near the box”. */
  nearBoxDist: 28,
  /** Absolute max range where a direct shot is considered. */
  shootingRangeDist: 35,
  /** Lateral width (m) for a strike to be preferred over a delivery. */
  centralZ: 20,
  /** Floor on shot score when near-box + central (forces typical strike). */
  nearBoxShotFloor: 1.05,
  setPiecesWeight: 0.42,
  finishingWeight: 0.18,
  crossWideBias: 0.28,
  passFarBias: 0.18,
};

export interface FreeKickContext {
  taker: Player;
  ballX: number;
  ballZ: number;
  teammates: Player[];
  opponents: Player[];
}

export interface FreeKickDecision {
  action: FreeKickAction;
  shotScore: number;
  crossScore: number;
  passScore: number;
  distGoal: number;
  nearBox: boolean;
}

export function decideFreeKick(ctx: FreeKickContext): FreeKickDecision {
  const { taker, ballX, ballZ, teammates, opponents } = ctx;
  const P = FREE_KICK_POLICY;
  const goalX = taker.oppGoalX();
  const distGoal = Math.hypot(goalX - ballX, ballZ);
  const absZ = Math.abs(ballZ);
  const central = absZ < P.centralZ;
  const setTech = stat01(taker.attrs.setPieces ?? taker.attrs.finishing);
  const finish = stat01(taker.attrs.finishing);
  const longS = stat01(taker.attrs.longShots ?? taker.attrs.shotPower);
  const nearBox = distGoal < P.nearBoxDist && absZ < P.centralZ + 3;

  let shotScore = 0;
  if (distGoal < P.shootingRangeDist && absZ < 24) {
    shotScore =
      0.32 +
      setTech * P.setPiecesWeight +
      finish * P.finishingWeight +
      longS * 0.14 +
      clamp((P.shootingRangeDist - distGoal) / P.shootingRangeDist, 0, 1) * 0.38;
    if (distGoal < PENALTY_AREA_LENGTH + 10) shotScore += 0.28;
    if (central) shotScore += 0.22;
    else if (absZ > 20) shotScore *= 0.55;
  }

  // Wall softens the strike but near-box still prefers a shot over a recycle.
  const laneBlockers = opponents.filter((o) => {
    if (o.isGK) return false;
    const along = (o.x - ballX) * Math.sign(goalX - ballX || 1);
    if (along < 2 || along > distGoal - 2) return false;
    const t = along / Math.max(distGoal, 1);
    const laneZ = ballZ + (0 - ballZ) * t;
    return Math.abs(o.z - laneZ) < 2.4;
  }).length;
  if (laneBlockers >= 3) shotScore *= nearBox ? 0.88 : 0.72;
  else if (laneBlockers >= 2) shotScore *= nearBox ? 0.94 : 0.85;

  const boxMate = teammates.some(
    (t) =>
      t.id !== taker.id &&
      !t.isGK &&
      Math.abs(t.x - goalX) < PENALTY_AREA_LENGTH + 5 &&
      Math.abs(t.z) < 16,
  );
  let crossScore =
    absZ > 14 && distGoal < 42
      ? 0.2 + P.crossWideBias * (absZ > 18 ? 1 : 0.55) + (boxMate ? 0.18 : 0)
      : 0;
  if (nearBox && central) crossScore *= 0.22;

  let passScore =
    P.passFarBias +
    (distGoal > P.shootingRangeDist ? 0.35 : 0) +
    (absZ > 22 ? 0.1 : 0) +
    (1 - setTech) * 0.06;
  // Recycle only when a strike is clearly off the table.
  if (distGoal > 38) passScore += 0.25;
  if (nearBox) passScore *= 0.12;
  else if (distGoal < P.shootingRangeDist && central) passScore *= 0.35;

  if (nearBox) {
    shotScore = Math.max(shotScore, P.nearBoxShotFloor);
    passScore = Math.min(passScore, shotScore - 0.55);
    crossScore = Math.min(crossScore, shotScore - 0.35);
  }

  // Extreme angle: prefer whipped delivery / short pass over a hopeful shot.
  if (absZ > 24 && distGoal < 30) {
    shotScore *= 0.45;
    crossScore = Math.max(crossScore, 0.55);
  }

  // Own-half free kicks are never shots at the opposition goal.
  const ownHalf = Math.sign(ballX - 0) !== Math.sign(goalX) || Math.abs(ballX) < HALF_LENGTH * 0.08;
  if (ownHalf && distGoal > 40) {
    shotScore = 0;
    passScore = Math.max(passScore, 0.7);
  }

  const ranked: { action: FreeKickAction; score: number }[] = (
    [
      { action: "SHOT" as const, score: shotScore },
      { action: "CROSS" as const, score: crossScore },
      { action: "PASS" as const, score: passScore },
    ] satisfies { action: FreeKickAction; score: number }[]
  ).sort((a, b) => b.score - a.score);

  return {
    action: ranked[0].action,
    shotScore,
    crossScore,
    passScore,
    distGoal,
    nearBox,
  };
}
