import { clamp, boundedNoise, normalize2, stat01 } from "../../core/math";
import { HALF_LENGTH } from "../constants";
import type { Player } from "../players/Player";

export type TackleOutcome =
  | "CLEAN_WIN"
  | "KNOCKED_LOOSE"
  | "DEFLECTION"
  | "RETAIN"
  | "MISS"
  | "FOUL"
  | "YELLOW_CARD"
  | "RED_CARD";

export interface TackleContext {
  distance: number;
  ballDistance: number;
  closingSpeed: number;
  angleAlignment: number;
  /** 1 = fully behind the attacker; 0 = side-on / front. */
  fromBehind: number;
  /** True when the ball is closer to the defender than the attacker's body (clean contact path). */
  ballFirst: boolean;
  throughOnGoal: boolean;
  defenderTackling: number;
  defenderJumping: number;
  defenderDefending: number;
  defenderStrength: number;
  attackerControl: number;
  attackerDribbling: number;
  attackerComposure: number;
  attackerSpeed: number;
  pressure: number;
  ballExposure: number;
  timed: boolean;
  slideSpeed: number;
  /** 0..1 commit timing quality (sweet-spot distance). */
  timingQuality?: number;
}

export const TACKLE_COOLDOWN = 1.45;
export const SLIDE_DURATION = 0.32;
export const SLIDE_SPEED = 12.2;
export const SLIDE_CONTACT = 1.22;
export const SLIDE_STAMINA_COST = 0.09;
export const SLIDE_RECOVER_MISS = 1.45;
export const SLIDE_RECOVER_EARLY = 1.85;
export const SLIDE_MIN_ENERGY = 0.18;
/** Max start distance for a committed slide (early commits recover longer). */
export const SLIDE_COMMIT_RANGE = 2.3;
/** Sweet-spot contact distance for a well-timed slide (OpenSWOS / open-soccer feel). */
export const SLIDE_TIMING_SWEET_MIN = 0.75;
export const SLIDE_TIMING_SWEET_MAX = 1.55;

/**
 * 0..1 quality of slide timing from start distance — peaks in the sweet spot.
 * Used to bias CLEAN_WIN vs foul/miss.
 */
