import { clamp, dist2, stat01 } from "../../core/math";
import type { Player } from "../players/Player";
import type { Ball } from "../ball/Ball";

/** True attacking roles — typically poor at organised defending. */
export function isAttackingDefender(player: Player): boolean {
  const s = player.slot;
  return (
    player.position === "ST" ||
    s.includes("ST") ||
    s === "LW" ||
    s === "RW" ||
    s === "LAM" ||
    s === "RAM" ||
    s === "CAM"
  );
}

/**
 * Effective defensive awareness for closing / cover.
 * Attackers read much lower even if the raw attribute is mid-pack.
 */
export function awareness01(player: Player): number {
  const raw = stat01(player.attrs.defensiveAwareness ?? player.attrs.defending);
  if (isAttackingDefender(player)) return raw * 0.38;
  if (player.slot.includes("CM") && !player.slot.includes("DM")) return raw * 0.72;
  return raw;
}

export function aggression01(player: Player): number {
  return stat01(player.attrs.aggression ?? player.attrs.defending);
}

export function reactions01(player: Player): number {
  return stat01(player.attrs.reactions ?? player.attrs.composure);
}

export function closeDownRange(player: Player): number {
  return 7.5 + awareness01(player) * 14 + aggression01(player) * 3;
}

export function selectPressingPlayer(
  defenders: Player[],
  ball: Ball,
  _attackerId: string | null,
): Player | null {
  return selectClosingPlayers(defenders, ball, 1)[0] ?? null;
}

export function selectClosingPlayers(defenders: Player[], ball: Ball, max = 2): Player[] {
  const pool = defenders
    .filter((p) => !p.isGK && !p.celebrating)
    .map((p) => {
      const aw = awareness01(p);
      const ag = aggression01(p);
      const d = p.distTo(ball.x, ball.z);
      // Attackers engage shorter — but always contest within 12m so the nearest
      // player never stands still while the ball is loose nearby.
      const engage = Math.max(12, closeDownRange(p) * (isAttackingDefender(p) ? 0.55 : 1));
      const roleBias =
        p.slot.includes("CB") || p.slot.includes("DM") || p.slot === "LB" || p.slot === "RB"
          ? 2.4
          : isAttackingDefender(p)
            ? -6.5
            : 0;
      const score = d * (1.12 - aw * 0.32) - aw * 6 - ag * 4.5 - roleBias;
      return { p, d, engage, score };
    });
  const ranked = pool.filter((row) => row.d < row.engage).sort((a, b) => a.score - b.score);
  let picked = ranked.slice(0, max).map((row) => row.p);
  const nearest = [...pool].sort((a, b) => a.d - b.d)[0];
  if (!picked.length && nearest && nearest.d < 36) return [nearest.p];
  // If someone is clearly nearer the ball than the role pick, they must lead the chase.
  if (nearest && nearest.d < 28 && !picked.some((p) => p.id === nearest.p.id)) {
    const leadDist = picked[0]?.distTo(ball.x, ball.z) ?? 99;
    if (nearest.d + 1.6 < leadDist) {
      picked = [nearest.p, ...picked].slice(0, max);
    } else if (picked.length < max) {
      picked.push(nearest.p);
    }
  }
  return picked;
}

export function jockeyTarget(
  defender: Player,
  ballX: number,
  ballZ: number,
  goalX: number,
): { x: number; z: number } {
  const toBallX = ballX - goalX;
  const toBallZ = ballZ - 0;
  const len = Math.hypot(toBallX, toBallZ) || 1;
  const aw = awareness01(defender);
  const ag = aggression01(defender);
  // Awareness tightens disciplined positioning; aggression closes further for a press.
  const standOff = 0.9 + (1 - aw) * 0.4 - ag * 0.65;
  return {
    x: ballX - (toBallX / len) * Math.max(0.25, standOff),
    z: ballZ - (toBallZ / len) * Math.max(0.25, standOff),
  };
}

export function closeDownTarget(
  defender: Player,
  ballX: number,
  ballZ: number,
  goalX: number,
): { x: number; z: number } {
  const jockey = jockeyTarget(defender, ballX, ballZ, goalX);
  const aw = awareness01(defender);
  const react = 0.32 + aw * 0.4 + reactions01(defender) * 0.28;
  return {
    x: defender.x + (jockey.x - defender.x) * react,
    z: defender.z + (jockey.z - defender.z) * react,
  };
}

