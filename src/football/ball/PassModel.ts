import { boundedNoise, clamp, stat01 } from "../../core/math";
import { BALL_GRAVITY } from "../constants";
import { passStatForDistance } from "../players/PlayerStats";
import type { PlayerAttributes } from "../../data/schema";

export type PassType = "short" | "through" | "long" | "cross" | "chip";

/** Hold-to-power curve for human pass/shot (open-soccer style). */
export function holdPowerCurve(holdSec: number, maxSec = 1.1): number {
  const t = clamp(holdSec / maxSec, 0, 1);
  // Ease-in so taps stay soft and charged kicks ramp up.
  return t * t * (3 - 2 * t);
}

export interface PassContext {
  distance: number;
  pressure: number;
  bodyAlignment: number;
  energy: number;
  attrs: PlayerAttributes;
  passType: PassType;
  hold01: number;
}

export interface PassResult {
  angleError: number;
  power: number;
  powerError: number;
}

export function computePassError(ctx: PassContext): PassResult {
  // EXECUTION only — vision must not reduce kick error (vision chooses; passing executes).
  const passStat =
    ctx.passType === "cross"
      ? (ctx.attrs.crossing ?? passStatForDistance(ctx.attrs, ctx.distance))
      : passStatForDistance(ctx.attrs, ctx.distance);
  const composure = stat01(ctx.attrs.composure);
  const distanceMultiplier = 1 + ctx.distance / 38;
  const pressureMultiplier = 1 + ctx.pressure * (0.7 + (1 - composure) * 0.35);
  const bodyOrientationMultiplier = 1 + (1 - clamp(ctx.bodyAlignment, 0, 1)) * 0.7;
  const fatigueMultiplier = 1 + (1 - ctx.energy) * 0.42;
  const attributeReduction = 1 - stat01(passStat) * 0.72 - composure * 0.1;
  const typeMultiplier =
    ctx.passType === "through"
      ? 1.12
      : ctx.passType === "cross"
        ? 1.14
        : ctx.passType === "long"
          ? 1.22
          : ctx.passType === "chip"
            ? 1.16
            : 1;
  const holdMultiplier = 1 + Math.abs(ctx.hold01 - idealHold(ctx.passType, ctx.distance)) * 0.45;

  const baseError =
    ctx.passType === "short" ? 0.058 : ctx.passType === "through" || ctx.passType === "chip" ? 0.072 : 0.085;
  const error =
    baseError *
    distanceMultiplier *
    pressureMultiplier *
    bodyOrientationMultiplier *
    fatigueMultiplier *
    clamp(attributeReduction, 0.22, 1.15) *
    typeMultiplier *
    holdMultiplier;

  const angleCap = ctx.passType === "short" ? 0.28 : ctx.passType === "through" ? 0.4 : 0.55;
  const angleError = clamp(boundedNoise(error), -angleCap, angleCap);
  const power = passPower(ctx);
  const powerError = boundedNoise(error * 3.2);
  return { angleError, power, powerError: clamp(powerError, -4.5, 4.5) };
}

function idealHold(type: PassType, distance: number): number {
  if (type === "through" || type === "chip") return clamp(0.35 + distance / 80, 0.4, 0.8);
  if (type === "long" || type === "cross") return clamp(0.55 + distance / 90, 0.6, 1);
  return clamp(distance / 36, 0.18, 0.72);
}

export function passPower(ctx: PassContext): number {
  const typeBoost =
    ctx.passType === "through"
      ? 1.22
      : ctx.passType === "chip"
        ? 1.08
        : ctx.passType === "cross"
          ? 1.18
          : ctx.passType === "long"
            ? 1.42
            : 1;
  const shotish = 11 + ctx.distance * 0.42 + ctx.hold01 * 10;
  return clamp(shotish * typeBoost, 8, 36);
}

export function longPassLift(distance: number, hold01: number, longPassing: number, pressure: number): number {
  const base = 3.4 + clamp(distance / 18, 0, 3.2) + hold01 * 2.6 + stat01(longPassing) * 1.1;
  return clamp(base - pressure * 0.6, 2.4, 8.5);
}

