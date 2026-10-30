import { clamp } from "../../core/math";
import {
  BALL_BOUNCE,
  BALL_GRAVITY,
  BALL_RADIUS,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
} from "../constants";
import type { Ball } from "./Ball";

/** Mild quadratic air resistance — slows long flights without killing lofted hang. */
const AIR_DRAG = 0.014;
/** Rolling resistance when the ball is on the carpet. */
const ROLL_FRICTION = 1.05;
/** Spinless ground-hop horizontal loss on each bounce. */
const BOUNCE_GRIP = 0.88;

/** Minimal motion state for physics (avoids allocating THREE meshes when solving kicks). */
export interface BallMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinY: number;
}

export function stepBall(ball: BallMotion, dt: number, frictionMul = 1, windZ = 0): void {
  // Integrate with drag before gravity so lofted balls arc naturally.
  const speed3 = Math.hypot(ball.vx, ball.vy, ball.vz);
  if (speed3 > 0.05) {
    const drag = 1 - Math.min(0.55, AIR_DRAG * speed3 * dt * frictionMul);
    ball.vx *= drag;
    ball.vy *= drag;
    ball.vz *= drag;
  }

  const ox = ball.vx;
  const oz = ball.vz;
  const ground = Math.hypot(ox, oz);

  // Magnus-ish sidespin: bend perpendicular to ground velocity while airborne.
  if (ball.y > BALL_RADIUS + 0.08 && Math.abs(ball.spinY) > 0.02 && ground > 1.5) {
    const mag = clamp(ball.spinY * ground * 0.55, -18, 18);
    ball.vx += (-oz / ground) * mag * dt;
    ball.vz += (ox / ground) * mag * dt;
  }
  // Backspin keeps loft alive; topspin dumps earlier.
  if (ball.y > BALL_RADIUS + 0.15 && Math.abs(ball.spinX) > 0.02) {
    ball.vy += clamp(ball.spinX * 2.8, -6, 6) * dt;
  }
  if (windZ !== 0 && ball.y > BALL_RADIUS + 0.2) {
    ball.vz += windZ * dt;
  }

  ball.spinY *= Math.max(0, 1 - 1.15 * dt);
  ball.spinX *= Math.max(0, 1 - 1.35 * dt);

  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  ball.y += ball.vy * dt;
  ball.vy -= BALL_GRAVITY * dt;

  if (ball.y < BALL_RADIUS) {
    ball.y = BALL_RADIUS;
    if (ball.vy < 0) {
      const impact = Math.abs(ball.vy);
      // Topspin kills bounce; backspin keeps a bit more hop.
      const spinBounce = clamp(1 - ball.spinX * 0.12, 0.82, 1.12);
      ball.vy = impact * BALL_BOUNCE * spinBounce;
      const grip = impact > 4 ? BOUNCE_GRIP * 0.92 : impact > 2 ? BOUNCE_GRIP : 0.94;
      const bx = ball.vx * grip;
      const bz = ball.vz * grip;
      const g = Math.hypot(bx, bz) || 1;
      const kick = ball.spinY * impact * 0.08;
      ball.vx = bx + (-bz / g) * kick;
      ball.vz = bz + (bx / g) * kick;
      ball.spinY *= 0.55;
      ball.spinX *= 0.4;
      // Spent hop — settle onto the roll instead of micro-bouncing forever.
      if (impact < 0.55) ball.vy = 0;
    } else if (Math.abs(ball.vy) < 0.2) {
      ball.vy = 0;
    }
  }

  const speed = Math.hypot(ball.vx, ball.vz);
  const onGround = ball.y <= BALL_RADIUS + 0.04 && Math.abs(ball.vy) < 0.35;
  if (onGround) {
    const friction = (ROLL_FRICTION + speed * 0.028) * frictionMul;
    const factor = Math.max(0, 1 - friction * dt);
    ball.vx *= factor;
    ball.vz *= factor;
    ball.spinY *= factor;
    ball.spinX *= factor * 0.9;
    if (speed < 0.1) {
      ball.vx = 0;
      ball.vz = 0;
      ball.spinY = 0;
      ball.spinX = 0;
    }
  }

  // Soft ceiling — keep extreme mis-kicks in-world for recovery.
  if (ball.y > 16) {
    ball.y = 16;
    ball.vy = Math.min(ball.vy, 0);
  }
}

export function kickBall(
  ball: Ball,
  vx: number,
  vz: number,
  vy = 0.4,
  opts?: { sidespin?: number; backspin?: number },
): void {
  ball.vx = vx;
  ball.vz = vz;
  ball.vy = vy;
  ball.ownerId = null;
  // Default mild backspin on lofted kicks; sidespin from aftertouch / contact.
  ball.spinX = opts?.backspin ?? clamp(vy / 10, -0.35, 0.85);
  ball.spinY = opts?.sidespin ?? 0;
}

/**
 * Header contact impulse — lower power than a kick, with hang / downward nod options.
 */
export function headerKick(
  ball: Ball,
  dirX: number,
  dirZ: number,
  opts: {
    power: number;
    /** Positive = lofted flick; negative leans into a downward nod. */
    lift: number;
    scatter?: number;
  },
): void {
  const len = Math.hypot(dirX, dirZ) || 1;
  const scatter = opts.scatter ?? 0;
  const vx = (dirX / len) * opts.power + (Math.random() - 0.5) * scatter;
  const vz = (dirZ / len) * opts.power + (Math.random() - 0.5) * scatter;
  const vy = clamp(opts.lift, -1.2, 9.5);
  kickBall(ball, vx, vz, vy);
}

/** Peak height of the current parabolic flight (ignoring drag). */
export function flightApexY(ball: Ball): number {
  if (ball.vy <= 0) return ball.y;
  return ball.y + (ball.vy * ball.vy) / (2 * BALL_GRAVITY);
}

export function dribbleBall(ball: Ball, px: number, pz: number, facing: number, control: number): void {
  const ahead = 0.85 + (1 - control / 100) * 0.15;
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  ball.x = px + fx * ahead;
  ball.z = pz + fz * ahead;
  ball.y = BALL_RADIUS;
  ball.vx = 0;
  ball.vz = 0;
  ball.vy = 0;
}

export function inGoal(ball: Ball, side: "home" | "away"): boolean {
  const line = side === "home" ? -HALF_LENGTH : HALF_LENGTH;
  const past = side === "home" ? ball.x < line : ball.x > line;
  return past && Math.abs(ball.z) < GOAL_WIDTH / 2 && ball.y < GOAL_HEIGHT && ball.y > 0;
}

export function outOfPitch(ball: Ball): "sideline" | "home-line" | "away-line" | null {
  if (Math.abs(ball.z) > HALF_WIDTH && Math.abs(ball.x) <= HALF_LENGTH) return "sideline";
  const overBar = ball.y >= GOAL_HEIGHT;
  if (ball.x < -HALF_LENGTH && (Math.abs(ball.z) > GOAL_WIDTH / 2 || overBar)) return "home-line";
  if (ball.x > HALF_LENGTH && (Math.abs(ball.z) > GOAL_WIDTH / 2 || overBar)) return "away-line";
  if (ball.x < -HALF_LENGTH - 2.2 || ball.x > HALF_LENGTH + 2.2) {
    return ball.x < 0 ? "home-line" : "away-line";
  }
  return null;
}

export function clampBallSoft(ball: Ball): void {
  if (Math.abs(ball.z) > HALF_WIDTH + 6) ball.vz *= -0.4;
  ball.z = clamp(ball.z, -HALF_WIDTH - 8, HALF_WIDTH + 8);
}
