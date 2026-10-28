import { FootballState } from "./FootballState";
import { isRestartState } from "./Restarts";

export interface PendingSubstitution {
  side: "home" | "away";
  offId: string;
  onId: string;
}

export interface SubAnnouncement {
  side: "home" | "away";
  offName: string;
  offNumber: number;
  onName: string;
  onNumber: number;
  offPortrait: string | null;
  onPortrait: string | null;
  teamColor: string;
  /** Seconds shown so far. */
  age: number;
}

export const SUB_ANNOUNCE_SECONDS = 5;
export const SUB_ANNOUNCE_FADE_SECONDS = 1;

export function subAnnounceFading(age: number): boolean {
  return age >= SUB_ANNOUNCE_SECONDS - SUB_ANNOUNCE_FADE_SECONDS;
}

export function subAnnounceDone(age: number): boolean {
  return age >= SUB_ANNOUNCE_SECONDS;
}

/**
 * Dead-ball windows where a queued substitution may complete.
 * Goal celebrations are excluded — wait for the kick-off restart so the
 * change (and HUD card) appear when play resumes.
 */
export function isSubstitutionWindow(state: FootballState | string): boolean {
  return (
    isRestartState(state) ||
    state === FootballState.KICK_OFF ||
    state === FootballState.HALF_TIME ||
    state === FootballState.FULL_TIME ||
    state === FootballState.PRE_MATCH
  );
}