export function passFlightTime(distance: number, passType: PassType): number {
  // Crosses hang longer so attackers can challenge headers in the box.
  if (passType === "cross") return clamp(1.18 + distance / 20, 1.25, 2.65);
  if (passType === "long") return clamp(1.05 + distance / 22, 1.15, 2.45);
  if (passType === "chip") return clamp(0.72 + distance / 30, 0.7, 1.55);
  if (passType === "through") return clamp(0.55 + distance / 38, 0.58, 1.22);
  return clamp(0.42 + distance / 34, 0.44, 1.08);
}

export function passKickVector(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  passType: PassType,
): { vx: number; vz: number; vy: number; t: number } {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.max(1, Math.hypot(dx, dz));
  const t = passFlightTime(dist, passType);
  const k = 0.4;
  const mag = (dist * k) / Math.max(0.12, 1 - Math.exp(-k * t));
  // Slightly softer ground speed so lofted arcs read clearly.
  const groundScale =
    passType === "short"
      ? 0.9
      : passType === "through"
        ? 0.88
        : passType === "chip"
          ? 0.78
          : passType === "cross"
            ? 0.86
            : 0.85;
  const vx = (dx / dist) * mag * groundScale;
  const vz = (dz / dist) * mag * groundScale;
  // Symmetric loft for BALL_GRAVITY so apex ≈ 0.5 * g * (t/2)^2 family.
  let vy = 0.5 * BALL_GRAVITY * t;
  if (passType === "short") {
    // Short passes still hop / loft rather than skimming through ankles.
    const loftMul = dist > 14 ? 1.08 : dist > 9 ? 0.92 : 0.8;
    const floor = dist > 14 ? 3.1 : dist > 9 ? 2.05 : 1.55;
    const ceil = dist > 16 ? 7.2 : dist > 12 ? 5.6 : 4.6;
    vy = clamp(vy * loftMul, floor, ceil);
  } else if (passType === "chip") {
    // Lofted chip over a closing defender — slower ground, higher arc.
    vy = clamp(vy * 1.45 + dist * 0.04, 4.8, 11.5);
  } else if (passType === "through") {
    vy = clamp(vy * 1.05, 2.6, 7.2);
  } else if (passType === "cross") {
    // High hanging cross — classic header service.
    vy = clamp(vy * 1.38 + dist * 0.055, 7.0, 14.5);
  } else {
    // long
    vy = clamp(vy * 1.28 + dist * 0.05, 6.2, 14.2);
  }
  return { vx, vz, vy, t };
}

export interface PassCandidateScore {
  alignment: number;
  distance: number;
  lane: number;
  tactical: number;
  total: number;
}

export function scorePassCandidate(params: {
  alignment: number;
  distance: number;
  laneClear: number;
  tactical: number;
  passType: PassType;
  /** Vision scales recognition of valuable options (not execution). */
  vision?: number;
}): PassCandidateScore {
  const distTerm =
    params.passType === "long"
      ? clamp(params.distance / 48, 0.2, 1) * 0.38
      : 1 - clamp(params.distance / 42, 0, 1);
  const alignWeight = params.passType === "through" ? 2.6 : params.passType === "long" ? 2.4 : 2.0;
  const distWeight = params.passType === "long" ? 0.28 : 1.05;
  const laneWeight = params.passType === "short" ? 2.15 : params.passType === "through" ? 1.7 : 1.45;
  const vision = clamp(params.vision ?? 0.5, 0, 1);
  // High vision boosts ambitious through/long recognition; low vision damps them.
  const ambition =
    params.passType === "through" || params.passType === "long"
      ? 0.75 + vision * 0.55
      : 0.9 + vision * 0.2;
  const total =
    (params.alignment * alignWeight +
      distTerm * distWeight +
      params.laneClear * laneWeight +
      params.tactical * 1.05) *
    ambition;
  return {
    alignment: params.alignment,
    distance: distTerm,
    lane: params.laneClear,
    tactical: params.tactical,
    total,
  };
}