export function slideTimingQuality(distance: number, windowMul = 1): number {
  const sweetMin = SLIDE_TIMING_SWEET_MIN / Math.max(0.7, windowMul);
  const sweetMax = SLIDE_TIMING_SWEET_MAX * Math.max(0.85, windowMul);
  if (distance < sweetMin * 0.55) return 0.22; // too late / on top of them
  if (distance > SLIDE_COMMIT_RANGE) return 0.08; // way early
  if (distance >= sweetMin && distance <= sweetMax) {
    const mid = (sweetMin + sweetMax) * 0.5;
    const span = (sweetMax - sweetMin) * 0.5 || 0.3;
    return 0.72 + (1 - Math.abs(distance - mid) / span) * 0.28;
  }
  if (distance < sweetMin) return lerp(0.22, 0.72, distance / sweetMin);
  return lerp(0.72, 0.08, (distance - sweetMax) / (SLIDE_COMMIT_RANGE - sweetMax + 0.01));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function tacklingStat(player: Player): number {
  return player.attrs.tackling ?? player.attrs.defending;
}

export function jumpingStat(player: Player): number {
  return player.attrs.jumping ?? Math.round((player.attrs.strength + player.attrs.pace) * 0.5);
}

/** How much the defender is approaching from behind the attacker (0–1). */
export function approachFromBehind(defender: Player, attacker: Player): number {
  const dx = defender.x - attacker.x;
  const dz = defender.z - attacker.z;
  const len = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(attacker.facing);
  const fz = Math.cos(attacker.facing);
  // Defender sits in the attacker's back cone when this is negative.
  const rear = clamp(-(dx / len) * fx - (dz / len) * fz, 0, 1);
  return rear;
}

export function ballReachedFirst(
  defender: Player,
  attacker: Player,
  ball: { x: number; z: number },
): boolean {
  const toBall = defender.distTo(ball.x, ball.z);
  const toBody = defender.distTo(attacker.x, attacker.z);
  // Prefer the ball if it's meaningfully closer, or sits between defender and attacker.
  if (toBall + 0.22 < toBody) return true;
  const ax = attacker.x - defender.x;
  const az = attacker.z - defender.z;
  const bx = ball.x - defender.x;
  const bz = ball.z - defender.z;
  const aLen = Math.hypot(ax, az) || 1;
  const proj = (bx * ax + bz * az) / aLen;
  return proj > 0.15 && proj < aLen - 0.2 && toBall < toBody + 0.35;
}

/** Attacker running clear toward the defender's goal with the defender trailing. */
export function isThroughOnGoal(attacker: Player, defender: Player): boolean {
  const goalX = defender.ownGoalX();
  const attToGoal = Math.abs(attacker.x - goalX);
  const defToGoal = Math.abs(defender.x - goalX);
  if (attToGoal > 28) return false;
  if (defToGoal + 1.2 < attToGoal) return false; // defender already closer to goal = covering
  const towardGoal = Math.sign(goalX - attacker.x) || attacker.attackSign;
  const carryingIn = attacker.vx * towardGoal > 1.2 || attacker.attackSign === towardGoal;
  return carryingIn && attToGoal < 24;
}

export function buildTackleContext(
  defender: Player,
  attacker: Player,
  ball: { x: number; z: number },
  pressure: number,
  timed: boolean,
): TackleContext {
  const dx = attacker.x - defender.x;
  const dz = attacker.z - defender.z;
  const dist = Math.hypot(dx, dz);
  const faceX = Math.sin(defender.facing);
  const faceZ = Math.cos(defender.facing);
  const dir = dist || 1;
  const angleAlignment = clamp((dx / dir) * faceX + (dz / dir) * faceZ, -1, 1);
  const relVx = attacker.vx - defender.vx;
  const relVz = attacker.vz - defender.vz;
  const closingSpeed = Math.max(0, -(relVx * dx + relVz * dz) / dir);
  const exposure = clamp(attacker.speed / 10, 0.15, 1) * (1.15 - stat01(attacker.attrs.control) * 0.4);
  const slideSpeed = Math.hypot(defender.vx, defender.vz);
  const ballDistance = defender.distTo(ball.x, ball.z);
  return {
    distance: dist,
    ballDistance,
    closingSpeed,
    angleAlignment,
    fromBehind: approachFromBehind(defender, attacker),
    ballFirst: ballReachedFirst(defender, attacker, ball),
    throughOnGoal: isThroughOnGoal(attacker, defender),
    defenderTackling: tacklingStat(defender),
    defenderJumping: jumpingStat(defender),
    defenderDefending: defender.attrs.defending,
    defenderStrength: defender.attrs.strength,
    attackerControl: attacker.attrs.control,
    attackerDribbling: attacker.attrs.dribbling,
    attackerComposure: attacker.attrs.composure,
    attackerSpeed: attacker.speed,
    pressure,
    ballExposure: exposure,
    timed,
    slideSpeed,
    timingQuality: slideTimingQuality(Math.min(dist, ballDistance)),
  };
}

export function resolveTackle(ctx: TackleContext): TackleOutcome {
  // Still too far at contact check → miss (early / mistimed).
  if (ctx.distance > SLIDE_CONTACT + 0.35 && ctx.ballDistance > SLIDE_CONTACT + 0.25) return "MISS";

  const skill =
    stat01(ctx.defenderTackling) * 0.5 +
    stat01(ctx.defenderDefending) * 0.22 +
    stat01(ctx.defenderJumping) * 0.14 +
    stat01(ctx.defenderStrength) * 0.14;
  const att =
    stat01(ctx.attackerDribbling) * 0.4 +
    stat01(ctx.attackerControl) * 0.35 +
    stat01(ctx.attackerComposure) * 0.25;
  const timing = ctx.timed ? 1.12 : 0.78;
  const angle = (ctx.angleAlignment + 1) / 2;
  const speedFactor = clamp(ctx.slideSpeed / 14, 0.25, 1);
  const range = clamp(1.15 - Math.min(ctx.distance, ctx.ballDistance), 0, 1);

  // Catch the man before the ball from behind → foul territory.
  if (!ctx.ballFirst && ctx.fromBehind > 0.42) {
    const foulChance = clamp(
      0.22 +
        ctx.fromBehind * 0.48 +
        speedFactor * 0.2 +
        (1 - skill) * 0.32 -
        (ctx.timed ? 0.1 : 0) +
        boundedNoise(0.08),
      0.08,
      0.96,
    );
    if (Math.random() < foulChance || (ctx.throughOnGoal && Math.random() < foulChance + 0.18)) {
      // DOGSO / extreme from-behind + poor timing → red; otherwise yellow or soft foul.
      const red =
        ctx.throughOnGoal ||
        (ctx.fromBehind > 0.78 && speedFactor > 0.75 && skill < 0.42 && foulChance > 0.7);
      if (red) return "RED_CARD";
      if (foulChance > 0.42 || ctx.fromBehind > 0.52) return "YELLOW_CARD";
      return "FOUL";
    }
  }

  // Sideways clip without ball contact → softer foul chance.
  if (!ctx.ballFirst && ctx.distance < 0.95) {
    const clipChance = clamp(
      (1 - skill) * 0.42 + speedFactor * 0.18 + (1 - angle) * 0.14 + boundedNoise(0.06),
      0.05,
      0.85,
    );
    if (Math.random() < clipChance * 0.55) return "YELLOW_CARD";
    if (Math.random() < clipChance) return "FOUL";
  }

  const timingQ = ctx.timingQuality ?? slideTimingQuality(Math.min(ctx.distance, ctx.ballDistance));
  const score =
    0.2 +
    skill * 0.42 +
    range * 0.16 +
    angle * 0.1 +
    (ctx.ballFirst ? 0.18 : -0.12) +
    ctx.pressure * 0.12 +
    ctx.ballExposure * 0.12 +
    clamp(ctx.closingSpeed / 8, 0, 1) * 0.06 +
    timingQ * 0.22 -
    att * 0.32 -
    ctx.fromBehind * 0.14;
  const roll = 0.5 + boundedNoise(0.22);
  const value = score * timing * (0.78 + timingQ * 0.12) * (0.82 + roll * 0.36);

  if (value > 0.76) return "CLEAN_WIN";
  if (value > 0.56) return "KNOCKED_LOOSE";
  if (value > 0.4) return "DEFLECTION";
  if (value > 0.26) return "RETAIN";
  return "MISS";
}

/** Resolve a slide onto a loose ball (intercept / retrieve). */
export function resolveLooseBallSlide(
  defender: Player,
  ball: { x: number; z: number; vx?: number; vz?: number },
  timed: boolean,
): TackleOutcome {
  const dist = defender.distTo(ball.x, ball.z);
  if (dist > SLIDE_CONTACT + 0.4) return "MISS";
  const skill = stat01(tacklingStat(defender)) * 0.55 + stat01(jumpingStat(defender)) * 0.25 + stat01(defender.attrs.control) * 0.2;
  const timing = timed ? 1.1 : 0.85;
  const ballSpeed = Math.hypot(ball.vx ?? 0, ball.vz ?? 0);
  const intercept = clamp(1.1 - dist, 0, 1) * 0.35 + clamp(ballSpeed / 18, 0, 1) * 0.15;
  const value = (0.28 + skill * 0.5 + intercept) * timing * (0.85 + boundedNoise(0.2));
  if (value > 0.62) return "CLEAN_WIN";
  if (value > 0.42) return "KNOCKED_LOOSE";
  return "MISS";
}

export function slideAimDir(
  defender: Player,
  target: { x: number; z: number },
): { x: number; z: number } {
  const dx = target.x - defender.x;
  const dz = target.z - defender.z;
  if (Math.hypot(dx, dz) < 0.05) {
    return { x: Math.sin(defender.facing), z: Math.cos(defender.facing) };
  }
  return normalize2(dx, dz);
}

export interface AiSlideDecision {
  attempt: boolean;
  /** Prefer sliding at the loose ball rather than the carrier. */
  forBall: boolean;
}

/** Natural slide-tackle roles — attackers and creative mids should almost never dive in. */
export function isDefensiveSlideRole(player: Player): boolean {
  const slot = player.slot;
  const pos = player.position;
  if (player.isGK) return false;
  if (slot.includes("CB") || pos === "CB") return true;
  if (slot === "LB" || slot === "RB" || pos === "LB" || pos === "RB") return true;
  if (slot === "LWB" || slot === "RWB" || pos === "LWB" || pos === "RWB") return true;
  if (slot === "DM" || slot.includes("DM") || pos === "DM") return true;
  return false;
}

/**
 * Simulated defenders slide sparingly: through-on-goal trailing, interceptions,
 * or retrieving a pass — and avoid reckless from-behind challenges.
 */
export function shouldAiAttemptTackle(
  distance: number,
  pressure: number,
  possessionTime: number,
  cooldown: number,
): boolean {
  // Legacy gate kept for tests; prefer shouldAiSlideTackle.
  if (cooldown > 0) return false;
  if (distance > 1.25) return false;
  if (possessionTime < 0.45 && pressure < 0.55) return false;
  const urge = clamp(pressure * 0.55 + (possessionTime - 1.2) * 0.12 + (1.25 - distance) * 0.4, 0, 1);
  return urge > 0.48;
}

export function shouldAiSlideTackle(opts: {
  distance: number;
  ballDistance: number;
  pressure: number;
  possessionTime: number;
  cooldown: number;
  recoverTimer: number;
  energy: number;
  fromBehind: number;
  throughOnGoal: boolean;
  ballLoose: boolean;
  tackling: number;
  /** Press/contest willingness — raises attempt rate, not success. */
  aggression?: number;
  /** True for CB/FB/WB/DM — primary slide users. */
  defensiveRole?: boolean;
  /** Team is defending (not in possession / opponent last touch). */
  defending?: boolean;
  /** Opponent pass currently in flight (loose ball from their pass). */
  opponentPassInFlight?: boolean;
  rng?: () => number;
}): AiSlideDecision {
  const rng = opts.rng ?? Math.random;
  const no: AiSlideDecision = { attempt: false, forBall: false };
  if (opts.cooldown > 0 || opts.recoverTimer > 0) return no;
  if (opts.energy < SLIDE_MIN_ENERGY + 0.08) return no;

  const defensiveRole = opts.defensiveRole !== false;
  const defending = opts.defending !== false;
  const aggression = stat01(opts.aggression ?? opts.tackling);

  if (!defending) return no;
  if (!defensiveRole && !opts.throughOnGoal) return no;

  if (opts.ballLoose) {
    if (!opts.opponentPassInFlight) return no;
    if (!defensiveRole) return no;
    if (opts.ballDistance > 3.2 || opts.ballDistance < 0.7) return no;
    const skill = stat01(opts.tackling);
    const urge = clamp((2.8 - opts.ballDistance) * 0.22 + skill * 0.12 + aggression * 0.14, 0, 1);
    if (urge > 0.55 && rng() < 0.1 + skill * 0.08 + aggression * 0.08) return { attempt: true, forBall: true };
    return no;
  }

  if (opts.distance > SLIDE_COMMIT_RANGE) return no;
  // Prefer the sweet-spot window — don't dive from too far or when already on top.
  const timingQ = slideTimingQuality(opts.distance);
  if (timingQ < 0.28 && !opts.throughOnGoal) return no;

  if (opts.fromBehind > 0.55 && !opts.throughOnGoal) return no;
  if (opts.fromBehind > 0.7 && opts.throughOnGoal && stat01(opts.tackling) < 0.45 && rng() < 0.65) {
    return no;
  }

  let urge = 0;
  if (opts.throughOnGoal && opts.distance < 4.2) {
    urge = 0.42 + (1 - opts.distance / 4.2) * 0.28 + (1 - opts.fromBehind) * 0.08;
    if (!defensiveRole) urge *= 0.72;
  } else if (defensiveRole && opts.distance < 1.85 && opts.pressure > 0.62 && opts.possessionTime > 1.0) {
    urge = 0.14 + opts.pressure * 0.12 + (1.85 - opts.distance) * 0.1 + aggression * 0.12;
  } else {
    return no;
  }

  // Tackling = technical willingness to complete; aggression = propensity to dive in.
  urge *= 0.48 + stat01(opts.tackling) * 0.22 + aggression * 0.22;
  urge *= 0.7 + timingQ * 0.45;
  if (opts.fromBehind > 0.5) urge *= 0.45;
  if (rng() > clamp(urge, 0, 0.78)) return no;
  return { attempt: true, forBall: false };
}

/** Rough danger zone helper for callers without full player refs. */
export function nearOwnGoal(player: Player, maxDist = 26): boolean {
  return Math.abs(player.x - player.ownGoalX()) < maxDist && Math.abs(player.x) > HALF_LENGTH - maxDist - 8;
}
