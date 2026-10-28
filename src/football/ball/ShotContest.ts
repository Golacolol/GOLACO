import { clamp } from "../../core/math";
import type { Ball } from "../ball/Ball";
import type { Player } from "../players/Player";

export function nearbyDefenders(shooter: Player, opponents: Player[], radius = 3.45): Player[] {
  return opponents.filter((o) => !o.isGK && shooter.distTo(o.x, o.z) < radius);
}

export function crowdRicochetChance(count: number, pressure: number, shotPower = 24): number {
  if (count <= 0) return 0;
  const powerBias = clamp((shotPower - 20) * 0.012, 0, 0.18);
  return clamp(0.32 + (count - 1) * 0.2 + pressure * 0.28 + powerBias, 0, 0.92);
}

/**
 * Deflection off a blocking defender.
 * Stronger shots bias toward continuing goalward / wide of the posts so the ball
 * often goes behind for a corner (last touch = defender).
 */
export function ricochetOffDefender(
  ball: Ball,
  defender: Player,
  shooterSide: "home" | "away",
  opts?: { power?: number },
): void {
  const attackDir = shooterSide === "home" ? 1 : -1;
  const incoming = Math.hypot(ball.vx, ball.vz);
  const power = opts?.power ?? Math.max(incoming, 18);
  const speed = Math.max(8.5, incoming * 0.9, power * 0.42);
  // Stronger efforts more often stay live toward the byline.
  const cornerBias = clamp(0.52 + (power - 22) * 0.018, 0.48, 0.88);

  ball.x = defender.x + (Math.random() - 0.5) * 0.35;
  ball.z = defender.z + (Math.random() - 0.5) * 0.35;
  ball.ownerId = null;

  if (Math.random() < cornerBias) {
    // Continue toward the byline, usually wide of the posts → corner territory.
    const side = Math.sign(defender.z || ball.vz || Math.random() - 0.5) || 1;
    const wide = 7 + Math.random() * 11;
    ball.vx = attackDir * speed * (0.62 + Math.random() * 0.55);
    ball.vz = side * wide * (0.42 + Math.random() * 0.4) + (Math.random() - 0.5) * 2.5;
    ball.vy = 0.75 + Math.random() * 2.4;
    return;
  }

  // Bounce back upfield / loose in the box.
  ball.vx = -attackDir * speed * (0.28 + Math.random() * 0.4) + (Math.random() - 0.5) * 4;
  ball.vz = (Math.random() - 0.5) * 9;
  ball.vy = 0.7 + Math.random() * 1.6;
}

/** Deterministic helper for tests: probability a block aims at the byline. */
export function blockCornerBias(shotPower: number): number {
  return clamp(0.52 + (shotPower - 22) * 0.018, 0.48, 0.88);
}
