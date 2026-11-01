import { clamp } from "../../core/math";
import { HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_LENGTH, SIX_YARD_LENGTH, SIX_YARD_WIDTH } from "../constants";
import { defendGoalX } from "../pitch/PitchEnds";
import { inPenaltyArea, inSixYardArea } from "../pitch/PitchZones";
import type { Player } from "../players/Player";
import type { Side } from "../players/Player";

export type SetPieceKind = "CORNER" | "GOAL_KICK" | "THROW_IN" | "FREE_KICK" | "PENALTY";

/** Corner / FK delivery script (OpenSWOS-style routines, reimplemented). */
export type SetPieceScript = "near_post" | "far_post" | "short" | "edge" | "wall_charge";

export interface SetPieceContext {
  kind: SetPieceKind;
  takingSide: "home" | "away";
  ballX: number;
  ballZ: number;
  takerId?: string | null;
  endsFlipped?: boolean;
  /** Optional delivery script — shapes attacking runs. */
  script?: SetPieceScript;
  /** After the kick: hold box shape and contest the flight instead of pushing out. */
  phase?: "setup" | "delivery";
  /** Predicted / scripted landing for delivery-phase contests. */
  landing?: { x: number; z: number } | null;
}

/** Pick a corner/FK script from taker vision + situation. */
export function chooseSetPieceScript(
  kind: SetPieceKind,
  ballZ: number,
  vision = 50,
  rng: () => number = Math.random,
): SetPieceScript {
  if (kind === "CORNER") {
    const roll = rng();
    if (roll < 0.22) return "short";
    if (roll < 0.48) return "near_post";
    if (roll < 0.78) return "far_post";
    return "edge";
  }
  if (kind === "FREE_KICK") {
    if (Math.abs(ballZ) > 16) return rng() < 0.45 ? "far_post" : "near_post";
    if (vision > 70 && rng() < 0.35) return "wall_charge";
    return rng() < 0.55 ? "edge" : "near_post";
  }
  return "edge";
}

export type SetPieceRole = "gk" | "cb" | "fb" | "mid" | "wide" | "st";

export function setPieceRole(player: Player): SetPieceRole {
  if (player.isGK || player.slot === "GK") return "gk";
  if (player.slot.includes("ST") || player.position === "ST") return "st";
  if (player.slot.includes("CB") || player.slot === "CB") return "cb";
  if (player.slot === "LB" || player.slot === "RB" || player.slot === "LWB" || player.slot === "RWB") return "fb";
  if (
    player.slot.includes("W") ||
    player.slot === "LM" ||
    player.slot === "RM" ||
    player.slot === "LAM" ||
    player.slot === "RAM"
  ) {
    return "wide";
  }
  return "mid";
}

export function setPieceTarget(player: Player, ctx: SetPieceContext): { x: number; z: number } {
  if (ctx.takerId && player.id === ctx.takerId) return { x: player.x, z: player.z };
  const attacking = player.side === ctx.takingSide;
  if (ctx.kind === "CORNER") return cornerSpot(player, ctx, attacking);
  if (ctx.kind === "FREE_KICK") return freeKickSpot(player, ctx, attacking);
  if (ctx.kind === "PENALTY") return penaltyKickSpot(player, ctx, attacking);
  if (ctx.kind === "GOAL_KICK") return goalKickSpot(player, ctx, attacking);
  return throwInSpot(player, ctx, attacking);
}

export function applySetPieceShape(players: Player[], ctx: SetPieceContext, opts?: { soft?: boolean }): void {
  for (const p of players) {
    const t = setPieceTarget(p, ctx);
    if (ctx.takerId && p.id === ctx.takerId) continue;
    p.desiredX = t.x;
    p.desiredZ = t.z;
    if (opts?.soft) continue;
    p.x = t.x;
    p.z = t.z;
    p.vx = 0;
    p.vz = 0;
  }
}

