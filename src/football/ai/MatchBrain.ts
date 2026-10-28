/**
 * MatchBrain — position AI model inspired by Gameplay Football /
 * google-research/football role codes (GK, CB, FB, DM, CM, WM, AM, W, CF).
 *
 * Every outfielder gets a live ball-relative target by role + phase
 * (defend / loose / build / attack), so shape and decisions stay position-aware.
 */
import { clamp, stat01 } from "../../core/math";
import type { Ball } from "../ball/Ball";
import { HALF_LENGTH, HALF_WIDTH, PITCH_LENGTH } from "../constants";
import { pitchClamp } from "../pitch/PitchZones";
import type { Player } from "../players/Player";
import { closeDownRange, isAttackingDefender } from "./DefensiveAI";

/** GRF-aligned football roles used for match AI. */
export type FootballRole = "GK" | "CB" | "FB" | "DM" | "CM" | "WM" | "AM" | "W" | "CF";

/**
 * Team phase controller (League-Soccer / Tiki-Tech inspired).
 * - defend: opposition has the ball
 * - loose: no owner
 * - transition: just won/lost the ball (counter window)
 * - build: own ball, deeper third
 * - attack: own ball, advanced
 * - chance: clear shooting opportunity / box entry
 */
export type MatchPhase = "defend" | "loose" | "transition" | "build" | "attack" | "chance";

export interface RoleProfile {
  role: FootballRole;
  /** How hard this role pulls toward the ball when defending (0–1). */
  defendBallPull: number;
  /** How far this role pushes ahead of anchor when attacking (metres along attack). */
  attackPush: number;
  /** Preferred lateral channel width from centre (0 = stay central). */
  channelZ: number;
  /** Prefer short recirculation when on the ball. */
  buildupBias: number;
  /** Prefer progressive / through options when on the ball. */
  progressiveBias: number;
  /** Willingness to press high when defending. */
  pressWeight: number;
  /** Stay compact with the back line. */
  lineDiscipline: number;
}

const PROFILES: Record<FootballRole, Omit<RoleProfile, "role">> = {
  GK: {
    defendBallPull: 0.05,
    attackPush: 0,
    channelZ: 0,
    buildupBias: 0.85,
    progressiveBias: 0.1,
    pressWeight: 0,
    lineDiscipline: 1,
  },
  CB: {
    defendBallPull: 0.22,
    attackPush: 2.5,
    channelZ: 6,
    buildupBias: 0.78,
    progressiveBias: 0.22,
    pressWeight: 0.35,
    lineDiscipline: 0.92,
  },
  FB: {
    defendBallPull: 0.3,
    attackPush: 8,
    channelZ: 16,
    buildupBias: 0.55,
    progressiveBias: 0.45,
    pressWeight: 0.55,
    lineDiscipline: 0.7,
  },
  DM: {
    defendBallPull: 0.4,
    attackPush: 5,
    channelZ: 5,
    buildupBias: 0.72,
    progressiveBias: 0.35,
    pressWeight: 0.65,
    lineDiscipline: 0.75,
  },
  CM: {
    defendBallPull: 0.38,
    attackPush: 8,
    channelZ: 7,
    buildupBias: 0.62,
    progressiveBias: 0.55,
    pressWeight: 0.55,
    lineDiscipline: 0.45,
  },
  WM: {
    defendBallPull: 0.32,
    attackPush: 9,
    channelZ: 15,
    buildupBias: 0.48,
    progressiveBias: 0.58,
    pressWeight: 0.5,
    lineDiscipline: 0.35,
  },
  AM: {
    defendBallPull: 0.28,
    attackPush: 11,
    channelZ: 6,
    buildupBias: 0.4,
    progressiveBias: 0.72,
    pressWeight: 0.42,
    lineDiscipline: 0.25,
  },
  W: {
    defendBallPull: 0.25,
    attackPush: 12,
    channelZ: 16,
    buildupBias: 0.35,
    progressiveBias: 0.7,
    pressWeight: 0.4,
    lineDiscipline: 0.2,
  },
  CF: {
    defendBallPull: 0.2,
    attackPush: 13,
    channelZ: 5,
    buildupBias: 0.28,
    progressiveBias: 0.78,
    pressWeight: 0.35,
    lineDiscipline: 0.15,
  },
};

