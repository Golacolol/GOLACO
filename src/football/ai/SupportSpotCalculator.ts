/**
 * Buckland Simple Soccer support-spot grid — refreshable best pockets for
 * off-ball teammates. Scores passer safety, progress, and space.
 */
import { clamp, dist2 } from "../../core/math";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import { isInOffsidePosition } from "../rules/Offside";
import type { Player } from "../players/Player";
import { passingLaneQuality } from "./PassingAI";

export interface SupportSpot {
  x: number;
  z: number;
  score: number;
}

export interface SupportSpotOpts {
  /** Grid step in metres (default ~4). */
  step?: number;
  /** How far ahead of the carrier to search. */
  forwardReach?: number;
  /** Lateral half-width of the search. */
  widthReach?: number;
  /** Prefer deeper recycle spots in build-up. */
  buildup?: boolean;
}

/**
 * Score a candidate support coordinate for a carrier.
 * Higher = better pass-into pocket.
 */
export function scoreSupportSpot(
  carrier: Player,
  x: number,
  z: number,
  opponents: Player[],
  opts?: { buildup?: boolean },
): number {
  const buildup = !!opts?.buildup;
  const dx = x - carrier.x;
  const dz = z - carrier.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 4.5 || distance > (buildup ? 22 : 28)) return -1;
  const forward = dx * carrier.attackSign;
  if (forward < (buildup ? -4 : 1.5)) return -1;
  // Soft offside filter for the empty spot itself.
  if (opponents.length >= 2) {
    const phantom = { x, z, side: carrier.side, attackSign: carrier.attackSign, isGK: false } as Player;
    if (isInOffsidePosition(phantom, carrier.x, opponents)) return -1;
  }
  const lane = passingLaneQuality(carrier, x, z, opponents);
  if (lane < (buildup ? 0.42 : 0.36)) return -1;
  let nearest = 24;
  for (const op of opponents) {
    if (op.isGK) continue;
    nearest = Math.min(nearest, dist2(op.x, op.z, x, z));
  }
  const progress = clamp(forward / 18, 0, 1);
  const space = clamp(nearest / 10, 0, 1.2);
  // Reward half-space / channel outlets; only soft-penalise extreme touchline dumps.
  const widthPenalty = Math.abs(z) > 28 ? 0.18 : Math.abs(z) > 16 && Math.abs(z) < 26 ? -0.12 : 0;
  const pocket =
    distance > 10 && distance < 18 ? 0.35 : distance < 12 ? 0.18 : 0;
  return (
    progress * (buildup ? 0.55 : 0.85) +
    space * 0.7 +
    lane * 0.55 +
    pocket -
    widthPenalty -
    (buildup && forward > 14 ? 0.2 : 0)
  );
}

/**
 * Evaluate a coarse grid around the carrier and return the best N spots.
 */
export function bestSupportSpots(
  carrier: Player,
  opponents: Player[],
  opts?: SupportSpotOpts & { topN?: number },
): SupportSpot[] {
  const step = opts?.step ?? 4.2;
  const fwdReach = opts?.forwardReach ?? (opts?.buildup ? 16 : 22);
  const widthReach = opts?.widthReach ?? 22;
  const topN = opts?.topN ?? 3;
  const dir = carrier.attackSign;
  const spots: SupportSpot[] = [];

  for (let f = 5; f <= fwdReach; f += step) {
    for (let w = -widthReach; w <= widthReach; w += step) {
      const x = clamp(carrier.x + dir * f, -HALF_LENGTH + 3, HALF_LENGTH - 3);
      const z = clamp(carrier.z + w, -HALF_WIDTH + 2.5, HALF_WIDTH - 2.5);
      const score = scoreSupportSpot(carrier, x, z, opponents, { buildup: opts?.buildup });
      if (score > 0.15) spots.push({ x, z, score });
    }
  }
  spots.sort((a, b) => b.score - a.score);
  return spots.slice(0, topN);
}

/** Best single spot, or null if nothing is pass-safe. */
export function bestSupportSpot(
  carrier: Player,
  opponents: Player[],
  opts?: SupportSpotOpts,
): SupportSpot | null {
  return bestSupportSpots(carrier, opponents, { ...opts, topN: 1 })[0] ?? null;
}

/**
 * Pull a teammate's desired support target toward the nearest high-scoring spot.
 */
export function blendTowardSupportSpot(
  player: Player,
  carrier: Player,
  opponents: Player[],
  desiredX: number,
  desiredZ: number,
  opts?: SupportSpotOpts & { blend?: number },
): { x: number; z: number; spot: SupportSpot | null } {
  const spot = bestSupportSpot(carrier, opponents, opts);
  if (!spot) return { x: desiredX, z: desiredZ, spot: null };
  // Prefer the spot nearest this player's current desire / role side.
  const blend = opts?.blend ?? 0.42;
  const sameSide = Math.sign(player.anchorZ || 1) === Math.sign(spot.z || 1) || Math.abs(spot.z) < 6;
  const pull = sameSide ? blend : blend * 0.45;
  return {
    x: desiredX * (1 - pull) + spot.x * pull,
    z: desiredZ * (1 - pull) + spot.z * pull,
    spot,
  };
}