function cornerSpot(player: Player, ctx: SetPieceContext, attacking: boolean): { x: number; z: number } {
  const inGoalX = Math.sign(ctx.ballX || 1) * HALF_LENGTH;
  const zSign = Math.sign(ctx.ballZ || 1);
  const dir = Math.sign(inGoalX);
  const role = setPieceRole(player);
  const idx = slotIndex(player);
  if (player.isGK) {
    // Central with a light near-post bias — not parked halfway to the corner flag.
    const own = player.ownGoalX() + (player.ownGoalX() < 0 ? 0.7 : -0.7);
    const nearPost = clamp(zSign * 0.85, -1.35, 1.35);
    return { x: own, z: nearPost };
  }
  if (attacking) {
    const script = ctx.script ?? "far_post";
    if (script === "short" && (role === "mid" || role === "wide") && idx % 2 === 0) {
      // Short corner pocket beside the flag.
      return { x: ctx.ballX - dir * 3.2, z: ctx.ballZ - zSign * 3.5 };
    }
    if (role === "st") {
      if (script === "near_post") return { x: inGoalX - dir * 5.2, z: zSign * (2.4 + idx * 0.8) };
      if (script === "far_post") return { x: inGoalX - dir * (7.5 + idx * 3.5), z: -zSign * (4.2 + idx) };
      if (script === "edge") return { x: inGoalX - dir * (11 + idx * 2), z: (idx % 2 === 0 ? 1 : -1) * 6 };
      return { x: inGoalX - dir * (6.5 + idx * 4.5), z: zSign * (idx % 2 === 0 ? 3.2 : -5.5) };
    }
    if (role === "wide") return { x: inGoalX - dir * (9 + (idx % 2) * 5), z: zSign * (idx % 2 === 0 ? -8 : 10) };
    if (role === "mid") return { x: inGoalX - dir * (16 + (idx % 3) * 3), z: (idx % 2 === 0 ? 1 : -1) * (5 + idx) };
    if (role === "cb") return { x: inGoalX - dir * 20, z: idx % 2 === 0 ? 8 : -8 };
    return { x: ctx.ballX - dir * 4, z: ctx.ballZ - zSign * (idx % 2 === 0 ? 2.2 : 14) };
  }
  if (role === "cb") return { x: inGoalX - dir * (4.4 + (idx % 2) * 3.2), z: zSign * (idx % 2 === 0 ? 3.1 : -3.1) };
  if (role === "st") return { x: inGoalX - dir * 11, z: (idx % 2 === 0 ? 1 : -1) * 6 };
  if (role === "wide") return { x: inGoalX - dir * 8.5, z: zSign * (idx % 2 === 0 ? 8.5 : -6) };
  if (role === "mid") return { x: inGoalX - dir * (12 + (idx % 2) * 4), z: (idx % 2 === 0 ? 2 : -4) };
  return { x: inGoalX - dir * 18, z: (idx % 2 === 0 ? 12 : -12) };
}

