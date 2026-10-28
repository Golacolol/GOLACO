import { clamp } from "../core/math";
import { HALF_LENGTH, HALF_WIDTH, PENALTY_SPOT, SIX_YARD_LENGTH, SIX_YARD_WIDTH } from "./constants";
import { defendGoalX, defendingSideAtWorldEnd } from "./pitch/PitchEnds";
import { inPenaltyArea } from "./pitch/PitchZones";
import type { Side } from "./players/Player";

export type RestartType = "THROW_IN" | "CORNER" | "GOAL_KICK" | "FREE_KICK" | "PENALTY";
export type PitchExit = "sideline" | "home-line" | "away-line";

export interface RestartPlan {
  type: RestartType;
  takingSide: Side;
  ballX: number;
  ballZ: number;
}

export const AUTO_RESTART_SECONDS = 1.65;
export const AUTO_RESTART_MAX = 4.85;

/** Six-yard box side for a goal kick (nearer corner to where the ball went out). */
export function goalKickSpot(takingSide: Side, exitZ: number, endsFlipped = false): { x: number; z: number } {
  const side = Math.sign(exitZ || 1);
  const z = side * (SIX_YARD_WIDTH / 2 - 0.55);
  const own = defendGoalX(takingSide, endsFlipped);
  const x = own < 0 ? -HALF_LENGTH + SIX_YARD_LENGTH : HALF_LENGTH - SIX_YARD_LENGTH;
  return { x, z };
}

/** Offside / technical free kicks stay free kicks (never penalties). */
export function planOffsideFreeKick(defendingSide: Side, foulX: number, foulZ: number): RestartPlan {
  return {
    type: "FREE_KICK",
    takingSide: defendingSide,
    ballX: clamp(foulX, -HALF_LENGTH + 2, HALF_LENGTH - 2),
    ballZ: clamp(foulZ, -HALF_WIDTH + 2, HALF_WIDTH - 2),
  };
}

/**
 * Foul restart: direct free kick, or penalty if the foul is inside the
 * offending team's penalty area.
 */
export function planFoulRestart(
  awardingSide: Side,
  foulX: number,
  foulZ: number,
  endsFlipped = false,
): RestartPlan {
  const defendingSide: Side = awardingSide === "home" ? "away" : "home";
  if (inPenaltyArea(foulX, foulZ, defendingSide, endsFlipped)) {
    const goalX = defendGoalX(defendingSide, endsFlipped);
    const spotX = goalX < 0 ? -HALF_LENGTH + PENALTY_SPOT : HALF_LENGTH - PENALTY_SPOT;
    return { type: "PENALTY", takingSide: awardingSide, ballX: spotX, ballZ: 0 };
  }
  return {
    type: "FREE_KICK",
    takingSide: awardingSide,
    ballX: clamp(foulX, -HALF_LENGTH + 2, HALF_LENGTH - 2),
    ballZ: clamp(foulZ, -HALF_WIDTH + 2, HALF_WIDTH - 2),
  };
}

export function isRestartState(state: string): state is RestartType {
  return (
    state === "THROW_IN" ||
    state === "CORNER" ||
    state === "GOAL_KICK" ||
    state === "FREE_KICK" ||
    state === "PENALTY"
  );
}

export function restartDue(elapsed: number, auto: boolean): boolean {
  if (elapsed >= AUTO_RESTART_MAX) return true;
  return auto && elapsed >= AUTO_RESTART_SECONDS;
}

export function planRestart(
  out: PitchExit,
  lastTouch: Side | null,
  ballX: number,
  ballZ: number,
  endsFlipped = false,
): RestartPlan {
  const last = lastTouch ?? "home";
  const zSign = Math.sign(ballZ || 1);
  if (out === "sideline") {
    return {
      type: "THROW_IN",
      takingSide: last === "home" ? "away" : "home",
      ballX: clamp(ballX, -HALF_LENGTH + 2, HALF_LENGTH - 2),
      ballZ: zSign * (HALF_WIDTH - 0.32),
    };
  }
  if (out === "away-line") {
    const defender = defendingSideAtWorldEnd("away", endsFlipped);
    const attacker: Side = defender === "home" ? "away" : "home";
    if (last === attacker) {
      const spot = goalKickSpot(defender, ballZ, endsFlipped);
      return { type: "GOAL_KICK", takingSide: defender, ballX: spot.x, ballZ: spot.z };
    }
    return {
      type: "CORNER",
      takingSide: attacker,
      ballX: HALF_LENGTH - 0.45,
      ballZ: zSign * (HALF_WIDTH - 0.42),
    };
  }
  const defender = defendingSideAtWorldEnd("home", endsFlipped);
  const attacker: Side = defender === "home" ? "away" : "home";
  if (last === attacker) {
    const spot = goalKickSpot(defender, ballZ, endsFlipped);
    return { type: "GOAL_KICK", takingSide: defender, ballX: spot.x, ballZ: spot.z };
  }
  return {
    type: "CORNER",
    takingSide: attacker,
    ballX: -HALF_LENGTH + 0.45,
    ballZ: zSign * (HALF_WIDTH - 0.42),
  };
}

export function restartLabel(type: RestartType): string {
  if (type === "THROW_IN") return "THROW-IN";
  if (type === "CORNER") return "CORNER";
  if (type === "FREE_KICK") return "FREE KICK";
  if (type === "PENALTY") return "PENALTY";
  return "GOAL KICK";
}
