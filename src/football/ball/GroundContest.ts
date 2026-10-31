import { clamp, normalize2, stat01 } from "../../core/math";
import type { Ball } from "./Ball";
import type { Player } from "../players/Player";
import { tacklingStat } from "../players/TackleModel";

export type DisturbResult = "none" | "poke" | "loose";

/** How well a player can claim / disturb a loose ground ball. */
export function groundContestWeight(player: Player, ball: Ball): number {
  const dist = player.distTo(ball.x, ball.z);
  const control = stat01(player.attrs.control);
  const reactions = stat01(player.attrs.reactions ?? player.attrs.composure);
  const strength = stat01(player.attrs.strength);
  const tackle = stat01(tacklingStat(player));
  const pace = stat01(player.attrs.pace);
  const bx = ball.vx;
  const bz = ball.vz;
  const speed = Math.hypot(bx, bz);
  // Closing on the ball's path beats standing still next to it.
  let closing = 0;
  if (speed > 0.35) {
    const toBall = normalize2(ball.x - player.x, ball.z - player.z);
    const ballDir = normalize2(bx, bz);
    const approach = player.vx * toBall.x + player.vz * toBall.z;
    const headOn = -(toBall.x * ballDir.x + toBall.z * ballDir.z);
    closing = clamp(approach / 7, 0, 1) * 0.35 + clamp(headOn, 0, 1) * 0.2;
  } else {
    closing = clamp(player.speed / 6, 0, 1) * 0.15;
  }
  return (
    2.05 -
    dist +
    control * 0.55 +
    reactions * 0.32 +
    strength * 0.22 +
    tackle * 0.28 +
    pace * 0.12 +
    closing +
    player.energy.value * 0.12 -
    (player.slideRecoverTimer > 0 ? 0.55 : 0) -
    (player.kickTimer > 0 ? 0.8 : 0)
  );
}

/**
 * Contested ground claim — weighted dice when both sides are in reach.
 * Lone / same-side contests stay deterministic (best weight wins).
 */
export function resolveGroundDuel(
  challengers: Player[],
  ball: Ball,
  rng: () => number = Math.random,
  upsetMul = 1,
  opts?: { favorSide?: "home" | "away" | null; favorBonus?: number },
): { winner: Player; contested: boolean; margin: number } | null {
  if (!challengers.length) return null;
  if (challengers.length === 1) {
    return { winner: challengers[0]!, contested: false, margin: 1.5 };
  }

  const favorSide = opts?.favorSide ?? null;
  const favorBonus = opts?.favorBonus ?? 0;
  const ranked = challengers
    .map((p) => ({
      p,
      w: groundContestWeight(p, ball) + (favorSide && p.side === favorSide ? favorBonus : 0),
    }))
    .sort((a, b) => b.w - a.w);

  const sides = new Set(challengers.map((c) => c.side));
  if (sides.size < 2) {
    return { winner: ranked[0]!.p, contested: false, margin: ranked[0]!.w - (ranked[1]?.w ?? ranked[0]!.w - 1) };
  }

  // Best candidate per side, then dice (OpenSWOS-style contest roll).
  const bestHome = ranked.find((r) => r.p.side === "home");
  const bestAway = ranked.find((r) => r.p.side === "away");
  if (!bestHome || !bestAway) {
    return { winner: ranked[0]!.p, contested: true, margin: 0.2 };
  }

  const a = bestHome.w;
  const b = bestAway.w;
  const total = Math.max(0.08, a + b);
  // Soften huge mismatches slightly so weaker pressers still upset sometimes.
  const homeChance = clamp(0.5 + ((a - b) / total) * 0.72, 0.12, 0.88);
  const upset = clamp(0.08 * upsetMul, 0, 0.2);
  const roll = rng();
  let winner = roll < homeChance ? bestHome.p : bestAway.p;
  if (Math.abs(a - b) < 0.45 * upsetMul && rng() < upset) {
    winner = winner === bestHome.p ? bestAway.p : bestHome.p;
  }
  return { winner, contested: true, margin: Math.abs(a - b) };
}