function freeKickSpot(player: Player, ctx: SetPieceContext, attacking: boolean): { x: number; z: number } {
  const endsFlipped = !!ctx.endsFlipped;
  const defendingSide: Side = ctx.takingSide === "home" ? "away" : "home";
  const defGoal = defendGoalX(defendingSide, endsFlipped);
  const toGoalX = defGoal - ctx.ballX;
  const toGoalZ = 0 - ctx.ballZ;
  const len = Math.hypot(toGoalX, toGoalZ) || 1;
  const ux = toGoalX / len;
  const uz = toGoalZ / len;
  const ballInBox = inPenaltyArea(ctx.ballX, ctx.ballZ, defendingSide, endsFlipped);
  const shooting = !ballInBox && len < 32 && Math.abs(ctx.ballZ) < 22;
  const nearGoal = len < 40;
  const role = setPieceRole(player);
  const idx = slotIndex(player);
  const boxEdge = penaltyBoxEdgeX(defGoal);
  const outsideBoxX = defGoal < 0 ? boxEdge + 2.8 : boxEdge - 2.8;
  const towardAttack = (x: number) => (defGoal < 0 ? Math.max(x, outsideBoxX) : Math.min(x, outsideBoxX));
  const towardDefend = (x: number) => (defGoal < 0 ? Math.min(x, outsideBoxX + 18) : Math.max(x, outsideBoxX - 18));

  // Goalkeepers always hold their own goal (defensive or watching from afar).
  if (player.isGK) {
    const own = player.ownGoalX() + (player.ownGoalX() < 0 ? 0.7 : -0.7);
    const z = attacking ? clamp(ctx.ballZ * 0.05, -2.5, 2.5) : clamp(ctx.ballZ * 0.2, -3.5, 3.5);
    return { x: own, z };
  }

  let x: number;
  let z: number;
  const wallEligible = role === "cb" || role === "mid" || (role === "fb" && idx < 2);

  if (!attacking) {
    // Wall between ball and goal on shooting free kicks.
    if (shooting && wallEligible && idx < 4) {
      const wall = 9.25;
      const spread = (idx - 1.5) * 1.05;
      x = ctx.ballX + ux * wall - uz * spread;
      z = clamp(ctx.ballZ + uz * wall + ux * spread, -HALF_WIDTH + 2, HALF_WIDTH - 2);
    } else if (role === "cb" || role === "fb") {
      // Offside line: edge of the box when the kick threatens, else compact near the ball.
      if (nearGoal || shooting) {
        x = outsideBoxX + (defGoal < 0 ? 0.9 : -0.9);
        z =
          role === "fb"
            ? Math.sign(player.anchorZ || (idx % 2 === 0 ? 1 : -1)) * (13.5 + idx)
            : (idx % 2 === 0 ? 1 : -1) * (3.5 + idx * 3.2);
      } else {
        x = towardAttack(ctx.ballX + ux * (11 + (role === "fb" ? 1.5 : 0)));
        z =
          role === "fb"
            ? Math.sign(player.anchorZ || (idx % 2 === 0 ? 1 : -1)) * (14 + idx)
            : clamp(ctx.ballZ + (idx % 2 === 0 ? 6 : -6), -HALF_WIDTH + 3, HALF_WIDTH - 3);
      }
    } else if (role === "st") {
      // Hold a counter line near halfway relative to the kick — don't abandon the play.
      x = towardDefend(ctx.ballX - ux * 16);
      z = (idx % 2 === 0 ? 1 : -1) * (7 + idx);
    } else {
      x = towardAttack(ctx.ballX + ux * (13 + idx));
      z = clamp(ctx.ballZ + (idx % 2 === 0 ? 8 : -8), -HALF_WIDTH + 3, HALF_WIDTH - 3);
    }
  } else {
    // Attackers stay near the kick for short options; only stretch toward the box when close.
    if (role === "st") {
      const run = nearGoal ? Math.min(12, Math.max(6, len - 14)) : 8 + idx * 1.5;
      x = towardAttack(ctx.ballX + ux * run);
      z = (idx % 2 === 0 ? 1 : -1) * (4.5 + idx * 2.2);
    } else if (role === "wide") {
      x = towardAttack(ctx.ballX + ux * (nearGoal ? 7 : 5 + idx));
      z = Math.sign(player.anchorZ || (idx % 2 === 0 ? 1 : -1)) * (14 + idx);
    } else if (role === "mid") {
      if (idx % 3 === 0) {
        x = ctx.ballX - ux * (3.5 + idx * 0.5);
        z = ctx.ballZ + (idx % 2 === 0 ? 7.5 : -7.5);
      } else {
        x = towardAttack(ctx.ballX + ux * (4.5 + idx));
        z = ctx.ballZ + (idx % 2 === 0 ? 6.5 : -6.5);
      }
    } else {
      x = ctx.ballX - ux * (9 + idx * 2);
      z = ctx.ballZ + (idx % 2 === 0 ? 11 : -11);
    }
  }

  // Hard rules: nobody in the six-yard box; attackers / non-wall defenders outside the 18.
  const allowBox = !attacking && shooting && wallEligible && idx < 4;
  const spot = enforceBoxClearance({ x, z }, defendingSide, endsFlipped, attacking, allowBox || !attacking);
  return {
    x: clamp(spot.x, -HALF_LENGTH + 1.5, HALF_LENGTH - 1.5),
    z: clamp(spot.z, -HALF_WIDTH + 2, HALF_WIDTH - 2),
  };
}

