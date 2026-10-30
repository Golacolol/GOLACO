import { BALL_RADIUS } from "../constants";
import { clamp, lerp, normalize2, stat01 } from "../../core/math";
import type { Player } from "../players/Player";
import type { Ball } from "./Ball";
import { facingDelta, overTurnLooseChance } from "./GroundContest";

export type TouchResult = "keep" | "loose";

export interface DribbleOpts {
  pressure: number;
  dt: number;
  /** 1 = legacy sticky follow; lower = ball freer between / at touches (REAL ~0.5). */
  magnetMul?: number;
  /** Scales sharp-turn spill chance. */
  turnLooseMul?: number;
  rng?: () => number;
}

export function dribbleAhead(speed: number, control: number, sprinting: boolean): number {
  const run = clamp((speed - 2.2) / 8.5, 0, 1);
  const base = lerp(0.62, sprinting ? 1.55 : 1.22, run);
  return base * lerp(1.12, 0.86, stat01(control));
}

export function touchInterval(speed: number): number {
  if (speed > 8) return 0.26;
  if (speed > 5.5) return 0.34;
  if (speed > 3) return 0.42;
  return 0.52;
}

/**
 * Open-play carry: players only push the ball (partial speed + direction).
 * No teleport-to-feet magnet — the ball keeps its own motion between touches.
 */
export function stepDribble(ball: Ball, player: Player, pressureOrOpts: number | DribbleOpts, maybeDt?: number): TouchResult {
  const opts: DribbleOpts =
    typeof pressureOrOpts === "number"
      ? { pressure: pressureOrOpts, dt: maybeDt ?? 1 / 60 }
      : pressureOrOpts;
  const { pressure, dt } = opts;
  const magnetMul = opts.magnetMul ?? 1;
  const turnLooseMul = opts.turnLooseMul ?? 1;
  const rng = opts.rng ?? Math.random;

  player.touchTimer -= dt;
  const control = stat01(player.attrs.control);
  const drib = stat01(player.attrs.dribbling);
  const close = player.jockeying;
  const fx = Math.sin(player.facing);
  const fz = Math.cos(player.facing);
  const ahead = dribbleAhead(player.speed, player.attrs.control, player.sprinting) * (close ? 0.88 : 1);
  const tx = player.x + fx * ahead;
  const tz = player.z + fz * ahead;
  // Collect reach; retain hysteresis is larger so a carry does not drop mid-stride.
  const reach = 1.65 + (1 - control) * 0.22 + (close ? 0.12 : 0);

  // Sharp cut at pace — classic over-turn spill (rare unless heavily pressured).
  const turnRate = Math.abs(facingDelta(player.prevFacing, player.facing)) / Math.max(dt, 1 / 120);
  const spill = overTurnLooseChance(player, turnRate, pressure, turnLooseMul);
  if (spill > 0 && rng() < spill * 0.55) {
    const away = normalize2(ball.x - player.x + fx * 0.2, ball.z - player.z + fz * 0.2);
    const kick = 1.6 + player.speed * 0.28 + pressure * 1.1;
    ball.vx = ball.vx * 0.45 + away.x * kick + (rng() - 0.5) * 0.9;
    ball.vz = ball.vz * 0.45 + away.z * kick + (rng() - 0.5) * 0.9;
    ball.vy = Math.max(ball.vy, 0.15);
    return "loose";
  }

  if (player.ballControlLockout > 0) {
    // After a poke: no magnet — just check the ball hasn't run away.
    if (player.distTo(ball.x, ball.z) > reach + 0.45) return "loose";
    return "keep";
  }

  if (player.touchTimer <= 0) {
    player.touchTimer = touchInterval(player.speed) * (close ? 1.12 : 0.92);
    if (player.distTo(ball.x, ball.z) > reach + 0.35) return "loose";

    // Sticky carry: pull the ball onto the stride and match player velocity.
    const scatter =
      ((1 - drib) * 0.18 + pressure * 0.28 + (1 - player.energy.value) * 0.12) * (close ? 0.5 : 1);
    const ox = (rng() - 0.5) * scatter;
    const oz = (rng() - 0.5) * scatter;
    const magnet = lerp(0.55, 0.82, control) * magnetMul * (close ? 1.1 : 1);
    ball.x += (tx + ox - ball.x) * clamp(magnet, 0.35, 0.92);
    ball.z += (tz + oz - ball.z) * clamp(magnet, 0.35, 0.92);
    if (ball.y < BALL_RADIUS + 0.35) ball.y = BALL_RADIUS;

    const intent = 0.85 + player.speed * 0.62;
    const keep = lerp(0.18, 0.1, magnetMul);
    ball.vx = ball.vx * keep + player.vx * 0.62 + fx * intent * (0.22 + control * 0.1);
    ball.vz = ball.vz * keep + player.vz * 0.62 + fz * intent * (0.22 + control * 0.1);
    ball.vy *= 0.28;

    const pressSoft = pressure > 0.55 ? 0.85 : 0.62;
    const looseChance = clamp(
      pressure * 0.14 * pressSoft * (1.15 - drib) * (1.1 - player.energy.value * 0.35) * (close ? 0.35 : 1) *
        (1.05 - magnetMul * 0.35),
      0,
      0.18,
    );
    if (pressure > 0.55 && rng() < looseChance) return "loose";
  } else {
    // Between touches: keep the ball glued under the stride while running.
    const follow = lerp(0.22, 0.55, control) * magnetMul * (close ? 1.2 : 1);
    const dist = player.distTo(ball.x, ball.z);
    if (follow > 0.01 && dist < reach + 0.55) {
      const pull = Math.min(1, follow * dt * 10);
      ball.x += (tx - ball.x) * pull;
      ball.z += (tz - ball.z) * pull;
      ball.vx = lerp(ball.vx, player.vx + fx * player.speed * 0.15, pull * 0.65);
      ball.vz = lerp(ball.vz, player.vz + fz * player.speed * 0.15, pull * 0.65);
    }
    if (ball.y < BALL_RADIUS + 0.08) ball.y = BALL_RADIUS;
  }

  // Retain beyond collect reach so a take cannot instantly drop (hysteresis).
  if (player.distTo(ball.x, ball.z) > 2.55 + (1 - control) * 0.3) return "loose";
  return "keep";
}

export function firstTouchScatter(control: number, pressure: number, energy: number, aerial: boolean): number {
  const c = stat01(control);
  const air = aerial ? 1.55 : 1;
  return (1 - c) * 0.85 * air + pressure * 0.55 + (1 - energy) * 0.25;
}

export function scaledFirstTouch(control: number, pressure: number, energy: number, aerial: boolean, mul: number): number {
  return firstTouchScatter(control, pressure, energy, aerial) * mul;
}
