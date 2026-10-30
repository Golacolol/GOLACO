import type { TableBallState } from "./TableBall";
import type { TableRodState } from "./TableRod";
import type { TableSideIntent } from "./TableInput";
import type { TableDims } from "./TableLayouts";

export type TableAIDifficulty = "EASY" | "NORMAL" | "HARD" | "EXPERT";

export interface TableAIProfile {
  id: TableAIDifficulty;
  reactionSeconds: number;
  slideGain: number;
  spinAggression: number;
  multiRodChance: number;
  aimError: number;
  maxSpinHold: number;
}

export const TABLE_AI_PROFILES: Record<TableAIDifficulty, TableAIProfile> = {
  EASY: {
    id: "EASY",
    reactionSeconds: 0.45,
    slideGain: 0.55,
    spinAggression: 0.35,
    multiRodChance: 0.1,
    aimError: 0.35,
    maxSpinHold: 0.55,
  },
  NORMAL: {
    id: "NORMAL",
    reactionSeconds: 0.28,
    slideGain: 0.85,
    spinAggression: 0.55,
    multiRodChance: 0.28,
    aimError: 0.18,
    maxSpinHold: 0.85,
  },
  HARD: {
    id: "HARD",
    reactionSeconds: 0.14,
    slideGain: 1.15,
    spinAggression: 0.78,
    multiRodChance: 0.45,
    aimError: 0.08,
    maxSpinHold: 1.2,
  },
  EXPERT: {
    id: "EXPERT",
    reactionSeconds: 0.06,
    slideGain: 1.45,
    spinAggression: 0.95,
    multiRodChance: 0.7,
    aimError: 0.03,
    maxSpinHold: 1.6,
  },
};

export class TableAI {
  profile: TableAIProfile;
  private thinkT = 0;
  private targetRod = 1;
  private spinHold = 0;
  private kicking = false;

  constructor(difficulty: TableAIDifficulty = "NORMAL") {
    this.profile = TABLE_AI_PROFILES[difficulty];
  }

  setDifficulty(d: TableAIDifficulty): void {
    this.profile = TABLE_AI_PROFILES[d];
  }

  /**
   * Fill away-side intent to track ball and kick when lined up.
   */
  tick(
    dt: number,
    ball: TableBallState,
    awayRods: TableRodState[],
    dims: TableDims,
    intent: TableSideIntent,
  ): void {
    const p = this.profile;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = p.reactionSeconds * (0.7 + Math.random() * 0.6);
      // Pick rod closest to ball in X
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < awayRods.length; i++) {
        const d = Math.abs(awayRods[i].spec.x - ball.x);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      this.targetRod = best;
      if (Math.random() < p.multiRodChance && awayRods.length > 1) {
        const secondary = Math.max(0, Math.min(awayRods.length - 1, best + (Math.random() < 0.5 ? -1 : 1)));
        intent.selected = [best, secondary];
      } else {
        intent.selected = [best];
      }
    }

    if (!intent.selected.length) intent.selected = [this.targetRod];

    const rod = awayRods[this.targetRod] ?? awayRods[0];
    if (!rod) return;

    const err = (ball.z - rod.slide * rod.maxSlide) / Math.max(0.2, dims.width / 2);
    const noise = (Math.random() - 0.5) * p.aimError;
    intent.slide = Math.max(-1, Math.min(1, (err + noise) * p.slideGain));

    const lined =
      Math.abs(ball.z - rod.slide * rod.maxSlide) < dims.manRadius * 2.8 + p.aimError * 0.8 &&
      Math.abs(ball.x - rod.spec.x) < 0.55 + Math.abs(ball.vx) * 0.08;

    const ballComing = ball.vx * Math.sign(rod.spec.x) > -0.5 || Math.abs(ball.x) > Math.abs(rod.spec.x) - 0.8;

    // Strike on press; rare long holds for spin.
    if (lined && ballComing && Math.random() < p.spinAggression * 0.12 + 0.04) {
      this.kicking = true;
      this.spinHold = 0;
    }

    if (this.kicking) {
      this.spinHold += dt;
      const wantSpin = Math.random() < p.spinAggression * 0.18;
      const releaseAt = wantSpin ? p.maxSpinHold * (0.4 + Math.random() * 0.4) : 0.05;
      intent.kickPressed = this.spinHold <= dt + 1e-6; // rising edge → strike
      intent.kickHeld = true;
      intent.kickHoldSeconds = this.spinHold;
      intent.kickReleased = false;
      if (this.spinHold >= releaseAt) {
        intent.kickReleased = true;
        intent.kickHeld = false;
        intent.kickPressed = false;
        this.kicking = false;
        this.spinHold = 0;
      }
    } else {
      intent.kickHeld = false;
      intent.kickHoldSeconds = 0;
      intent.kickReleased = false;
      intent.kickPressed = false;
    }
  }
}
