/**
 * Shared pose curves for jump / slide / dive so visuals stay snappy
 * and physically readable (no long floaty hang).
 */
import { clamp, lerp } from "../../core/math";
import type { Player } from "./Player";

/** Jump height envelope: quick spring → brief peak → fast land. */
export function jumpLift01(progress01: number): number {
  const t = clamp(progress01, 0, 1);
  // Rise 0–0.32, hang 0.32–0.48, land 0.48–1 (land is the longest beat).
  if (t < 0.32) {
    const u = t / 0.32;
    return Math.sin((u * Math.PI) / 2) * 0.95;
  }
  if (t < 0.48) {
    const u = (t - 0.32) / 0.16;
    return lerp(0.95, 1, Math.sin(u * Math.PI));
  }
  const u = (t - 0.48) / 0.52;
  return Math.cos((u * Math.PI) / 2);
}

/** Max vertical lift in metres for a header jump. */
export function jumpLiftMetres(progress01: number, jumping01 = 0.5): number {
  return jumpLift01(progress01) * (0.28 + jumping01 * 0.1);
}

export type DivePosePhase = "launch" | "stretch" | "land";

export function divePhase(progress01: number): DivePosePhase {
  const t = clamp(progress01, 0, 1);
  if (t < 0.22) return "launch";
  if (t < 0.68) return "stretch";
  return "land";
}

/** Body roll amount (radians) during a dive — peaks mid-stretch, settles on land. */
export function diveRoll01(progress01: number): number {
  const t = clamp(progress01, 0, 1);
  if (t < 0.22) return (t / 0.22) * 0.55;
  if (t < 0.68) return lerp(0.55, 1, (t - 0.22) / 0.46);
  return lerp(1, 0.35, (t - 0.68) / 0.32);
}

export type SlidePosePhase = "launch" | "prone" | "recover";

export function slidePhase(sliding: boolean, slideProgress01: number, _recoverProgress01: number): SlidePosePhase {
  if (!sliding) return "recover";
  if (slideProgress01 < 0.28) return "launch";
  return "prone";
}

/** How flat the player is (0 upright → 1 fully prone). */
export function slideFlat01(sliding: boolean, slideProgress01: number, recoverProgress01: number): number {
  if (sliding) {
    if (slideProgress01 < 0.28) return (slideProgress01 / 0.28) * 0.7;
    return lerp(0.7, 1, clamp((slideProgress01 - 0.28) / 0.4, 0, 1));
  }
  // Recover: get up quickly from prone.
  return lerp(1, 0.15, clamp(recoverProgress01, 0, 1));
}

/** Progress 0→1 while a countdown timer runs (duration is the start value). */
export function timerProgress(timer: number, duration: number): number {
  if (duration <= 0.001) return 1;
  return clamp(1 - timer / duration, 0, 1);
}

export const JUMP_DURATION_CUE = 0.26;
export const JUMP_DURATION_HEADER = 0.2;
export const DIVE_DURATION_FULL = 0.58;
export const DIVE_DURATION_CLAIM = 0.36;

/** Start / refresh a jump pose with a capped duration (won't extend floaty hangs). */
export function startJump(player: Player, duration: number): void {
  const d = Math.max(0.12, duration);
  // If already airborne, never re-arm a longer hang — only allow a shorter remnant.
  if (player.jumpTimer > 0.02 && player.jumpDuration > 0) {
    player.jumpTimer = Math.min(player.jumpTimer, d * 0.85);
    return;
  }
  player.jumpDuration = d;
  player.jumpTimer = d;
}

/** Start a GK dive pose toward a lateral sign. */
export function startDive(player: Player, side: number, duration: number): void {
  const d = Math.max(0.18, duration);
  player.diveDirZ = Math.sign(side) || player.diveDirZ || 1;
  if (player.diveTimer > 0.1 && player.diveDuration > 0) {
    player.diveTimer = Math.max(player.diveTimer, Math.min(d, player.diveDuration * 0.9));
    return;
  }
  player.diveDuration = d;
  player.diveTimer = d;
}

export type KickPosePhase = "windup" | "strike" | "follow";

/** Kick progress 0→1 → wind-up / strike / follow-through. */
export function kickPhase(progress01: number): KickPosePhase {
  const t = clamp(progress01, 0, 1);
  if (t < 0.28) return "windup";
  if (t < 0.52) return "strike";
  return "follow";
}

/**
 * Planting-leg plant amount during a kick (0 upright → 1 planted).
 * Peaks through strike, eases on follow-through.
 */
export function kickPlant01(progress01: number): number {
  const t = clamp(progress01, 0, 1);
  if (t < 0.28) return (t / 0.28) * 0.55;
  if (t < 0.52) return lerp(0.55, 1, (t - 0.28) / 0.24);
  return lerp(1, 0.2, (t - 0.52) / 0.48);
}

/** Swinging-leg kick angle magnitude (radians-ish unit for poseLimbs). */
export function kickSwing01(progress01: number): number {
  const t = clamp(progress01, 0, 1);
  if (t < 0.28) return lerp(-0.35, -1.05, t / 0.28); // wind back
  if (t < 0.52) return lerp(-1.05, 1.15, (t - 0.28) / 0.24); // through ball
  return lerp(1.15, 0.25, (t - 0.52) / 0.48); // decelerate
}

/** First-touch cushion intensity 0→1 while the settle timer runs. */
export function firstTouchCushion01(timer: number, duration = 0.35): number {
  if (timer <= 0 || duration <= 0.001) return 0;
  const t = clamp(timer / duration, 0, 1);
  // Strongest on contact, eases as control settles.
  return Math.sin(t * Math.PI) * 0.85 + t * 0.15;
}

/** Extra torso lean toward the ball during header peak (−1…1 side × lean). */
export function headerLean01(progress01: number): number {
  const t = clamp(progress01, 0, 1);
  // Peak lean around contact window (0.28–0.5 of jump).
  if (t < 0.2) return (t / 0.2) * 0.35;
  if (t < 0.5) return lerp(0.35, 1, (t - 0.2) / 0.3);
  if (t < 0.72) return lerp(1, 0.4, (t - 0.5) / 0.22);
  return lerp(0.4, 0.05, (t - 0.72) / 0.28);
}
