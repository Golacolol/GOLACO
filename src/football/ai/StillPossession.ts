import type { Player } from "../players/Player";

export const STILL_POSSESSION_STEAL_SECONDS = 3.6;
export const STILL_POSSESSION_SPEED = 0.55;
/** Only gift the ball when an opponent is this close (or closer). */
export const STILL_POSSESSION_PRESSURE_DIST = 3.8;

export function closestOpposingPlayer(holder: Player, opponents: Player[]): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const op of opponents) {
    const d = op.distTo(holder.x, holder.z);
    if (d < bestD) {
      bestD = d;
      best = op;
    }
  }
  return best;
}

export function tickStillPossession(opts: {
  holder: Player | null;
  opponents: Player[];
  dt: number;
  prevStill: number;
  playing: boolean;
}): { stillTime: number; steal: Player | null } {
  const { holder, opponents, dt, prevStill, playing } = opts;
  if (!holder || holder.isGK || !playing) return { stillTime: 0, steal: null };
  const still = holder.speed < STILL_POSSESSION_SPEED;
  const stillTime = still ? prevStill + dt : 0;
  if (stillTime < STILL_POSSESSION_STEAL_SECONDS) return { stillTime, steal: null };
  const thief = closestOpposingPlayer(holder, opponents);
  if (!thief || thief.distTo(holder.x, holder.z) > STILL_POSSESSION_PRESSURE_DIST) {
    // Holding shape / recovering energy with no presser — keep possession.
    return { stillTime: STILL_POSSESSION_STEAL_SECONDS * 0.7, steal: null };
  }
  return { stillTime: 0, steal: thief };
}
