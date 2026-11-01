import { normalize2, stat01 } from "../../core/math";
import { HALF_LENGTH, HALF_WIDTH, SPEED_BURST_DRAIN, SPEED_BURST_MIN_ENERGY, SPEED_BURST_SPEED_MUL } from "../constants";
import { applyFacingHints, moveFacingHint, type FacingHint } from "./FacingControl";
import type { Player } from "./Player";

/** Playable inset — keep outfielders off the hard pitch barrier. */
const BOUND_X = HALF_LENGTH - 0.55;
const BOUND_Z = HALF_WIDTH - 0.55;

/**
 * Top speed from pace (m/s game units).
 * Pace 70 jog ≈ 6.9, sprint ≈ 8.7; pace 90 sprint ≈ 9.8 — slightly under the old peaks.
 */
export function topSpeedFromPace(pace: number, sprinting: boolean, jockeying: boolean, closeControl = false): number {
  const p = stat01(pace);
  if (jockeying || closeControl) return 2.95 + p * 1.15;
  if (sprinting) return 6.55 + p * 3.25;
  return 5.2 + p * 2.55;
}

/** Acceleration toward target velocity — higher acceleration reaches sprint sooner. */
export function accelFromAttrs(pace: number, acceleration: number, jockeying: boolean): number {
  const a = stat01(acceleration);
  const p = stat01(pace);
  // Acceleration dominates time-to-speed; pace contributes a little residual.
  if (jockeying) return 18 + a * 8 + p * 1.5;
  return 9 + a * 12 + p * 3;
}

/** Turn rate from agility; balance reduces speed loss on sharp turns. */
export function turnRateFromAttrs(agility: number, speed: number, jockeying: boolean): number {
  const ag = stat01(agility);
  const base = jockeying ? 2.85 : speed < 1.25 ? 1.55 : 2.15;
  return base + ag * 1.15;
}

export function movePlayer(
  player: Player,
  dt: number,
  dirX: number,
  dirZ: number,
  sprint: boolean,
  jockey: boolean,
  extras?: {
    hasBall?: boolean;
    pressure?: number;
    accelMul?: number;
    speedMul?: number;
    turnMul?: number;
    drainMul?: number;
    matchDrainScale?: number;
    grip?: number;
    boost?: boolean;
    /** Extra facing hints (kick / receive / ball) applied with move intent. */
    facingHints?: FacingHint[];
  },
): void {
  if (player.sentOff) return;
  if (player.sliding) return;
  if (player.slideRecoverTimer > 0) {
    player.slideRecoverTimer = Math.max(0, player.slideRecoverTimer - dt);
    player.vx *= Math.pow(0.12, dt);
    player.vz *= Math.pow(0.12, dt);
    player.x += player.vx * dt;
    player.z += player.vz * dt;
    applyPitchBounds(player);
    player.sprinting = false;
    player.boosting = false;
    player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
    return;
  }
  const travel = Math.hypot(dirX, dirZ);
  // Callers that want a hard stop pass (0,0). A short non-zero vector is still a
  // direction (close-down / soft-carry) — never treat ~0.4–0.9m deltas as "arrived"
  // or nearest chasers freeze short of the ball while the clock runs.
  const arrived = travel < 0.08;
  let intent = arrived ? { x: 0, z: 0 } : normalize2(dirX, dirZ);
  intent = deflectFromBoundary(player, intent);
  const hasIntent = !arrived && Math.hypot(intent.x, intent.z) > 0.05;
  const wantBoost = !!(extras?.boost && !jockey && !player.isGK && player.energy.value > SPEED_BURST_MIN_ENERGY);
  player.boosting = wantBoost;
  player.sprinting = ((sprint && hasIntent) || (wantBoost && hasIntent)) && !jockey && !player.isGK;
  player.jockeying = jockey && !player.isGK;

  const pace = player.attrs.pace;
  const acceleration = player.attrs.acceleration ?? pace;
  const balance = player.attrs.balance ?? Math.round((player.attrs.strength + player.attrs.control) / 2);

  let max = hasIntent
    ? topSpeedFromPace(pace, player.sprinting, player.jockeying, extras?.hasBall && player.jockeying)
    : 3.8 + stat01(pace) * 1.8;
  max *= player.energy.speedMultiplier;
  if (player.isGK) max *= 0.92;
  max *= extras?.speedMul ?? 1;
  max *= extras?.grip ?? 1;
  if (wantBoost && hasIntent) max *= SPEED_BURST_SPEED_MUL;
  // Close control (jockey + ball): slight extra speed cost for tighter stickiness.
  if (player.jockeying && (extras?.hasBall ?? player.hasBall)) max *= 0.9;

  const accel =
    accelFromAttrs(pace, acceleration, player.jockeying) *
    player.energy.accelMultiplier *
    (extras?.accelMul ?? 1) *
    (wantBoost && hasIntent ? 1.18 : 1);
  // Tired players stop committing to sprint even when the stick asks for it.
  if (player.sprinting && player.energy.sprintWillingness < 0.48) {
    player.sprinting = false;
    max = topSpeedFromPace(pace, false, player.jockeying, extras?.hasBall && player.jockeying);
    max *= player.energy.speedMultiplier;
    if (player.isGK) max *= 0.92;
    max *= extras?.speedMul ?? 1;
    max *= extras?.grip ?? 1;
    if (player.jockeying && (extras?.hasBall ?? player.hasBall)) max *= 0.9;
  }

  const targetVx = intent.x * max;
  const targetVz = intent.z * max;
  const prevSpeed = player.speed;
  // Slower lerp so acceleration rating actually governs time-to-speed.
  player.vx += (targetVx - player.vx) * Math.min(1, accel * dt * 0.075);
  player.vz += (targetVz - player.vz) * Math.min(1, accel * dt * 0.075);
  if (!hasIntent) {
    player.vx *= Math.pow(0.08, dt);
    player.vz *= Math.pow(0.08, dt);
  }

  {
    const hints: FacingHint[] = [...(extras?.facingHints ?? [])];
    // Face run intent as soon as the stick/AI asks — don't wait for speed to build.
    if (hasIntent) {
      hints.push(moveFacingHint(intent.x, intent.z));
    } else if (player.speed > 1.1) {
      // Coasting: keep hips on travel so skinned run clips don't skate sideways.
      hints.push(moveFacingHint(player.vx, player.vz));
    }
    const facingBefore = player.facing;
    if (hints.length) {
      applyFacingHints(player, hints, dt, {
        turnMul: extras?.turnMul,
        jockeying: player.jockeying,
      });
    }
    const turned = Math.abs(player.facing - facingBefore);
    // Sharp turns shed speed; balance resists that loss.
    if (turned > 0.08 && prevSpeed > 2.5) {
      const shed = (1 - stat01(balance) * 0.55) * turned * 0.35;
      player.vx *= Math.max(0.72, 1 - shed);
      player.vz *= Math.max(0.72, 1 - shed);
    }
  }

  player.x += player.vx * dt;
  player.z += player.vz * dt;
  applyPitchBounds(player);

  let intensity = energyIntensity(player, extras?.hasBall ?? player.hasBall, extras?.pressure ?? 0) * (extras?.drainMul ?? 1);
  if (wantBoost) intensity = SPEED_BURST_DRAIN * (extras?.drainMul ?? 1);
  player.energy.update(dt, intensity, wantBoost ? 0.08 : 0.12, extras?.matchDrainScale ?? 1);
  player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
}

