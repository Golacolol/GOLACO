import type { Player } from "./Player";
import type { Side } from "./Player";
import { aerialReachBonus } from "../ball/AerialContest";
import { awareness01, isAttackingDefender } from "../ai/DefensiveAI";

export interface SelectOpts {
  /** Side currently with the ball (null if loose). */
  possessingSide?: Side | null;
  /** Prefer aerial contestants (crosses / lofted balls). */
  aerial?: boolean;
}

function defensiveRoleBias(player: Player): number {
  if (player.slot.includes("CB") || player.slot.includes("DM")) return -4.2;
  if (player.slot === "LB" || player.slot === "RB" || player.slot === "LWB" || player.slot === "RWB") return -2.8;
  if (player.slot.includes("CM")) return -1.4;
  if (isAttackingDefender(player)) return 5.5;
  return 0;
}

/**
 * Pick who to control. On defense prefers goal-side cover / intercept lanes
 * over pure nearest-to-ball; on aerials leans on heading/reach.
 */
export function autoSelectPlayer(
  players: Player[],
  side: Side,
  ballX: number,
  ballZ: number,
  excludeGk = true,
  opts?: SelectOpts,
): Player {
  const defending = opts?.possessingSide != null && opts.possessingSide !== side;
  const loose = opts?.possessingSide == null;
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const p of players) {
    if (p.side !== side) continue;
    if (excludeGk && p.isGK) continue;
    if (p.sentOff || p.celebrating) continue;
    const d = p.distTo(ballX, ballZ);
    // Soften pure nearest-ball when defending so cover/lanes can win.
    let score = d * (defending || loose ? 0.42 : 1) + (p.hasBall ? -1.5 : 0);
    if (defending || loose) {
      const ownGoal = p.ownGoalX();
      // Goal-side: between ball and own goal scores better (lower).
      const ballFromGoal = Math.hypot(ballX - ownGoal, ballZ);
      const playerFromGoal = Math.hypot(p.x - ownGoal, p.z);
      const goalSide = playerFromGoal < ballFromGoal + 1.5 ? -4.5 : 3.2;
      // Cover shadow: closer to the ball→goal line.
      const toBallX = ballX - ownGoal;
      const toBallZ = ballZ;
      const len = Math.hypot(toBallX, toBallZ) || 1;
      const proj = ((p.x - ownGoal) * toBallX + (p.z - 0) * toBallZ) / (len * len);
      const closestX = ownGoal + toBallX * Math.max(0, Math.min(1, proj));
      const closestZ = toBallZ * Math.max(0, Math.min(1, proj));
      const laneDist = Math.hypot(p.x - closestX, p.z - closestZ);
      score += goalSide + laneDist * 0.55 + defensiveRoleBias(p) - awareness01(p) * 2.2;
      if (opts?.aerial) {
        score -= aerialReachBonus(p) * 5.5 + (p.attrs.heading ?? 50) / 35;
      }
    }
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? players.find((p) => p.side === side)!;
}

export function cyclePlayer(players: Player[], side: Side, current: Player, ballX: number, ballZ: number): Player {
  const pool = players
    .filter((p) => p.side === side && !p.isGK && !p.sentOff)
    .sort((a, b) => a.distTo(ballX, ballZ) - b.distTo(ballX, ballZ));
  const idx = pool.findIndex((p) => p.id === current.id);
  return pool[(idx + 1) % pool.length] ?? current;
}

/**
 * Free-kick / penalty taker: set-piece tech + shooting, with a soft distance cost
 * so the specialist walks over instead of the nearest midfielder dumping a pass.
 */
export function selectSetPieceTaker(
  players: Player[],
  side: Side,
  ballX: number,
  ballZ: number,
): Player {
  const pool = players.filter((p) => p.side === side && !p.isGK && !p.sentOff && !p.celebrating);
  if (!pool.length) return autoSelectPlayer(players, side, ballX, ballZ);
  let best = pool[0]!;
  let bestScore = -Infinity;
  for (const p of pool) {
    const set = p.attrs.setPieces ?? p.attrs.finishing;
    const shoot =
      (p.attrs.longShots + p.attrs.finishing + p.attrs.shotPower + (p.attrs.shooting ?? 60)) / 4;
    const dist = p.distTo(ballX, ballZ);
    const score = set * 1.35 + shoot * 0.55 - dist * 0.48 + (p.slot.includes("ST") || p.slot === "CAM" ? 4 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}