/** Map kit slot → GRF-style football role. */
export function classifyFootballRole(player: Player): FootballRole {
  if (player.isGK || player.slot === "GK" || player.position === "GK") return "GK";
  const s = player.slot;
  if (s.includes("CB") || s === "CB") return "CB";
  if (s === "LB" || s === "RB" || s === "LWB" || s === "RWB") return "FB";
  if (s.includes("DM")) return "DM";
  if (s === "CAM" || s.includes("AM") || s === "LAM" || s === "RAM") return "AM";
  if (s === "LW" || s === "RW") return "W";
  if (s === "LM" || s === "RM") return "WM";
  if (s.includes("ST") || player.position === "ST") return "CF";
  if (s.includes("CM")) return "CM";
  return "CM";
}

export function roleProfile(player: Player): RoleProfile {
  const role = classifyFootballRole(player);
  return { role, ...PROFILES[role] };
}

export function matchPhase(
  player: Player,
  ball: Ball,
  possessingSide: "home" | "away" | null,
  opts?: {
    /** Seconds since last possession change for this side. */
    transitionAge?: number;
    /** Carrier distance to opposition goal (m). */
    distGoal?: number;
    /** Clear-chance quality 0–1 from AttackingDecision. */
    chanceQuality?: number;
  },
): MatchPhase {
  if (possessingSide == null) return "loose";
  if (possessingSide !== player.side) {
    // Brief counter-press window after turnover still reads as defend for shape,
    // but callers can detect transition via transitionAge on the winning side.
    return "defend";
  }
  const transitionAge = opts?.transitionAge ?? 99;
  if (transitionAge < 3.2) return "transition";
  const progress = clamp((ball.x * player.attackSign + HALF_LENGTH) / PITCH_LENGTH, 0, 1);
  const distGoal = opts?.distGoal ?? 40;
  const chanceQ = opts?.chanceQuality ?? 0;
  if (chanceQ >= 0.55 || (progress > 0.78 && distGoal < 18 && Math.abs(ball.z) < 14)) return "chance";
  return progress < 0.55 ? "build" : "attack";
}

/** Team-level phase for the side that currently owns (or contests) the ball. */
export function teamMatchPhase(
  side: "home" | "away",
  ball: Ball,
  possessingSide: "home" | "away" | null,
  attackSign: number,
  opts?: { transitionAge?: number; distGoal?: number; chanceQuality?: number },
): MatchPhase {
  if (possessingSide == null) return "loose";
  if (possessingSide !== side) return "defend";
  const transitionAge = opts?.transitionAge ?? 99;
  if (transitionAge < 3.2) return "transition";
  const progress = clamp((ball.x * attackSign + HALF_LENGTH) / PITCH_LENGTH, 0, 1);
  const distGoal = opts?.distGoal ?? 40;
  const chanceQ = opts?.chanceQuality ?? 0;
  if (chanceQ >= 0.55 || (progress > 0.78 && distGoal < 18 && Math.abs(ball.z) < 14)) return "chance";
  return progress < 0.55 ? "build" : "attack";
}

/**
 * Position-aware shape target (Gameplay Football block + role channels).
 * Replaces a flat ball pull with per-role depth / width.
 */