export interface CoverOpts {
  /** Teammates used for CB line / mark ownership. */
  teammates?: Player[];
  /** Players already closing the ball — don't also mark their man. */
  closerIds?: Set<string>;
  /** Runners already marked this tick (mutated when we claim a mark). */
  markedIds?: Set<string>;
  /** Shared defensive line X for centre-backs. */
  lineX?: number | null;
}

export function coverTarget(
  player: Player,
  ballX: number,
  ballZ: number,
  runners: Player[] = [],
  opts?: CoverOpts,
): { x: number; z: number } {
  const aw = awareness01(player);
  const d = Math.hypot(ballX - player.x, ballZ - player.z);
  const engage = closeDownRange(player);
  const compact = d < engage ? 0.28 + aw * 0.42 : 0.12 + aw * 0.14;
  let x = player.anchorX + (ballX - player.anchorX) * compact;
  let z = player.anchorZ + (ballZ - player.anchorZ) * (0.12 + aw * 0.14);
  const ownGoal = player.ownGoalX();
  const isCb = player.slot.includes("CB");
  const isScreen = player.slot.includes("DM") || (player.slot.includes("CM") && !player.slot.includes("CAM"));

  // CB pair: share a compact line depth so one doesn't ball-watch alone.
  if (isCb && opts?.lineX != null && Number.isFinite(opts.lineX)) {
    const linePull = 0.55 + aw * 0.3;
    x = x * (1 - linePull) + opts.lineX * linePull;
    const mates = (opts.teammates ?? []).filter((t) => t.id !== player.id && t.slot.includes("CB"));
    if (mates.length) {
      const partner = mates.reduce((a, b) =>
        Math.abs(a.z - player.z) < Math.abs(b.z - player.z) ? a : b,
      );
      const gapZ = player.z - partner.z;
      if (Math.abs(gapZ) < 5.5) {
        z += Math.sign(gapZ || player.anchorZ || 1) * (5.5 - Math.abs(gapZ)) * 0.35;
      } else if (Math.abs(gapZ) > 14) {
        z += (partner.z - player.z) * 0.12;
      }
    }
  }

  // DM/CM screen: sit between ball and own goal rather than pure ball-anchor blend.
  if (isScreen && !isCb) {
    const toBallX = ballX - ownGoal;
    const toBallZ = ballZ;
    const len = Math.hypot(toBallX, toBallZ) || 1;
    const depth = 10 + aw * 6;
    const screenX = ownGoal + (toBallX / len) * depth;
    const screenZ = (toBallZ / len) * depth * 0.55 + player.anchorZ * 0.35;
    const blend = 0.4 + aw * 0.35;
    x = x * (1 - blend) + screenX * blend;
    z = z * (1 - blend) + screenZ * blend;
  }

  // Shadow a dangerous ahead-of-ball runner instead of pure ball-watching.
  if (!isAttackingDefender(player) && runners.length) {
    const dir = player.attackSign;
    let best: Player | null = null;
    let bestThreat = -1;
    for (const r of runners) {
      if (r.isGK || r.side === player.side) continue;
      if (opts?.markedIds?.has(r.id)) continue;
      // Don't also mark a runner a closer is already hunting.
      if (
        opts?.closerIds &&
        opts.teammates?.some((t) => opts.closerIds!.has(t.id) && t.distTo(r.x, r.z) < 3.8)
      ) {
        continue;
      }
      const ahead = (r.x - ballX) * dir;
      if (ahead < 1.5) continue;
      const towardGoal = r.vx * dir;
      const gap = player.distTo(r.x, r.z);
      if (gap > 18) continue;
      const threat = ahead * 0.35 + Math.max(0, towardGoal) * 0.8 + (14 - gap) * 0.15;
      if (threat > bestThreat) {
        bestThreat = threat;
        best = r;
      }
    }
    if (best && bestThreat > 2.2) {
      const mark = 0.35 + aw * 0.4;
      x = x * (1 - mark) + (best.x - dir * 1.4) * mark;
      z = z * (1 - mark) + best.z * mark;
      opts?.markedIds?.add(best.id);
    }
  }
  return { x, z };
}

/**
 * Average CB cover depth for a compact back line.
 * Optional `blockDepth` (metres from own goal along attack) pulls the line
 * toward a high/mid/low block (Tiki-Tech).
 */
