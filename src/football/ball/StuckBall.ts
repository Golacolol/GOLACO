import { BALL_GRAVITY, BALL_RADIUS } from "../constants";
import { FootballState } from "../FootballState";
import type { Ball } from "./Ball";

export const LEGAL_STATIONARY: FootballState[] = [
  FootballState.KICK_OFF,
  FootballState.FREE_KICK,
  FootballState.PENALTY,
  FootballState.GOAL_KICK,
  FootballState.CORNER,
  FootballState.THROW_IN,
  FootballState.PRE_MATCH,
  FootballState.GOAL_CELEBRATION,
  FootballState.FULL_TIME,
  FootballState.PAUSED,
];

export function isLegalStationary(state: FootballState, hasOwner: boolean): boolean {
  if (LEGAL_STATIONARY.includes(state)) return true;
  if (hasOwner) return true;
  return false;
}

export function ballSpeed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vz, ball.vy);
}

export function isOutOfWorld(ball: Ball): boolean {
  return Math.abs(ball.x) > 70 || Math.abs(ball.z) > 50 || ball.y < -0.5 || ball.y > 18;
}

export function predictLanding(ball: Ball): { x: number; z: number; t: number } {
  const g = BALL_GRAVITY;
  const y0 = Math.max(ball.y, BALL_RADIUS);
  const a = 0.5 * g;
  const b = -ball.vy;
  const c = -(y0 - BALL_RADIUS);
  const disc = b * b - 4 * a * c;
  let t = 0.35;
  if (disc >= 0 && a !== 0) {
    const t1 = (-b + Math.sqrt(disc)) / (2 * a);
    const t2 = (-b - Math.sqrt(disc)) / (2 * a);
    t = Math.max(t1, t2, 0.12);
  }
  return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t, t };
}