/** Penalty: only the taker and defending GK inside the box; everyone else on the arc / edge. */
function penaltyKickSpot(player: Player, ctx: SetPieceContext, attacking: boolean): { x: number; z: number } {
  const endsFlipped = !!ctx.endsFlipped;
  const defendingSide: Side = ctx.takingSide === "home" ? "away" : "home";
  const defGoal = defendGoalX(defendingSide, endsFlipped);
  const boxEdge = penaltyBoxEdgeX(defGoal);
  const outsideBoxX = defGoal < 0 ? boxEdge + 2.5 : boxEdge - 2.5;
  const role = setPieceRole(player);
  const idx = slotIndex(player);

  if (player.isGK) {
    if (!attacking) {
      return { x: defGoal + (defGoal < 0 ? 0.55 : -0.55), z: 0 };
    }
    const own = player.ownGoalX() + (player.ownGoalX() < 0 ? 0.7 : -0.7);
    return { x: own, z: 0 };
  }

  // Shared edge-of-box line so both teams hold shape for the rebound.
  let x = outsideBoxX + (defGoal < 0 ? 0.6 : -0.6);
  let z: number;
  if (attacking) {
    if (role === "st") z = (idx % 2 === 0 ? 1 : -1) * (5.5 + idx * 2.2);
    else if (role === "wide") z = Math.sign(player.anchorZ || (idx % 2 === 0 ? 1 : -1)) * (12 + idx);
    else if (role === "mid") {
      x = outsideBoxX + (defGoal < 0 ? 3.5 + idx : -(3.5 + idx));
      z = (idx % 2 === 0 ? 8 : -8);
    } else {
      x = outsideBoxX + (defGoal < 0 ? 6 + idx : -(6 + idx));
      z = (idx % 2 === 0 ? 14 : -14);
    }
  } else if (role === "cb") {
    z = (idx % 2 === 0 ? 1 : -1) * (4 + idx * 3);
  } else if (role === "fb") {
    z = Math.sign(player.anchorZ || (idx % 2 === 0 ? 1 : -1)) * (13 + idx);
  } else {
    x = outsideBoxX + (defGoal < 0 ? 4 + idx : -(4 + idx));
    z = (idx % 2 === 0 ? 10 : -10);
  }

  const cleared = enforceOutsidePenalty({ x, z }, defendingSide, endsFlipped);
  return {
    x: clamp(cleared.x, -HALF_LENGTH + 1.5, HALF_LENGTH - 1.5),
    z: clamp(cleared.z, -HALF_WIDTH + 2, HALF_WIDTH - 2),
  };
}

function penaltyBoxEdgeX(defGoal: number): number {
  return defGoal < 0 ? -HALF_LENGTH + PENALTY_AREA_LENGTH : HALF_LENGTH - PENALTY_AREA_LENGTH;
}

/** Push a spot out of the six-yard box; attackers also leave the penalty area. */
function enforceBoxClearance(
  spot: { x: number; z: number },
  defendingSide: Side,
  endsFlipped: boolean,
  attacking: boolean,
  allowPenaltyArea: boolean,
): { x: number; z: number } {
  let { x, z } = spot;
  if (inSixYardArea(x, z, defendingSide, endsFlipped)) {
    const defGoal = defendGoalX(defendingSide, endsFlipped);
    const sixEdge = defGoal < 0 ? -HALF_LENGTH + SIX_YARD_LENGTH + 1.5 : HALF_LENGTH - SIX_YARD_LENGTH - 1.5;
    x = sixEdge;
    if (Math.abs(z) < SIX_YARD_WIDTH / 2 - 0.5) {
      z = Math.sign(z || 1) * (SIX_YARD_WIDTH / 2 + 1.2);
    }
  }
  if (attacking || !allowPenaltyArea) {
    if (inPenaltyArea(x, z, defendingSide, endsFlipped)) {
      return enforceOutsidePenalty({ x, z }, defendingSide, endsFlipped);
    }
  }
  return { x, z };
}

function enforceOutsidePenalty(
  spot: { x: number; z: number },
  defendingSide: Side,
  endsFlipped: boolean,
): { x: number; z: number } {
  let { x, z } = spot;
  if (!inPenaltyArea(x, z, defendingSide, endsFlipped)) return spot;
  const defGoal = defendGoalX(defendingSide, endsFlipped);
  const boxEdge = penaltyBoxEdgeX(defGoal);
  x = defGoal < 0 ? boxEdge + 2.5 : boxEdge - 2.5;
  if (Math.abs(z) > 18) z = Math.sign(z) * 16;
  return { x, z };
}