export function roleShapeTarget(
  player: Player,
  ball: Ball,
  possessingSide: "home" | "away" | null,
): { x: number; z: number; role: FootballRole; phase: MatchPhase } {
  const profile = roleProfile(player);
  const phase = matchPhase(player, ball, possessingSide);
  const attack = player.attackSign;
  const sideSign = Math.sign(player.anchorZ || 0.01);
  const awareness = stat01(player.attrs.defensiveAwareness ?? player.attrs.defending);
  const attAw = stat01(player.attrs.attackingAwareness ?? player.attrs.vision);

  let x = player.anchorX;
  let z = player.anchorZ;

  if (phase === "loose") {
    // Non-pursuers hold shape — soft ball pull only (primary pursuer is assigned separately).
    const pull = clamp(profile.defendBallPull * 0.35, 0.06, 0.15);
    x = player.anchorX * (1 - pull) + ball.x * pull;
    z = player.anchorZ * (0.72 + profile.lineDiscipline * 0.15) + ball.z * (0.28 - profile.lineDiscipline * 0.1);
    // CBs / DM keep a screen between ball and goal; do not crash the pocket.
    if (profile.role === "CB" || profile.role === "DM") {
      const goal = player.ownGoalX();
      x = x * 0.65 + (goal + attack * 14) * 0.25 + ball.x * 0.1;
    }
  } else if (phase === "defend") {
    const pull = profile.defendBallPull * (0.75 + awareness * 0.45);
    x = player.anchorX + (ball.x - player.anchorX) * pull - attack * (2.5 * profile.lineDiscipline);
    z = player.anchorZ + (ball.z - player.anchorZ) * (0.1 + pull * 0.35);
    if (profile.role === "FB") {
      // Full-back tucks when ball is opposite side; pushes when ball is near.
      const sameSide = Math.sign(ball.z || 0.01) === sideSign;
      z = sameSide
        ? clamp(ball.z * 0.35 + player.anchorZ * 0.65, sideSign * 8, sideSign * (HALF_WIDTH - 3))
        : player.anchorZ * 0.85;
    }
    if (profile.role === "CB") {
      z = clamp(z, -12, 12);
    }
  } else if (phase === "transition") {
    // Counter: attackers push channels; midfield advances; back line holds a higher line.
    const push = profile.attackPush * (0.7 + attAw * 0.4);
    x = player.anchorX + attack * push * 0.85 + (ball.x - player.anchorX) * 0.22;
    z = player.anchorZ * 0.4 + ball.z * 0.35 + sideSign * profile.channelZ * 0.35;
    if (profile.role === "CB" || profile.role === "DM") {
      x = player.anchorX + attack * (profile.role === "DM" ? 6 : 3.5) + (ball.x - player.anchorX) * 0.12;
    }
  } else if (phase === "chance") {
    // Box / clear chance: CF crash, AM edge, wide stay available, defenders hold shape.
    if (profile.role === "CF" || profile.role === "AM") {
      x = ball.x + attack * (profile.role === "CF" ? 4.5 : 2.5);
      z = clamp(ball.z * 0.55 + player.anchorZ * 0.25, -11, 11);
    } else if (profile.role === "W" || profile.role === "WM") {
      x = ball.x + attack * 2;
      z = sideSign * clamp(Math.max(Math.abs(ball.z), 10), 10, HALF_WIDTH - 3);
    } else {
      x = player.anchorX + attack * 4 + (ball.x - player.anchorX) * 0.15;
      z = player.anchorZ * 0.7 + ball.z * 0.2;
    }
  } else {
    // build / attack — push by role, hold channel width
    const push = profile.attackPush * (phase === "attack" ? 0.85 + attAw * 0.35 : 0.45 + attAw * 0.25);
    x = player.anchorX + attack * push + (ball.x - player.anchorX) * (0.12 + attAw * 0.1);
    if (profile.channelZ > 0.5) {
      const channel = sideSign * profile.channelZ;
      z = channel * 0.55 + player.anchorZ * 0.25 + ball.z * 0.2;
      // Wingers / FB stay high and wide; CF / AM stay more central.
      if (profile.role === "W" || profile.role === "WM" || profile.role === "FB") {
        z = sideSign * clamp(Math.abs(z), profile.channelZ * 0.7, HALF_WIDTH - 3.2);
      } else if (profile.role === "CF" || profile.role === "AM") {
        z = clamp(ball.z * 0.35 + player.anchorZ * 0.4, -10, 10);
      }
    } else {
      z = player.anchorZ * 0.6 + ball.z * 0.25;
    }
    // Build phase: CBs / DM stay deeper as recycle options.
    if (phase === "build" && (profile.role === "CB" || profile.role === "DM")) {
      x = player.anchorX + attack * (profile.role === "DM" ? 3.5 : 1.2) + (ball.x - player.anchorX) * 0.08;
    }
  }

  // Keep wide roles on their side of the pitch.
  if (profile.channelZ >= 12 && Math.abs(player.anchorZ) > 6) {
    z = clamp(z, sideSign * 5, sideSign * (HALF_WIDTH - 2.8));
  }
  // CF depth is owned by SupportAI — don't push shape past a soft lead of the ball.
  if (profile.role === "CF" && (phase === "build" || phase === "attack" || phase === "transition" || phase === "chance")) {
    const softLead = ball.x + attack * (phase === "chance" ? 3.2 : 1.8);
    if ((x - softLead) * attack > 0) x = softLead;
  }
  x = clamp(x, -HALF_LENGTH + 3.5, HALF_LENGTH - 3.5);
  const clamped = pitchClamp(x, z, 2.4);
  return { ...clamped, role: profile.role, phase };
}

