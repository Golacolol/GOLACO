import { HALF_LENGTH, PENALTY_SPOT } from "../constants";
import { inPenaltyArea, pitchClamp } from "../pitch/PitchZones";

export type SpotKickKind = "FREE_KICK" | "PENALTY";

export interface SpotKickPlacement {
  kind: SpotKickKind;
  ballX: number;
  ballZ: number;
  goalDir: 1 | -1;
}

export function defaultSpotKick(userSide: "home" | "away"): { x: number; z: number } {
  return { x: userSide === "home" ? 22 : -22, z: 0 };
}

export function resolveSpotKick(x: number, z: number, userSide: "home" | "away"): SpotKickPlacement {
  const p = pitchClamp(x, z);
  const inAway = inPenaltyArea(p.x, p.z, "away");
  const inHome = inPenaltyArea(p.x, p.z, "home");
  if (inAway || inHome) {
    const goalDir: 1 | -1 = inHome && !inAway ? -1 : 1;
    return { kind: "PENALTY", ballX: goalDir * (HALF_LENGTH - PENALTY_SPOT), ballZ: 0, goalDir };
  }
  return {
    kind: "FREE_KICK",
    ballX: p.x,
    ballZ: p.z,
    goalDir: userSide === "home" ? 1 : -1,
  };
}
