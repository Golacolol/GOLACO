import { boundedNoise, clamp, stat01 } from "../../core/math";
import { BALL_GRAVITY, BALL_RADIUS } from "../constants";
import { passStatForDistance } from "../players/PlayerStats";
import type { PlayerAttributes } from "../../data/schema";
import { stepBall, type BallMotion } from "./BallPhysics";

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
      ? 1.08
      : ctx.passType === "chip"
        ? 1.08
        : ctx.passType === "cross"
          ? 1.18
          : ctx.passType === "long"
            ? 1.28
            : 1;
  const shotish = 10 + ctx.distance * 0.38 + ctx.hold01 * 9;
  return clamp(shotish * typeBoost, 8, 32);
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

/** Target catchable arrival speed (m/s) by delivery. */
export function passArrivalSpeed(passType: PassType): number {
  if (passType === "through") return 7.2;
  if (passType === "chip") return 5.5;
  if (passType === "cross") return 5.2;
  if (passType === "long") return 5.8;
  return 6.2;
}

/**
 * Loft for a pass type. Short/through use mid-loft so the ball leaves the carpet;
 * chip/long/cross stay high service.
 */
export function passLoftVy(distance: number, passType: PassType, flightT: number): number {
  const ballistic = 0.5 * BALL_GRAVITY * flightT;
  if (passType === "short") {
    // Driven mid-loft (modest bump over the old carpet-hugger) — apex ~0.8–2.4 m.
    const loftMul = distance > 16 ? 0.88 : distance > 11 ? 0.78 : distance > 7 ? 0.68 : 0.58;
    const floor = distance > 16 ? 5.0 : distance > 11 ? 4.4 : distance > 7 ? 3.8 : 3.4;
    const ceil = distance > 18 ? 8.0 : distance > 12 ? 6.8 : 5.8;
    return clamp(ballistic * loftMul, floor, ceil);
  }
  if (passType === "through") {
    // Weightable through — clears the carpet without a missile arc.
    return clamp(ballistic * 0.74, 2.8, 6.0);
  }
  if (passType === "chip") {
    return clamp(ballistic * 1.45 + distance * 0.04, 4.8, 11.5);
  }
  if (passType === "cross") {
    return clamp(ballistic * 1.38 + distance * 0.055, 7.0, 14.5);
  }
  // long
  return clamp(ballistic * 1.28 + distance * 0.05, 6.2, 14.2);
}

/** Simulate how far a kick travels along +X before speed drops near arrival or time expires. */
function simulatePassTravel(
  groundSpeed: number,
  vy: number,
  targetDist: number,
  maxT: number,
  lofted: boolean,
): {
  dist: number;
  speedAtClosest: number;
  closest: number;
  apex: number;
  landX: number;
} {
  const ball: BallMotion = {
    x: 0,
    y: Math.max(BALL_RADIUS + 0.02, 0.28),
    z: 0,
    vx: groundSpeed,
    vy,
    vz: 0,
    spinX: clamp(vy / 10, -0.35, 0.85),
    spinY: 0,
  };
  const dt = 1 / 60;
  const steps = Math.ceil(maxT / dt) + 8;
  let closest = Infinity;
  let speedAtClosest = groundSpeed;
  let apex = ball.y;
  let landX = 0;
  let wasAir = false;
  for (let i = 0; i < steps; i++) {
    stepBall(ball, dt);
    apex = Math.max(apex, ball.y);
    if (ball.y > BALL_RADIUS + 0.35) wasAir = true;
    if (wasAir && ball.y <= BALL_RADIUS + 0.12 && landX === 0) landX = ball.x;
    const d = Math.abs(ball.x - targetDist);
    if (d < closest) {
      closest = d;
      speedAtClosest = Math.hypot(ball.vx, ball.vz);
    }
    // Past the target and slowing — done.
    if (ball.x > targetDist + 1.5 && Math.hypot(ball.vx, ball.vz) < 2) break;
    if (ball.x > targetDist + 10) break;
  }
  if (landX === 0) landX = ball.x;
  const refX = lofted ? landX : ball.x;
  return { dist: refX, speedAtClosest, closest, apex, landX };
}

/**
 * Binary-search ground speed so the ball's closest approach to `dist` is near the target
 * at a catchable arrival speed — matches real `stepBall` drag/bounce/roll.
 */
export function solvePassGroundSpeed(distance: number, vy: number, passType: PassType, flightT: number): number {
  const dist = Math.max(1, distance);
  const arrive = passArrivalSpeed(passType);
  const lofted = passType === "long" || passType === "cross" || passType === "chip";
  const maxT = Math.max(flightT * 1.85, flightT + 0.55);
  let lo = lofted ? 8 : 5;
  let hi = lofted ? 42 : 32;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) * 0.5;
    const sim = simulatePassTravel(mid, vy, dist, maxT, lofted);
    const overshoot = sim.dist > dist + (lofted ? 2.2 : 1.2);
    const tooFast = !lofted && sim.closest < 2.5 && sim.speedAtClosest > arrive + 3.5;
    const short = sim.dist < dist - (lofted ? 1.5 : 0.8);
    if (short && !tooFast) lo = mid;
    else if (overshoot || tooFast) hi = mid;
    else if (sim.closest > (lofted ? 3.2 : 1.8)) lo = mid;
    else hi = mid;
  }
  return clamp((lo + hi) * 0.5, 6, 40);
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
  const vy = passLoftVy(dist, passType, t);
  const mag = solvePassGroundSpeed(dist, vy, passType, t);
  const vx = (dx / dist) * mag;
  const vz = (dz / dist) * mag;
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
