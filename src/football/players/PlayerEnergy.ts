import { clamp, lerp } from "../../core/math";
import { DEFAULT_MATCH_DURATION } from "../constants";

export class PlayerEnergy {
  value = 1;

  constructor(private readonly stamina: number) {}

  /**
   * @param matchDrainScale duration-aware multiplier (shorter matches drain slower)
   */
  update(dt: number, intensity: number, floor = 0.12, matchDrainScale = 1): void {
    const drainScale = lerp(1.25, 0.7, this.stamina / 100) * matchDrainScale;
    const recoverScale = lerp(0.75, 1.2, this.stamina / 100);
    if (intensity > 0.48) {
      // Softened base drain so a 5-minute half lasts; scaled up for longer matches.
      this.value -= dt * intensity * 0.016 * drainScale;
    } else {
      // Recover while walking / idle — near-still players recoup meaningfully faster.
      const rest = Math.max(0, 0.48 - intensity);
      const stillBonus = intensity < 0.08 ? 1.55 : intensity < 0.18 ? 1.25 : 1;
      this.value += dt * rest * 0.028 * recoverScale * stillBonus;
    }
    this.value = clamp(this.value, floor, 1);
  }

  /** Partial refill when the half ends / second half begins. */
  restoreHalfTime(): void {
    const missing = 1 - this.value;
    this.value = clamp(this.value + missing * 0.42 + 0.1, 0.12, 1);
  }

  get fatigueMultiplier(): number {
    return lerp(1.22, 1, this.value);
  }

  get speedMultiplier(): number {
    // Soft gait slowdown when gassed (League-Soccer stamina FSM idea).
    return lerp(0.78, 1, this.value);
  }

  /** Acceleration drops harder than top speed when tired. */
  get accelMultiplier(): number {
    return lerp(0.72, 1, this.value);
  }

  /** Sprint willingness — low energy refuses long sprints. */
  get sprintWillingness(): number {
    return lerp(0.35, 1, this.value);
  }

  get pressMultiplier(): number {
    return lerp(0.78, 1, this.value);
  }

  get percent(): number {
    return Math.round(this.value * 100);
  }

  /** Instant stamina hit (e.g. committing to a slide tackle). */
  spend(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.value = clamp(this.value - amount, 0.08, 1);
  }
}

/** Shorter matches drain less per second; longer matches approach full rate. */
export function staminaMatchDrainScale(matchDurationSeconds: number): number {
  const d = Math.max(120, matchDurationSeconds);
  const relative = d / DEFAULT_MATCH_DURATION;
  return clamp(relative * 0.7, 0.38, 1.55);
}
