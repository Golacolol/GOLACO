/**
 * Mesh-agnostic facing controller.
 * Priority: kick/pass aim → receive into ball → move intent → soft look-at ball when idle.
 */
import { clamp, stat01 } from "../../core/math";
import type { Player } from "./Player";

/** Local copy — avoid circular import with PlayerMovement. */
function turnRateFromAttrs(agility: number, speed: number, jockeying: boolean): number {
  const ag = stat01(agility);
  const base = jockeying ? 2.85 : speed < 1.25 ? 1.55 : 2.15;
  return base + ag * 1.15;
}

export type FacingHint = {
  /** Preferred look direction (world XZ). */
  dirX: number;
  dirZ: number;
  /** Higher wins when multiple hints fire in one frame. */
  priority: number;
};

export const FACING_PRIORITY = {
  KICK: 100,
  RECEIVE: 70,
  MOVE: 40,
  BALL_IDLE: 15,
} as const;

/** Shortest signed yaw delta into [-π, π]. */
export function yawDelta(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function yawToward(dirX: number, dirZ: number): number {
  return Math.atan2(dirX, dirZ);
}

/** Hard-set facing (set pieces / keeper snaps). */
export function snapFacing(player: Player, dirX: number, dirZ: number): void {
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-4) return;
  player.facing = yawToward(dirX / len, dirZ / len);
}

/**
 * Rate-limited turn toward a world direction.
 * Returns absolute radians turned this step.
 */
export function turnFacingToward(
  player: Player,
  dirX: number,
  dirZ: number,
  dt: number,
  opts?: { turnMul?: number; jockeying?: boolean },
): number {
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-4 || dt <= 0) return 0;
  const desired = yawToward(dirX / len, dirZ / len);
  const diff = yawDelta(player.facing, desired);
  const agility =
    player.attrs.agility ?? Math.round((player.attrs.dribbling + player.attrs.control + player.attrs.pace) / 3);
  const maxRate =
    turnRateFromAttrs(agility, player.speed, opts?.jockeying ?? player.jockeying) * (opts?.turnMul ?? 1);
  const step = maxRate * dt;
  const applied = clamp(diff, -step, step);
  player.facing += applied;
  return Math.abs(applied);
}

/** Pick the highest-priority hint with a usable direction. */
export function resolveFacingHint(hints: FacingHint[]): FacingHint | null {
  let best: FacingHint | null = null;
  for (const h of hints) {
    if (Math.hypot(h.dirX, h.dirZ) < 1e-4) continue;
    if (!best || h.priority > best.priority) best = h;
  }
  return best;
}

/**
 * Soft look-at ball when nearly idle and the ball is close enough to care.
 * Returns a hint or null.
 */
export function idleBallFacingHint(
  player: Player,
  ballX: number,
  ballZ: number,
  opts?: { maxDist?: number; minSpeed?: number },
): FacingHint | null {
  const maxDist = opts?.maxDist ?? 18;
  const minSpeed = opts?.minSpeed ?? 0.85;
  if (player.speed > minSpeed) return null;
  const dx = ballX - player.x;
  const dz = ballZ - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4 || dist > maxDist) return null;
  return { dirX: dx, dirZ: dz, priority: FACING_PRIORITY.BALL_IDLE };
}

/** Receive: face into the ball's approach (opposite velocity). */
export function receiveFacingHint(
  ballVx: number,
  ballVz: number,
  opts?: { minBallSpeed?: number },
): FacingHint | null {
  const speed = Math.hypot(ballVx, ballVz);
  if (speed < (opts?.minBallSpeed ?? 1.2)) return null;
  return { dirX: -ballVx, dirZ: -ballVz, priority: FACING_PRIORITY.RECEIVE };
}

export function kickFacingHint(dirX: number, dirZ: number): FacingHint {
  return { dirX, dirZ, priority: FACING_PRIORITY.KICK };
}

export function moveFacingHint(dirX: number, dirZ: number): FacingHint {
  return { dirX, dirZ, priority: FACING_PRIORITY.MOVE };
}

/**
 * Apply the best hint. Kick priority uses a faster turn mul so hips square before release.
 */
export function applyFacingHints(
  player: Player,
  hints: FacingHint[],
  dt: number,
  opts?: { turnMul?: number; jockeying?: boolean },
): boolean {
  const best = resolveFacingHint(hints);
  if (!best) return false;
  const kickBoost = best.priority >= FACING_PRIORITY.KICK ? 1.65 : best.priority >= FACING_PRIORITY.RECEIVE ? 1.25 : 1;
  turnFacingToward(player, best.dirX, best.dirZ, dt, {
    turnMul: (opts?.turnMul ?? 1) * kickBoost,
    jockeying: opts?.jockeying,
  });
  return true;
}
