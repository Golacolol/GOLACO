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
    return ground > 10.2 || (ball.y > 1.7 && ground > 5.2);
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
  /** Player facing (rad) — poor approach into the ball increases spill. */
  facing?: number;
  /** How square the hips are to the incoming ball (0–1). */
  approachAlignment?: number;
  /** Style patience: higher = longer settle before second action (0–1). */
  receivePatience?: number;
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
 * Facing / approach alignment decide whether the touch sticks or squirts away.
 */
export function settleFirstTouch(ball: Ball, opts: FirstTouchSettleOpts): FirstTouchSettleResult {
  const rng = opts.rng ?? Math.random;
  const control = stat01(opts.control);
  const strength = stat01(opts.strength);
  const zone = opts.zone ?? classifyContactZone(ball, opts.aerial);
  const errorMul = opts.errorMul ?? 1;
  const approach = clamp(opts.approachAlignment ?? 0.75, 0, 1);
  const patience = clamp(opts.receivePatience ?? 0.45, 0, 1);
  const facePenalty = (1 - approach) * 0.85;
  const zoneScatter =
    zone === "air" ? 1.55 : zone === "body" ? 1.18 : 0.72;
  const scatterMag =
    ((1 - control) * 0.72 * zoneScatter + opts.pressure * 0.48 + (1 - opts.energy) * 0.22 + facePenalty * 0.55) *
    errorMul;
  const scatterX = (rng() - 0.5) * scatterMag;
  const scatterZ = (rng() - 0.5) * scatterMag;
  // Foot / short collects nearly pin the ball; aerial/body keep meaningful scatter.
  const settle =
    zone === "foot"
      ? clamp(0.9 + control * 0.08 + strength * 0.02 - opts.pressure * 0.08 - facePenalty * 0.12, 0.78, 0.98)
      : zone === "body"
        ? clamp(0.55 + control * 0.28 + strength * 0.1 - opts.pressure * 0.1 - facePenalty * 0.1, 0.4, 0.88)
        : clamp(0.22 + control * 0.48 + strength * 0.12 - facePenalty * 0.08, 0.16, 0.78);
  // Longer plant window so second touch / pass isn't instant after a firm receive.
  const firstTouchTimer =
    (zone === "foot"
      ? 0.1 + (1 - control) * 0.16 + facePenalty * 0.1
      : 0.16 + (1 - control) * 0.26 + (zone === "air" ? 0.14 : 0.08) + facePenalty * 0.12) *
    (0.85 + patience * 0.45) *
    clamp(errorMul, 0.55, 1.35);
  // Routine ground receives stick; lose mainly under heavy pressure / aerial mess / bad approach.
  const lost =
    zone === "air"
      ? scatterMag > 1.05 &&
        (opts.pressure > 0.42 || approach < 0.38) &&
        rng() < clamp(0.2 + opts.pressure * 0.32 + facePenalty * 0.28 - control * 0.35, 0.05, 0.62)
      : scatterMag > 1.25 &&
        (opts.pressure > 0.62 || approach < 0.3) &&
        rng() < clamp(0.1 + opts.pressure * 0.22 + facePenalty * 0.22 - control * 0.42, 0.01, 0.35);

  ball.x += scatterX;
  ball.z += scatterZ;
  ball.vx *= 1 - settle;
  ball.vz *= 1 - settle;
  ball.vy = Math.min(ball.vy * (1 - settle), zone === "air" ? 0.85 : zone === "foot" ? 0.12 : 0.28);
  if (zone === "foot") {
    // Successful foot settle → near-zero residual ground velocity.
    if (!lost && settle >= 0.9) {
      ball.vx *= 0.15;
      ball.vz *= 0.15;
      ball.vy = Math.min(ball.vy, 0.08);
    } else if (!lost && settle < 0.88) {
      // Soft / awkward touch keeps a residual bounce away from the feet.
      ball.vx += (rng() - 0.5) * (1 - settle) * 2.2;
      ball.vz += (rng() - 0.5) * (1 - settle) * 2.2;
    }
    ball.y = Math.min(ball.y, BALL_RADIUS);
  } else if (zone !== "air" || settle > 0.4) {
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