/** Soft walls: clamp inside the pitch and kill velocity into the barrier. */
export function applyPitchBounds(player: Player): void {
  if (player.x > BOUND_X) {
    player.x = BOUND_X;
    if (player.vx > 0) player.vx = 0;
  } else if (player.x < -BOUND_X) {
    player.x = -BOUND_X;
    if (player.vx < 0) player.vx = 0;
  }
  if (player.z > BOUND_Z) {
    player.z = BOUND_Z;
    if (player.vz > 0) player.vz = 0;
  } else if (player.z < -BOUND_Z) {
    player.z = -BOUND_Z;
    if (player.vz < 0) player.vz = 0;
  }
}

function deflectFromBoundary(player: Player, intent: { x: number; z: number }): { x: number; z: number } {
  let { x, z } = intent;
  const edge = 0.4;
  if (player.x >= BOUND_X - edge && x > 0) x = 0;
  if (player.x <= -BOUND_X + edge && x < 0) x = 0;
  if (player.z >= BOUND_Z - edge && z > 0) z = 0;
  if (player.z <= -BOUND_Z + edge && z < 0) z = 0;
  if (Math.abs(player.x) > BOUND_X - 1.2 && Math.abs(x) < 0.05) {
    x = -Math.sign(player.x) * 0.35;
  }
  if (Math.abs(player.z) > BOUND_Z - 1.2 && Math.abs(z) < 0.05) {
    z = -Math.sign(player.z || 1) * 0.45;
  }
  const len = Math.hypot(x, z);
  if (len < 0.04) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

export function energyIntensity(player: Player, hasBall: boolean, pressure: number): number {
  const spd = player.speed;
  if (player.boosting) return SPEED_BURST_DRAIN;
  if (player.sprinting && hasBall) return 1.05 + pressure * 0.28;
  if (player.sprinting) return 0.9;
  if (hasBall && spd > 5) return 0.58 + pressure * 0.18;
  if (spd > 5.5) return 0.42;
  // Slow jog / walk sits well under the recover threshold so standing off pays off.
  if (spd > 3.2) return hasBall ? 0.32 : 0.22;
  if (spd > 1.2) return hasBall ? 0.16 : 0.1;
  return 0.02;
}

export function separatePlayers(players: Player[]): void {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius - 0.08;
      if (d > 0.01 && d < min) {
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        // Balance + strength resist displacement slightly.
        const aMass = 0.85 + stat01(a.attrs.strength) * 0.15 + stat01(a.attrs.balance ?? a.attrs.strength) * 0.1;
        const bMass = 0.85 + stat01(b.attrs.strength) * 0.15 + stat01(b.attrs.balance ?? b.attrs.strength) * 0.1;
        const total = aMass + bMass;
        a.x -= nx * push * (bMass / total);
        a.z -= nz * push * (bMass / total);
        b.x += nx * push * (aMass / total);
        b.z += nz * push * (aMass / total);
      }
    }
  }
}
