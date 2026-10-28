import { FootballState } from "./FootballState";

/** Display half length in football minutes (always shown as 0–45 regardless of real half length). */
export const DISPLAY_HALF_MINUTES = 45;

export class MatchClock {
  elapsed = 0;
  duration: number;
  running = false;
  period: 1 | 2 = 1;
  /** Base added time per half (~2.5% of half length). */
  readonly baseInjury: number;
  foulInjury1 = 0;
  foulInjury2 = 0;

  constructor(duration: number) {
    this.duration = Math.max(2, duration);
    this.baseInjury = Math.max(1.2, this.halfDuration * 0.025);
  }

  get halfDuration(): number {
    return this.duration / 2;
  }

  get foulInjury(): number {
    return this.period === 1 ? this.foulInjury1 : this.foulInjury2;
  }

  /** Total added time for the current half (real seconds). */
  get injuryAllowance(): number {
    return this.baseInjury + this.foulInjury;
  }

  /**
   * Injury minutes shown on the board (+N), scaled to a 45′ half and rounded up.
   * Real injury seconds map proportionally: e.g. 7.5s of a 300s half → 1.125′ → +2.
   */
  get injuryBoard(): number {
    const scaledMins = (this.injuryAllowance / Math.max(1e-6, this.halfDuration)) * DISPLAY_HALF_MINUTES;
    return Math.max(1, Math.ceil(scaledMins));
  }

  get regulationEnd(): number {
    return this.period === 1 ? this.halfDuration : this.duration;
  }

  get periodDeadline(): number {
    return this.regulationEnd + this.injuryAllowance;
  }

  get regulationElapsed(): boolean {
    return this.elapsed >= this.regulationEnd - 1e-6;
  }

  get inInjuryTime(): boolean {
    return this.regulationElapsed && this.elapsed < this.periodDeadline + 90;
  }

  addFoulTime(seconds = 1.25): void {
    if (this.period === 1) this.foulInjury1 += seconds;
    else this.foulInjury2 += seconds;
  }

  update(dt: number, state: FootballState): void {
    if (!this.running) return;
    if (state === FootballState.PLAYING || state === FootballState.AUTOPLAY) {
      this.elapsed += dt;
      // Allow play through injury time + a grace window for a delayed whistle.
      this.elapsed = Math.min(this.elapsed, this.periodDeadline + 90);
    }
  }

  get remaining(): number {
    return Math.max(0, this.periodDeadline - this.elapsed);
  }

  get halfTimeDue(): boolean {
    return this.period === 1 && this.elapsed >= this.periodDeadline;
  }

  get fullTime(): boolean {
    return this.period === 2 && this.elapsed >= this.periodDeadline;
  }

  startSecondHalf(): void {
    this.period = 2;
    this.elapsed = this.halfDuration;
  }

  /** Map real seconds-in-half onto a 0–45:00 display clock. */
  private displayHalfClock(inHalfSeconds: number): { m: number; s: number } {
    const capped = Math.min(Math.max(0, inHalfSeconds), this.halfDuration);
    const displayTotal = (capped / Math.max(1e-6, this.halfDuration)) * DISPLAY_HALF_MINUTES * 60;
    const m = Math.floor(displayTotal / 60);
    const s = Math.floor(displayTotal % 60);
    return { m, s };
  }

  display(): string {
    const inHalf = this.period === 1 ? this.elapsed : this.elapsed - this.halfDuration;
    const { m, s } = this.displayHalfClock(inHalf);
    const base = `${this.period === 1 ? "1ST" : "2ND"} ${m}:${s.toString().padStart(2, "0")}`;
    if (this.regulationElapsed) return `${base} +${this.injuryBoard}`;
    return base;
  }
}
