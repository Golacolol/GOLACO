import { boundedNoise, clamp, stat01 } from "../../core/math";
import type { PlayerAttributes } from "../../data/schema";

export interface ShotContext {
  distance: number;
  pressure: number;
  bodyAlignment: number;
  energy: number;
  attrs: PlayerAttributes;
  hold01: number;
  isHeader?: boolean;
  shotKind?: "close" | "normal" | "long" | "power";
  overcharged?: boolean;
}

export interface ShotResult {
  dx: number;
  dy: number;
  power: number;
}

export function computeShot(ctx: ShotContext): ShotResult {
  const longBlend = clamp((ctx.distance - 12) / 22, 0, 1);
  let accuracyStat: number;
  if (ctx.isHeader) {
    // Heading technique drives aerial shot accuracy — jumping is reach, not aim.
    accuracyStat =
      (ctx.attrs.heading ?? ctx.attrs.finishing) * 0.55 +
      ctx.attrs.shooting * 0.15 +
      ctx.attrs.composure * 0.2 +
      (ctx.attrs.attackingAwareness ?? ctx.attrs.vision) * 0.1;
  } else {
    accuracyStat =
      ctx.attrs.finishing * (1 - longBlend) * 0.55 +
      ctx.attrs.shooting * 0.25 +
      ctx.attrs.longShots * longBlend * 0.35 +
      ctx.attrs.composure * 0.12 +
      (ctx.attrs.attackingAwareness ?? 60) * 0.03;
  }
  const accuracy = stat01(accuracyStat / 1.3);
  const powerStat = stat01(ctx.isHeader ? (ctx.attrs.heading ?? ctx.attrs.shotPower) * 0.45 + ctx.attrs.shotPower * 0.55 : ctx.attrs.shotPower);
  const overpower = clamp(ctx.hold01 - 0.72, 0, 1) + (ctx.overcharged ? 1.15 : 0);
  const composurePressure = 0.55 + (1 - stat01(ctx.attrs.composure)) * 0.55;
  const error =
    (0.55 - accuracy * 0.42) *
    (1 + ctx.pressure * composurePressure) *
    (1 + (1 - clamp(ctx.bodyAlignment, 0, 1)) * 0.55) *
    (1 + (1 - ctx.energy) * 0.35) *
    (1 + overpower * 0.7) *
    (1 + ctx.distance / 42);

  const spread = ctx.overcharged ? 4.6 : 2.4;
  const dx = clamp(boundedNoise(error * 1.6), -spread, spread);
  const dy = clamp(boundedNoise(error * 1.15), -spread * 0.6, spread * 0.6);
  // Long / power shots carry more punch and more lateral miss — goals and wides both rise.
  const kindMul = ctx.shotKind === "long" || ctx.shotKind === "power" ? 1.34 : ctx.shotKind === "close" ? 1.16 : 1.12;
  const power = clamp(19 + powerStat * 15 + ctx.hold01 * 16 - overpower * 1.2, 16, ctx.overcharged ? 52 : 48) * kindMul;
  if (ctx.shotKind === "long" || ctx.shotKind === "power") {
    return {
      dx: clamp(dx * 1.22, -spread * 1.15, spread * 1.15),
      dy: clamp(dy * 1.1, -spread * 0.75, spread * 0.75),
      power,
    };
  }
  return { dx, dy, power };
}

export function aimOnGoal(intentX: number, intentY: number, invertY = false): { x: number; y: number } {
  const y = invertY ? -intentY : intentY;
  return {
    x: clamp(intentX * 3.15, -3.2, 3.2),
    y: clamp(1.15 + y * 1.05, 0.28, 2.28),
  };
}

/**
 * Pick a near/far post aim from shooter vs keeper, plus vertical lift for power/long shots.
 * intentX/Y are in [-1,1] space used by aimOnGoal.
 */
export function aiShotAimIntent(opts: {
  shooterZ: number;
  shooterX: number;
  goalX: number;
  gkZ?: number;
  longShot?: boolean;
  powerBias?: number;
}): { aimX: number; aimY: number; bodyAlignment: number } {
  const gkZ = opts.gkZ ?? 0;
  // Prefer the post away from the keeper.
  const farPost = opts.shooterZ >= gkZ ? 1 : -1;
  const nearPost = -farPost;
  const postPick = Math.abs(opts.shooterZ - gkZ) < 1.2 ? (Math.random() < 0.5 ? farPost : nearPost) : farPost;
  const aimX = clamp(postPick * (0.55 + Math.random() * 0.42), -1, 1);
  const dist = Math.abs(opts.goalX - opts.shooterX);
  const power = opts.powerBias ?? (opts.longShot ? 0.85 : 0.45);
  // Long / powerful efforts climb; close finishes stay lower.
  const aimY = opts.longShot
    ? clamp(0.35 + power * 0.55 + Math.random() * 0.25, 0.2, 1)
    : clamp(0.08 + (dist > 16 ? 0.35 : 0.12) + Math.random() * 0.2, -0.15, 0.85);
  const toGoalZ = clamp(aimX * 3.15, -3.2, 3.2) - opts.shooterZ;
  const toGoalX = opts.goalX - opts.shooterX;
  const align = Math.abs(Math.atan2(toGoalX, toGoalZ));
  // Facing roughly goalward → high alignment.
  const bodyAlignment = clamp(1.05 - align / Math.PI, 0.35, 1);
  return { aimX, aimY, bodyAlignment };
}
