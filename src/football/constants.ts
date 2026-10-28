export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const HALF_LENGTH = PITCH_LENGTH / 2;
export const HALF_WIDTH = PITCH_WIDTH / 2;

export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const GOAL_DEPTH = 2.0;
export const PENALTY_SPOT = 11;
export const PENALTY_AREA_LENGTH = 16.5;
export const PENALTY_AREA_WIDTH = 40.32;
export const SIX_YARD_LENGTH = 5.5;
export const SIX_YARD_WIDTH = 18.32;
export const CENTRE_CIRCLE_RADIUS = 9.15;
export const CORNER_ARC_RADIUS = 1.0;

export const BALL_RADIUS = 0.11;
export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.82;
/**
 * Vertical acceleration for ball flight (game units/s²).
 * Slightly softer than a hard 18 so lofted balls / crosses hang for headers.
 */
export const BALL_GRAVITY = 15.4;
/** Coefficient of restitution for a football bounce. */
export const BALL_BOUNCE = 0.58;

export const POSSESSION_RANGE = 1.15;
export const TACKLE_RANGE = 1.05;
export const PRESS_RANGE = 8.5;

export const DEFAULT_HALF_SECONDS = 5 * 60;
export const DEFAULT_MATCH_DURATION = DEFAULT_HALF_SECONDS * 2;
export const DEFAULT_KICK_OFF_TIME = "15:00";
export const DEFAULT_TEAM_ID = "plymouth_argyle_current";
export const MIN_MATCH_DURATION = 2 * 60;
export const MAX_MATCH_DURATION = 45 * 60;
export const HALF_TIME_PAUSE = 5;
export const PRE_MATCH_CARD_SECONDS = 5;
export const MATCH_CARD_FADE_SECONDS = 0.9;
export const MATCH_CARD_FADE_LEAD = 1.05;
export const HUD_CARD_RAISE_SECONDS = 20;
export const HUD_CARD_FADE_SECONDS = 0.9;
export const AUTOPLAY_IDLE_SECONDS = 60;
export const AUTOPLAY_NEXT_MATCH_HOLD = 5;
/** Delay before the simulate / take-over banner appears after kick-off. */
export const SIM_BANNER_DELAY_SECONDS = 5;
export const CELEBRATION_SECONDS = 3.6;

export const SPEED_BURST_SPEED_MUL = 1.34;
export const SPEED_BURST_SHOT_MUL = 1.28;
export const SPEED_BURST_DRAIN = 4.8;
export const SPEED_BURST_MIN_ENERGY = 0.2;

export function clampMatchDuration(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MATCH_DURATION;
  return Math.min(MAX_MATCH_DURATION, Math.max(MIN_MATCH_DURATION, Math.round(n)));
}

export const HALF_LENGTH_CHOICES: { minutes: number; seconds: number }[] = [
  { minutes: 3, seconds: 3 * 60 * 2 },
  { minutes: 5, seconds: 5 * 60 * 2 },
  { minutes: 10, seconds: 10 * 60 * 2 },
  { minutes: 15, seconds: 15 * 60 * 2 },
  { minutes: 20, seconds: 20 * 60 * 2 },
];

export function kickOffTimeChoices(): string[] {
  const times: string[] = [];
  for (let h = 12; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 21 && m > 0) break;
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return times;
}

export function normalizeKickOffTime(value: string | undefined, fallback = DEFAULT_KICK_OFF_TIME): string {
  const t = (value ?? "").trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(":").map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return fallback;
}

export type KickCountdownPhase = "days" | "hours" | "minutes" | "seconds";

/** Local kick-off Date from fixture calendar date + HH:MM. */
export function fixtureKickOffDate(date: string, time: string | undefined, now = new Date()): Date {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayFallback(now);
  const [y, mo, d] = iso.split("-").map(Number);
  const [hh, mm] = normalizeKickOffTime(time).split(":").map(Number);
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

export function kickOffRemainingSeconds(date: string, time: string | undefined, now = new Date()): number {
  const kick = fixtureKickOffDate(date, time, now);
  return Math.max(0, Math.floor((kick.getTime() - now.getTime()) / 1000));
}

/**
 * Two-digit kick-off countdown:
 * - days (white) while more than 24 hours remain
 * - hours (gold) from 24 hours down through 61 minutes
 * - minutes (red) from 60 minutes down through 61 seconds
 * - seconds (green) for the last 60 seconds
 */
export function formatKickCountdown(remainingSeconds: number): { value: string; phase: KickCountdownPhase } {
  const s = Math.max(0, Math.floor(remainingSeconds));
  const day = 24 * 3600;
  if (s > day) {
    return { value: String(Math.floor(s / day)), phase: "days" };
  }
  if (s > 3600) {
    return { value: String(Math.floor(s / 3600)), phase: "hours" };
  }
  if (s > 60) {
    return { value: String(Math.floor(s / 60)), phase: "minutes" };
  }
  return { value: String(s), phase: "seconds" };
}

function todayFallback(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const ARGYLE_GREEN = 0x007a3d;
export const ARGYLE_GREEN_HEX = "#007a3d";
export const ARGYLE_WHITE = 0xf4f7f2;
