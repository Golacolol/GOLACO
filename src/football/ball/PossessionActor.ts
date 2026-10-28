/**
 * Single ball-actor gate (footballSimulationEngine / League-Soccer idea).
 * Only one resolving ball interaction may win a frame: kick, collect, header,
 * disturb, or tackle steal — so multi-kick / multi-collect races can't stack.
 */
import { clamp, lerp, stat01 } from "../../core/math";
import { BALL_RADIUS } from "../constants";
import type { Ball } from "./Ball";

export type BallActionKind = "kick" | "collect" | "header" | "disturb" | "tackle" | "gk_claim";

/** Contact zone used for first-touch settle (OpenSWOS-style feel, reimplemented). */
export type ContactZone = "foot" | "body" | "air";

const PRIORITY: Record<BallActionKind, number> = {
  kick: 100,
  gk_claim: 90,
  tackle: 80,
  header: 70,
  collect: 50,
  disturb: 30,
};

export class PossessionActor {
  private claimed: BallActionKind | null = null;
  private claimedPriority = -1;
  private actorId: string | null = null;

  /** Call once at the start of each match tick. */
  beginFrame(): void {
    this.claimed = null;
    this.claimedPriority = -1;
    this.actorId = null;
  }

  /**
   * Try to claim the ball action for this frame.
   * Higher priority wins; same priority is first-come.
   */
  tryClaim(kind: BallActionKind, actorId?: string | null): boolean {
    const p = PRIORITY[kind];
    if (this.claimed != null && p < this.claimedPriority) return false;
    if (this.claimed != null && p === this.claimedPriority && this.claimed !== kind) return false;
    this.claimed = kind;
    this.claimedPriority = p;
    this.actorId = actorId ?? null;
    return true;
  }

  /** True after any successful claim this frame. */
  get resolved(): boolean {
    return this.claimed != null;
  }

  get kind(): BallActionKind | null {
    return this.claimed;
  }

  get actor(): string | null {
    return this.actorId;
  }

  /** Ball is in flight after a kick — block collect/kick until it slows or lands. */
  ballBusy(ball: Ball, ownerId: string | null): boolean {
    if (ownerId) return false;
    const ground = Math.hypot(ball.vx, ball.vz);
    return ground > 11.5 || (ball.y > 1.85 && ground > 6);
  }
}

export function classifyContactZone(ball: Ball, aerial: boolean): ContactZone {
  if (aerial || ball.y > 1.45) return "air";
  if (ball.y > 0.72) return "body";
  return "foot";
}

export interface FirstTouchSettleOpts {
  control: number;
  strength: number;
  pressure: number;
  energy: number;
  aerial: boolean;
  /** From GameplayTuning.firstTouchErrorMultiplier */
  errorMul?: number;
  zone?: ContactZone;
  rng?: () => number;
}

export interface FirstTouchSettleResult {
  zone: ContactZone;
  scatterX: number;
  scatterZ: number;
  firstTouchTimer: number;
  lost: boolean;
  /** Velocity damp 0–1 applied to vx/vz/vy. */
  settle: number;
}

/**
 * Controlled collect: kill flight, apply zone scatter, optionally spill under pressure.
 * Strength helps drive through a firm first touch (MIT sim engine idea).
 */
export function settleFirstTouch(ball: Ball, opts: FirstTouchSettleOpts): FirstTouchSettleResult {
  const rng = opts.rng ?? Math.random;
  const control = stat01(opts.control);
  const strength = stat01(opts.strength);
  const zone = opts.zone ?? classifyContactZone(ball, opts.aerial);
  const errorMul = opts.errorMul ?? 1;
  const zoneScatter =
    zone === "air" ? 1.55 : zone === "body" ? 1.22 : 0.92;
  const scatterMag =
    ((1 - control) * 0.85 * zoneScatter + opts.pressure * 0.55 + (1 - opts.energy) * 0.25) * errorMul;
  const scatterX = (rng() - 0.5) * scatterMag;
  const scatterZ = (rng() - 0.5) * scatterMag;
  // Strong players pin the ball; weak first touches leave more flight.
  const settle = clamp(0.18 + control * 0.52 + strength * 0.14 - (zone === "air" ? 0.08 : 0), 0.12, 0.82);
  const firstTouchTimer =
    0.1 + (1 - control) * 0.22 + (zone === "air" ? 0.12 : zone === "body" ? 0.06 : 0);
  const lost =
    scatterMag > 1.1 && opts.pressure > 0.45 && rng() < clamp(0.35 + opts.pressure * 0.4 - control * 0.35, 0.08, 0.72);

  ball.x += scatterX;
  ball.z += scatterZ;
  ball.vx *= 1 - settle;
  ball.vz *= 1 - settle;
  ball.vy = Math.min(ball.vy * (1 - settle), zone === "air" ? 0.85 : 0.35);
  if (zone !== "air" || settle > 0.4) {
    ball.y = Math.min(ball.y, lerp(BALL_RADIUS + 0.55, BALL_RADIUS, control));
  } else {
    ball.y = Math.min(ball.y, 0.95 + (1 - control) * 0.35);
  }

  return { zone, scatterX, scatterZ, firstTouchTimer, lost, settle };
}

/** Kick power scale from player strength (footballSimulationEngine). */
export function strengthKickScale(strength: number): number {
  return lerp(0.88, 1.12, stat01(strength));
}