/** Absolute facing delta in radians (shortest path). */
export function facingDelta(prev: number, next: number): number {
  let d = next - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Chance to spill the ball when cutting hard at speed.
 * Control / dribbling / balance resist; pressure and fatigue amplify.
 */
export function overTurnLooseChance(
  player: Player,
  turnRate: number,
  pressure: number,
  mul = 1,
): number {
  if (player.speed < 3.1 || turnRate < 2.4) return 0;
  const drib = stat01(player.attrs.dribbling);
  const control = stat01(player.attrs.control);
  const balance = stat01(player.attrs.balance ?? player.attrs.strength);
  const cut = clamp((turnRate - 2.4) / 4.2, 0, 1);
  const pace = clamp((player.speed - 3.1) / 7, 0, 1);
  const raw =
    cut *
    pace *
    (0.18 + pressure * 0.28) *
    (1.15 - drib * 0.45) *
    (1.1 - control * 0.35) *
    (1.08 - balance * 0.3) *
    (1.15 - player.energy.value * 0.35) *
    mul;
  return clamp(raw, 0, 0.42);
}

/**
 * Close defender pokes / shoulders the ball without needing a slide.
 * Players only nudge speed + partial direction — never teleport-steal.
 */
export function tryDefenderDisturbance(
  ball: Ball,
  carrier: Player,
  opponents: Player[],
  disturbMul = 1,
  rng: () => number = Math.random,
  /** Frame dt — converts the per-second poke rate into a per-frame probability. */
  dt = 1 / 60,
): DisturbResult {
  if (carrier.isGK || carrier.ballControlLockout > 0) return "none";
  const ballSpeed = Math.hypot(ball.vx, ball.vz);
  let best: { def: Player; dist: number; weight: number } | null = null;

  for (const def of opponents) {
    if (def.sentOff || def.isGK || def.kickTimer > 0) continue;
    if (def.sliding || def.slideRecoverTimer > 0.35) continue;
    const dist = def.distTo(ball.x, ball.z);
    // Tighter — only genuine contact on the ball, not a multi-man ring.
    if (dist > 0.95) continue;
    const toCarrier = def.distTo(carrier.x, carrier.z);
    if (toCarrier > 1.75) continue;
    const w =
      (1.15 - dist) +
      stat01(tacklingStat(def)) * 0.45 +
      stat01(def.attrs.strength) * 0.25 +
      stat01(def.attrs.defending) * 0.2 +
      clamp(def.speed / 8, 0, 1) * 0.15 -
      stat01(carrier.attrs.control) * 0.35 -
      stat01(carrier.attrs.dribbling) * 0.25 -
      (carrier.jockeying ? 0.22 : 0);
    if (!best || w > best.weight) best = { def, dist, weight: w };
  }

  if (!best || best.weight < 0.38) return "none";

  const def = best.def;
  const resist =
    stat01(carrier.attrs.control) * 0.4 +
    stat01(carrier.attrs.dribbling) * 0.35 +
    stat01(carrier.attrs.strength) * 0.2 +
    carrier.energy.value * 0.12;
  // Per-second rate (~0.2–1.6 Hz), not a per-frame roll that guaranteed spam.
  const pokeRate = clamp((0.55 + best.weight * 0.9 - resist * 0.85) * disturbMul, 0.2, 1.6);
  const pokeChance = 1 - Math.exp(-pokeRate * Math.max(dt, 1 / 120));
  if (rng() > pokeChance) return "none";

  // Direction: away from defender through the ball (partial redirect).
  const away = normalize2(ball.x - def.x, ball.z - def.z);
  const along = normalize2(carrier.vx + Math.sin(carrier.facing) * 0.3, carrier.vz + Math.cos(carrier.facing) * 0.3);
  const mixX = away.x * 0.72 + along.x * 0.28;
  const mixZ = away.z * 0.72 + along.z * 0.28;
  const dir = normalize2(mixX, mixZ);
  const impulse = (3.2 + best.weight * 3.4 + clamp(def.speed * 0.4, 0, 2.6)) * clamp(disturbMul, 0.65, 1.35);
  // Preserve some existing motion — defender changes pattern, does not reset it.
  const keep = clamp(0.28 + ballSpeed * 0.03, 0.22, 0.48);
  ball.vx = ball.vx * keep + dir.x * impulse;
  ball.vz = ball.vz * keep + dir.z * impulse;
  ball.vy = Math.max(ball.vy, 0.35 + rng() * 0.55);
  ball.y = Math.max(ball.y, 0.18);
  // Cooldown so the same defender cannot re-poke every frame.
  def.kickTimer = Math.max(def.kickTimer, 0.55);

  const spill =
    pokeRate > 1.05 ||
    (best.weight > 0.85 && rng() < 0.62 * disturbMul) ||
    (carrier.speed > 6.5 && rng() < 0.48);
  return spill ? "loose" : "poke";
}