function goalKickSpot(player: Player, ctx: SetPieceContext, attacking: boolean): { x: number; z: number } {
  const dir = ctx.takingSide === "home" ? (ctx.endsFlipped ? -1 : 1) : (ctx.endsFlipped ? 1 : -1);
  const role = setPieceRole(player);
  const idx = slotIndex(player);
  // Taking GK stands on the ball; opposition GK stays in their own goal.
  if (player.isGK) {
    if (attacking) {
      return {
        x: ctx.ballX - player.attackSign * 0.85,
        z: ctx.ballZ,
      };
    }
    const own = player.ownGoalX() + (player.ownGoalX() < 0 ? 0.7 : -0.7);
    return { x: own, z: clamp(ctx.ballZ * 0.08, -3, 3) };
  }
  // Taking CB line — opposition must stay midfield-side of this and outside the box.
  const lastDefX = ctx.ballX + dir * 12;
  const takingOwn = ctx.takingSide === "home"
    ? (ctx.endsFlipped ? HALF_LENGTH : -HALF_LENGTH)
    : (ctx.endsFlipped ? -HALF_LENGTH : HALF_LENGTH);
  const boxEdge = takingOwn < 0 ? -HALF_LENGTH + PENALTY_AREA_LENGTH : HALF_LENGTH - PENALTY_AREA_LENGTH;
  // Just outside the 18, midfield-side of the box edge.
  const outsideBoxX = boxEdge + dir * 2.2;

  if (attacking) {
    if (role === "st") return { x: dir * 8, z: (idx % 2 === 0 ? 6 : -6) };
    if (role === "wide") return { x: dir * 4, z: Math.sign(player.anchorZ || (idx % 2 === 0 ? 1 : -1)) * 22 };
    if (role === "mid") return { x: dir * -6, z: (idx % 2 === 0 ? 10 : -10) };
    if (role === "cb") return { x: lastDefX, z: idx % 2 === 0 ? 8 : -8 };
    return { x: ctx.ballX + dir * 18, z: Math.sign(player.anchorZ || 1) * 20 };
  }

  // Opposition: outside the penalty area and not deeper than the taking team's last defenders.
  const clampOppX = (desired: number): number => {
    // Midfield-side of both the box edge and the last-defender line.
    if (dir > 0) return Math.max(desired, outsideBoxX, lastDefX + 1.5);
    return Math.min(desired, outsideBoxX, lastDefX - 1.5);
  };

  let x: number;
  let z: number;
  // Hold toward halfway — never camp on the edge of the six waiting to rush the GK.
  if (role === "st") {
    x = clampOppX(dir * 10);
    z = idx % 2 === 0 ? 6 : -6;
  } else if (role === "cb") {
    x = clampOppX(dir * 4);
    z = idx % 2 === 0 ? 9 : -9;
  } else if (role === "wide" || role === "fb") {
    x = clampOppX(dir * 6);
    z = clamp(player.anchorZ || (idx % 2 === 0 ? 18 : -18), -22, 22);
  } else {
    x = clampOppX(dir * 2);
    z = clamp(player.anchorZ, -18, 18);
  }

  // Hard safety: never leave an opponent inside the taking team's box.
  if (inPenaltyArea(x, z, ctx.takingSide, !!ctx.endsFlipped)) {
    x = outsideBoxX + dir * 0.5;
  }
  return { x, z };
}

function throwInSpot(player: Player, ctx: SetPieceContext, attacking: boolean): { x: number; z: number } {
  const zSign = Math.sign(ctx.ballZ || 1);
  const attackDir = player.attackSign;
  const role = setPieceRole(player);
  const idx = slotIndex(player);
  if (player.isGK) {
    const own = player.ownGoalX() + (player.ownGoalX() < 0 ? 0.8 : -0.8);
    return { x: own, z: clamp(ctx.ballZ * 0.08, -3, 3) };
  }
  const ax = player.anchorX;
  const az = player.anchorZ;
  const compact = attacking ? 0.2 : 0.1;
  const push = attacking ? 2.4 : 1.2;
  let x = ax + attackDir * push + (ctx.ballX - ax) * compact;
  let z = az + (ctx.ballZ - az) * (attacking ? 0.16 : 0.08);
  const nearThrow = Math.hypot(ax - ctx.ballX, az - ctx.ballZ) < 26;
  if (attacking && nearThrow && (role === "mid" || role === "wide" || role === "fb") && idx < 2) {
    x = ctx.ballX + attackDir * (3.5 + idx * 2.4);
    z = clamp(ctx.ballZ - zSign * (5 + idx * 2.2), -HALF_WIDTH + 2.5, HALF_WIDTH - 2.5);
  } else if (!attacking && nearThrow && (role === "wide" || role === "fb") && idx === 0) {
    x = ctx.ballX - attackDir * 3.2;
    z = clamp(ctx.ballZ - zSign * 5.5, -HALF_WIDTH + 2.5, HALF_WIDTH - 2.5);
  }
  return {
    x: clamp(x, -HALF_LENGTH + 2, HALF_LENGTH - 2),
    z: clamp(z, -HALF_WIDTH + 2, HALF_WIDTH - 2),
  };
}

function slotIndex(player: Player): number {
  let n = 0;
  for (let i = 0; i < player.slot.length; i++) n += player.slot.charCodeAt(i);
  return n % 4;
}