/** @deprecated Prefer roleShapeTarget — kept for existing call sites. */
export function ballRelativeShape(
  player: Player,
  ball: Ball,
  possessingSide: "home" | "away" | null,
): { x: number; z: number } {
  const t = roleShapeTarget(player, ball, possessingSide);
  return { x: t.x, z: t.z };
}

/** On-ball decision bias by role (used by AttackingDecision). */
export function roleOnBallBias(player: Player): {
  pass: number;
  run: number;
  through: number;
  cross: number;
  hold: number;
  shot: number;
  buildup: number;
} {
  const p = roleProfile(player);
  switch (p.role) {
    case "CB":
      return { pass: 0.28, run: -0.15, through: -0.08, cross: -0.2, hold: 0.08, shot: -0.25, buildup: p.buildupBias };
    case "FB":
      return { pass: 0.18, run: 0.1, through: 0.05, cross: 0.22, hold: -0.05, shot: -0.15, buildup: p.buildupBias };
    case "DM":
      return { pass: 0.32, run: -0.08, through: 0.12, cross: -0.12, hold: 0.06, shot: -0.18, buildup: p.buildupBias };
    case "CM":
      return { pass: 0.26, run: 0.05, through: 0.18, cross: -0.05, hold: 0.02, shot: -0.05, buildup: p.buildupBias };
    case "WM":
      return { pass: 0.16, run: 0.12, through: 0.1, cross: 0.18, hold: -0.08, shot: -0.05, buildup: p.buildupBias };
    case "AM":
      return { pass: 0.14, run: 0.1, through: 0.28, cross: 0.05, hold: -0.1, shot: 0.12, buildup: p.buildupBias };
    case "W":
      return { pass: 0.12, run: 0.08, through: 0.12, cross: 0.3, hold: -0.12, shot: 0.08, buildup: p.buildupBias };
    case "CF":
      return { pass: 0.05, run: 0.22, through: 0.08, cross: -0.1, hold: -0.15, shot: 0.28, buildup: p.buildupBias };
    default:
      return { pass: 0.1, run: 0, through: 0, cross: 0, hold: 0, shot: 0, buildup: 0.5 };
  }
}

/**
 * True when this player should refuse to plant still and chase the loose ball.
 * Only the designated primary pursuer may full-chase — everyone else holds shape.
 */
export function mustChaseLoose(
  player: Player,
  ball: Ball,
  possessingSide: "home" | "away" | null,
  primaryPursuerId?: string | null,
): boolean {
  if (possessingSide != null) return false;
  if (player.isGK || player.celebrating || player.sentOff) return false;
  if (primaryPursuerId != null && player.id !== primaryPursuerId) return false;
  // When no primary is provided (legacy/tests), only the absolute nearest in-range player chases.
  const d = player.distTo(ball.x, ball.z);
  const profile = roleProfile(player);
  const engage = Math.max(12 + profile.pressWeight * 8, closeDownRange(player) * (isAttackingDefender(player) ? 0.7 : 1));
  return d < engage;
}

/** Ranked pursuers for a side — prefer natural defenders, always include nearest. */
export function designatePursuers(sidePlayers: Player[], ball: Ball, max = 2): Player[] {
  const pool = sidePlayers
    .filter((p) => !p.isGK && !p.celebrating && !p.sentOff)
    .map((p) => {
      const role = classifyFootballRole(p);
      const d = p.distTo(ball.x, ball.z);
      const roleBias = role === "CB" || role === "DM" || role === "FB" ? -2.5 : role === "CF" || role === "W" ? 1.8 : 0;
      return { p, d, score: d + roleBias };
    })
    .sort((a, b) => a.score - b.score);
  if (!pool.length) return [];
  const nearest = [...pool].sort((a, b) => a.d - b.d)[0]!;
  const picked: Player[] = [];
  const seen = new Set<string>();
  // Always take absolute nearest first.
  picked.push(nearest.p);
  seen.add(nearest.p.id);
  for (const row of pool) {
    if (picked.length >= max) break;
    if (seen.has(row.p.id)) continue;
    if (row.d < 30) {
      picked.push(row.p);
      seen.add(row.p.id);
    }
  }
  return picked;
}
