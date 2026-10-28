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
  const reach = 1.55 + (1 - control) * 0.35 + (close ? 0.12 : 0);

  // Sharp cut at pace — classic over-turn spill.
  const turnRate = Math.abs(facingDelta(player.prevFacing, player.facing)) / Math.max(dt, 1 / 120);
  const spill = overTurnLooseChance(player, turnRate, pressure, turnLooseMul);
  if (spill > 0 && rng() < spill) {
    const away = normalize2(ball.x - player.x + fx * 0.2, ball.z - player.z + fz * 0.2);
    const kick = 2.2 + player.speed * 0.35 + pressure * 1.4;
    ball.vx = ball.vx * 0.4 + away.x * kick + (rng() - 0.5) * 1.2;
    ball.vz = ball.vz * 0.4 + away.z * kick + (rng() - 0.5) * 1.2;
    ball.vy = Math.max(ball.vy, 0.2);
    return "loose";
  }

  if (player.ballControlLockout > 0) {
    // After a poke: no magnet — just check the ball hasn't run away.
    if (player.distTo(ball.x, ball.z) > reach + 0.35) return "loose";
    return "keep";
  }

  if (player.touchTimer <= 0) {
    player.touchTimer = touchInterval(player.speed) * (close ? 1.12 : 1);
    if (player.distTo(ball.x, ball.z) > reach) return "loose";

    // Partial foot impulse: blend existing ball motion with intended push.
    const scatter =
      ((1 - drib) * 0.28 + pressure * 0.42 + (1 - player.energy.value) * 0.2) * (close ? 0.55 : 1);
    const ox = (rng() - 0.5) * scatter;
    const oz = (rng() - 0.5) * scatter;
    const magnet = lerp(0.28, 0.55, control) * magnetMul * (close ? 1.15 : 1);
    ball.x += (tx + ox - ball.x) * clamp(magnet, 0.12, 0.72);
    ball.z += (tz + oz - ball.z) * clamp(magnet, 0.12, 0.72);
    if (ball.y < BALL_RADIUS + 0.35) ball.y = BALL_RADIUS;

    const intent = 1.1 + player.speed * 0.55;
    const keep = lerp(0.38, 0.22, magnetMul); // freer ball keeps more of its prior velocity
    ball.vx = ball.vx * keep + player.vx * 0.4 + fx * intent * (0.28 + control * 0.12);
    ball.vz = ball.vz * keep + player.vz * 0.4 + fz * intent * (0.28 + control * 0.12);
    ball.vy *= 0.35;

    const looseChance = clamp(
      pressure * 0.22 * (1.2 - drib) * (1.15 - player.energy.value * 0.4) * (close ? 0.42 : 1) *
        (1.15 - magnetMul * 0.25),
      0,
      0.32,
    );
    if (pressure > 0.38 && rng() < looseChance) return "loose";
  } else {
    // Between touches: weak attraction only — physics owns the ball.
    const follow = lerp(0.03, 0.16, control) * magnetMul * (close ? 1.35 : 1);
    if (follow > 0.01 && player.distTo(ball.x, ball.z) < reach + 0.25) {
      ball.x += (tx - ball.x) * Math.min(1, follow * dt * 6);
      ball.z += (tz - ball.z) * Math.min(1, follow * dt * 6);
    }
    if (ball.y < BALL_RADIUS + 0.08) ball.y = BALL_RADIUS;
  }

  if (player.distTo(ball.x, ball.z) > 1.72 + (1 - control) * 0.45) return "loose";
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
