/**
 * Shared body / first-touch / pass-weight helpers (PES-style feel in CORE play).
 * Facing, settle commitment, and hold weight — not mode forks.
 */
import { clamp, stat01 } from "../../core/math";
import type { PassType } from "./PassModel";

/** 0 = back to target, 1 = hips square to kick direction. */
export function bodyAlignment(facing: number, dirX: number, dirZ: number): number {
  const len = Math.hypot(dirX, dirZ) || 1;
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const dot = fx * (dirX / len) + fz * (dirZ / len);
  return clamp((dot + 1) / 2, 0, 1);
}

/** How well the player faces the incoming ball (1 = chest-on). */
export function receiveApproachAlignment(facing: number, ballVx: number, ballVz: number): number {
  const speed = Math.hypot(ballVx, ballVz);
  if (speed < 1.2) return 0.85;
  // Face into the ball's approach (opposite of velocity).
  return bodyAlignment(facing, -ballVx, -ballVz);
}

/**
 * True when the player can plant a clean pass/shot.
 * Early settle windows force carry / wait instead of instant second touch.
 */
export function kickCommitReady(firstTouchTimer: number, kickTimer: number, minSettle = 0.08): boolean {
  if (kickTimer > 0) return false;
  return firstTouchTimer <= minSettle;
}

/**
 * 0 = fully blocked, 1 = free. Softens power/aim while still settling.
 * ARCADE shortens via timer length; this curve is shared.
 */
export function firstTouchKickScale(firstTouchTimer: number): number {
  if (firstTouchTimer <= 0.05) return 1;
  if (firstTouchTimer >= 0.35) return 0.28;
  return clamp(1 - (firstTouchTimer - 0.05) / 0.35, 0.28, 1);
}

/** Human/AI hold target for pass weight (distance + type + pressure composure). */
export function idealPassHold01(
  passType: PassType,
  distance: number,
  opts?: { pressure?: number; composure?: number; tempo?: number },
): number {
  const pressure = opts?.pressure ?? 0;
  const composure = stat01(opts?.composure ?? 70);
  const tempo = opts?.tempo ?? 1;
  let base: number;
  if (passType === "through" || passType === "chip") base = clamp(0.35 + distance / 80, 0.4, 0.8);
  else if (passType === "long" || passType === "cross") base = clamp(0.55 + distance / 90, 0.6, 1);
  else base = clamp(distance / 36, 0.18, 0.72);
  // Under pressure: rush the kick (lighter weight) unless composed.
  const rush = pressure * (0.22 - composure * 0.12);
  // Higher tempo styles release earlier.
  const tempoNudge = (tempo - 1) * 0.08;
  return clamp(base - rush - tempoNudge, 0.12, 1);
}

/**
 * Below this alignment, a pass/shot is a forced mishit (or refuse for AI).
 * Human can still force it — error explodes instead.
 */
export function facingKickFloor(passOrShot: "pass" | "shot"): number {
  return passOrShot === "shot" ? 0.28 : 0.22;
}