export function centreBackLineX(
  cbs: Player[],
  ballX: number,
  opts?: { blockDepth?: number | null },
): number | null {
  if (!cbs.length) return null;
  let sum = 0;
  for (const cb of cbs) {
    const aw = awareness01(cb);
    const compact = 0.16 + aw * 0.22;
    let x = cb.anchorX + (ballX - cb.anchorX) * compact;
    if (opts?.blockDepth != null && Number.isFinite(opts.blockDepth)) {
      const goal = cb.ownGoalX();
      const attack = cb.attackSign;
      const blockX = goal + attack * opts.blockDepth;
      x = x * 0.55 + blockX * 0.45;
    }
    sum += x;
  }
  return sum / cbs.length;
}

export function nearestPressTargets(defenders: Player[], ball: Ball, max = 2): Player[] {
  return defenders
    .filter((p) => !p.isGK && !p.celebrating)
    .map((p) => ({ p, d: p.distTo(ball.x, ball.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((row) => row.p);
}

export function pressTarget(
  defender: Player,
  ballX: number,
  ballZ: number,
  goalX: number,
): { x: number; z: number } {
  const toBallX = ballX - goalX;
  const toBallZ = ballZ;
  const len = Math.hypot(toBallX, toBallZ) || 1;
  const aw = awareness01(defender);
  const ag = aggression01(defender);
  const standOff = 0.22 + (1 - aw) * 0.28 - ag * 0.08;
  return {
    x: ballX - (toBallX / len) * Math.max(0.12, standOff),
    z: ballZ - (toBallZ / len) * Math.max(0.12, standOff) * 0.35,
  };
}

/** Defensive block height relative to own goal (Tiki-Tech). */
export type DefensiveBlock = "high" | "mid" | "low";

export function defensiveBlockFor(
  ballX: number,
  ownGoalX: number,
  attackSign: number,
  scoreDiff = 0,
  minute01 = 0.5,
): DefensiveBlock {
  const progress = clamp01(((ballX - ownGoalX) * attackSign) / 80);
  // Protect a lead late → drop; chasing → push higher.
  if (scoreDiff > 0 && minute01 > 0.7) return "low";
  if (scoreDiff < 0 && minute01 > 0.65) return "high";
  if (progress > 0.62) return "high";
  if (progress < 0.32) return "low";
  return "mid";
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/** Depth offset from own goal for the back line by block. */
export function blockLineDepth(block: DefensiveBlock): number {
  if (block === "high") return 28;
  if (block === "low") return 12;
  return 18;
}

/**
 * Contain: hold the goal-side arc without diving in (open-soccer jockey cousin).
 * Slightly wider stand-off than jockeyTarget.
 */
export function containTarget(
  defender: Player,
  ballX: number,
  ballZ: number,
  goalX: number,
): { x: number; z: number } {
  const jockey = jockeyTarget(defender, ballX, ballZ, goalX);
  const aw = awareness01(defender);
  const standOffExtra = 0.55 + aw * 0.45;
  const toBallX = ballX - goalX;
  const toBallZ = ballZ;
  const len = Math.hypot(toBallX, toBallZ) || 1;
  return {
    x: jockey.x - (toBallX / len) * standOffExtra * 0.35,
    z: jockey.z - (toBallZ / len) * standOffExtra * 0.2,
  };
}

/**
 * Cover shadow: CB holds the line behind a pressing full-back / midfielder.
 */
export function coverShadowTarget(
  cb: Player,
  presser: Player,
  ballX: number,
  ballZ: number,
): { x: number; z: number } {
  const aw = awareness01(cb);
  const dir = cb.attackSign;
  const behind = 3.2 + aw * 2.2;
  return {
    x: presser.x - dir * behind + (ballX - presser.x) * 0.15,
    z: presser.z * 0.55 + ballZ * 0.25 + cb.anchorZ * 0.2,
  };
}

/** True while a team should counter-press after winning/losing the ball. */
export function inCounterPressWindow(ageSec: number, windowSec = 3.4): boolean {
  return ageSec >= 0 && ageSec < windowSec;
}

/**
 * Sideline / weak-foot press trap: shepherd the carrier toward the touchline.
 */
export function pressTrapTarget(
  defender: Player,
  ballX: number,
  ballZ: number,
  goalX: number,
): { x: number; z: number } {
  const base = pressTarget(defender, ballX, ballZ, goalX);
  const touch = Math.sign(ballZ || defender.anchorZ || 1);
  return {
    x: base.x,
    z: base.z + touch * 1.15,
  };
}

void dist2;
