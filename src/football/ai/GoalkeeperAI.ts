import { clamp } from "../../core/math";
import { GOAL_WIDTH, HALF_LENGTH, HALF_WIDTH } from "../constants";
import { inPenaltyArea, inSixYardArea } from "../pitch/PitchZones";
import type { Ball } from "../ball/Ball";
import { preferKeeperPunch } from "../ball/AerialContest";
import { passFlightTime, passKickVector, solvePassGroundSpeed } from "../ball/PassModel";
import type { Player } from "../players/Player";
import { movePlayer } from "../players/PlayerMovement";
import { DIVE_DURATION_CLAIM, DIVE_DURATION_FULL, startDive } from "../players/PoseMotion";
import { passingLaneQuality } from "./PassingAI";
import { TOUCHLINE_SAFE_MARGIN, clampInboundZ } from "../ThrowIn";

export interface KeeperTarget {
  x: number;
  z: number;
  rush: boolean;
}

/** Prefer full-backs / wing-backs as primary restart outlets. */
export function isFullBackOutlet(player: Player): boolean {
  const s = player.slot;
  return s === "LB" || s === "RB" || s === "LWB" || s === "RWB";
}

export interface KeeperTargetOpts {
  /** Penalty / spot-kick: stay on the line until the ball is struck. */
  holdLine?: boolean;
  /** Free-kick wall phase: keep angle, never rush the planted ball. */
  setPieceHold?: boolean;
  /** Opponents within ~4m of the ball (crowded cross). */
  traffic?: number;
  /** Shot is live toward goal — dive / claim with more urgency. */
  incomingShot?: boolean;
  /** Lateral dive stretch multiplier (GameplayTuning). */
  diveReachMul?: number;
  /** Higher → more held catches vs parries (GameplayTuning). */
  holdBiasMul?: number;
}

/** Dive stretch in metres from diving / reflexes (SWOS-style reach table). */
export function keeperDiveReach(diving: number, reflexes: number, diveReachMul = 1): number {
  // Elite keepers stretch further — cubic-ish bonus so 80+ gloves pull clear of average.
  const elite = Math.max(0, (diving + reflexes) * 0.5 - 0.58);
  const base = diving * 1.9 + reflexes * 1.05 + diving * reflexes * 0.6 + elite * elite * 2.6;
  return base * clamp(diveReachMul, 0.7, 1.55);
}

/**
 * Catch vs parry decision table.
 * Soft / close / six-yard → hold; hot drives, high balls, stretched dives → parry.
 */
export function keeperSaveKind(
  speed: number,
  handling: number,
  inSix: boolean,
  dist: number,
  extras?: {
    reflexes?: number;
    diving?: number;
    ballY?: number;
    holdBiasMul?: number;
    diveReachMul?: number;
  },
): "hold" | "parry" {
  const reflexes = extras?.reflexes ?? handling;
  const diving = extras?.diving ?? handling;
  const ballY = extras?.ballY ?? 0.4;
  const holdBias = clamp(extras?.holdBiasMul ?? 1, 0.65, 1.4);
  const diveReach = keeperDiveReach(diving, reflexes, extras?.diveReachMul ?? 1);

  // Speed ceilings — above these the gloves can't smother cleanly.
  // High reflexes push the hold window up so top keepers gather more firmly.
  const parryHot = (17.6 - reflexes * 3.4) / holdBias;
  const parryFirm = (13.8 - reflexes * 2.4) / holdBias;
  if (speed >= parryHot) return "parry";
  if (speed >= parryFirm && !inSix) return "parry";
  // High balls need diving reach; short keepers punch more.
  if (ballY > 2.15 && speed > 8.5 && diving < 0.7 / holdBias) return "parry";
  if (ballY > 2.45 && dist > 0.85 + diveReach * 0.25) return "parry";

  const holdDist = (inSix ? 1.95 + diving * 0.55 : 1.6 + diving * 0.62) * (0.92 + holdBias * 0.08);
  // holdBiasMul still decides tip-vs-claim on mid-pace shots; reflexes expand the firm window.
  const holdSpeedSix = (7.5 + handling * 5.0 + reflexes * 2.15) * holdBias;
  const holdSpeedBox = (9.0 + handling * 4.2 + reflexes * 2.35) * holdBias;
  if (inSix && speed < holdSpeedSix && dist < holdDist) return "hold";
  if (!inSix && speed < holdSpeedBox && dist < holdDist) return "hold";
  // Stretched dive at the limit of reach → tip over the bar / wide rather than claim.
  if (dist > holdDist * 0.92 && speed > 7.5) return "parry";
  return "parry";
}

/**
 * Stand on the angle bisector of the posts at a depth off the goal line.
 * Stepping out (depth) is what actually cuts the shooting angle; on the line alone
 * the geometric bisector stays near centre even for wide balls.
 */
export function keeperAngleStand(
  ballX: number,
  ballZ: number,
  goalX: number,
  attackSign: number,
  depth: number,
): { x: number; z: number } {
  const half = GOAL_WIDTH / 2;
  const standX = goalX + attackSign * clamp(depth, 0.35, 9);
  const dPostX = goalX - ballX;
  const vLz = -half - ballZ;
  const vRz = half - ballZ;
  const lenL = Math.hypot(dPostX, vLz) || 1;
  const lenR = Math.hypot(dPostX, vRz) || 1;
  const bx = dPostX / lenL + dPostX / lenR;
  const bz = vLz / lenL + vRz / lenR;
  let z: number;
  if (Math.abs(bx) < 1e-5) {
    z = clamp(ballZ * 0.22, -half + 0.35, half - 0.35);
  } else {
    const t = (standX - ballX) / bx;
    z = ballZ + t * bz;
  }
  return { x: standX, z: clamp(z, -half - 0.75, half + 0.75) };
}

export function goalkeeperTarget(gk: Player, ball: Ball, reactionMul = 1, opts?: KeeperTargetOpts): KeeperTarget {
  const endsFlipped = gk.attackSign !== (gk.side === "home" ? 1 : -1);
  const goalX = gk.ownGoalX() + (gk.ownGoalX() < 0 ? 0.55 : -0.55);
  const boxEdge = gk.ownGoalX() < 0 ? -HALF_LENGTH + 16.2 : HALF_LENGTH - 16.2;
  const clampBoxX = (x: number) => (goalX < boxEdge ? clamp(x, goalX, boxEdge) : clamp(x, boxEdge, goalX));
  const positioning = (gk.attrs.gkPositioning ?? gk.attrs.composure) / 100;
  const reflexes = (gk.attrs.gkReflexes ?? gk.attrs.composure) / 100;
  const speed = Math.hypot(ball.vx, ball.vz);
  // Read the flight a beat ahead so the stand tracks the ball, not where it was.
  const lookAhead = clamp((0.16 + positioning * 0.14 + reflexes * 0.08) * reactionMul, 0.12, 0.42);
  const readX = ball.x + ball.vx * lookAhead;
  const readZ = ball.z + ball.vz * lookAhead;
  const ballDepth = (readX - goalX) * gk.attackSign; // metres out from goal toward midfield
  // Closer / central threats → step further off the line to shrink the shooting angle.
  let coverDepth =
    1.05 +
    clamp((52 - ballDepth) / 52, 0, 1) * (3.5 + positioning * 2.1) +
    clamp((18 - Math.abs(readZ)) / 18, 0, 1) * 0.55;
  coverDepth *= 0.88 + positioning * 0.42;
  const angle = keeperAngleStand(readX, readZ, goalX, gk.attackSign, coverDepth);
  const lineTrack = angle.z;
  const towardGoal = Math.sign(ball.vx || 0) === -gk.attackSign || Math.sign(ball.x - goalX) === gk.attackSign;
  const shotComing = speed > 11 && Math.sign(ball.vx) === -gk.attackSign;
  const inBox = inPenaltyArea(ball.x, ball.z, gk.side, endsFlipped);
  const inSix = inSixYardArea(ball.x, ball.z, gk.side, endsFlipped);
  const loose = !ball.ownerId;
  const opponentBall = !!ball.ownerId && ball.lastTouchSide !== gk.side;
  const teammateTouch = !!ball.lastTouchId && ball.lastTouchSide === gk.side && ball.lastTouchId !== gk.id;
  const distBall = gk.distTo(ball.x, ball.z);

  // Penalty / spot: plant on the line. Only shuffle laterally once the shot is live.
  if (opts?.holdLine) {
    const look = shotComing
      ? clamp((0.12 + speed * 0.004 + reflexes * 0.12) * reactionMul, 0.12, 0.42)
      : 0;
    const diveLead = shotComing ? reflexes * 0.35 : 0;
    return {
      x: goalX + gk.attackSign * 0.55,
      z: clamp(ball.z + ball.vz * (look + diveLead), -GOAL_WIDTH / 2 + 0.15, GOAL_WIDTH / 2 - 0.15),
      rush: false,
    };
  }

  // Free-kick hold: keep the angle, never charge a stationary planted ball.
  if (opts?.setPieceHold && (!loose || speed < 4.5)) {
    const hold = keeperAngleStand(ball.x, ball.z, goalX, gk.attackSign, 1.05 + positioning * 0.35);
    return { x: hold.x, z: hold.z, rush: false };
  }

  // Shot: stay near the line and track the flight path laterally — still cut a little depth.
  const shotThreat = shotComing || (!!opts?.incomingShot && speed > 7 && Math.sign(ball.vx) === -gk.attackSign);
  if (shotThreat && !inSix) {
    const look = clamp((0.16 + speed * 0.006 + reflexes * 0.1) * reactionMul, 0.14, 0.48);
    const hold = keeperAngleStand(
      ball.x + ball.vx * look,
      ball.z + ball.vz * look,
      goalX,
      gk.attackSign,
      1.35 + positioning * 0.45,
    );
    return {
      x: hold.x,
      z: clamp(hold.z, -GOAL_WIDTH / 2 - 0.35, GOAL_WIDTH / 2 + 0.35),
      rush: false,
    };
  }

  // 1v1 / through-ball: close the angle by stepping off the line toward the ball,
  // but stay inside the penalty area unless the striker is clear from a long way out.
  // Wide/byline balls must not drag the keeper to the corner flag.
  const throughThreat =
    (opponentBall || (loose && ball.lastTouchSide !== gk.side && towardGoal)) &&
    ballDepth > 2.5 &&
    ballDepth < 44 &&
    Math.abs(readZ) < 24 &&
    distBall < 42;
  if (throughThreat) {
    const clearRun = ballDepth > 22 && speed > 4.5 && Math.abs(readZ) < 10;
    const wideByline = Math.abs(readZ) > 10;
    const closeMix = inBox ? (wideByline ? 0.62 : 0.78) : clearRun ? 0.58 : 0.48;
    let x = readX * closeMix + goalX * (1 - closeMix);
    // Never leave the box unless a clear long through-ball forces it.
    if (!clearRun || ballDepth < 28) x = clampBoxX(x);
    else {
      const softEdge = goalX < 0 ? boxEdge + 3.5 : boxEdge - 3.5;
      x = goalX < boxEdge ? clamp(x, goalX, softEdge) : clamp(x, softEdge, goalX);
    }
    // Wide/byline threats: step further out to shrink the near-post window.
    const rushDepth = clamp((x - goalX) * gk.attackSign + (wideByline ? 1.4 : 0), 1.4, 9.5);
    const cover = keeperAngleStand(readX, readZ, goalX, gk.attackSign, rushDepth);
    const wide = Math.abs(readZ) > 8;
    const zMix = wide ? 0.48 : 0.58;
    return {
      x,
      z: clamp(readZ * zMix + cover.z * (1 - zMix), -GOAL_WIDTH / 2 - (wide ? 2.4 : 1.4), GOAL_WIDTH / 2 + (wide ? 2.4 : 1.4)),
      rush: inBox && (speed > 5 || ballDepth < 16 || loose) && Math.abs(readZ) < 14,
    };
  }

  // Loose / contested ball in the box: claim it — come off the line hard.
  if (inSix || (inBox && (loose || opponentBall) && !teammateTouch)) {
    const commit = inSix || loose || opponentBall || speed > 4.5;
    const wide = Math.abs(ball.z) > 9;
    const mix = commit ? (inSix ? 0.95 : loose ? 0.88 : wide ? 0.58 : 0.8) : 0.58;
    const x = (loose ? ball.x : readX) * mix + goalX * (1 - mix);
    const coverDepth = clamp((x - goalX) * gk.attackSign + (wide ? 1.8 : 0), 1.2, 9);
    const cover = keeperAngleStand(ball.x, ball.z, goalX, gk.attackSign, coverDepth);
    const ballZMix = wide ? (commit ? 0.55 : 0.38) : commit ? 0.72 : 0.42;
    const z = ball.z * ballZMix + cover.z * (1 - ballZMix);
    return {
      x: clampBoxX(x),
      z: clamp(z, -GOAL_WIDTH / 2 - (wide ? 2.6 : 2.8), GOAL_WIDTH / 2 + (wide ? 2.6 : 2.8)),
      rush: commit && Math.abs(ball.z) < 16,
    };
  }

  // Soft claim: bobbling teammate touch inside the six / slow loose in the box.
  if (inBox && loose && (inSix || speed < 7.5)) {
    const mix = inSix ? 0.9 : 0.7;
    return {
      x: clampBoxX(ball.x * mix + goalX * (1 - mix)),
      z: clamp(ball.z * 0.65 + lineTrack * 0.35, -GOAL_WIDTH / 2 - 1.5, GOAL_WIDTH / 2 + 1.5),
      rush: true,
    };
  }

  if (inBox) {
    const wide = Math.abs(readZ) > 8;
    // Cut the angle off the line — do not park on the posts for wide box carriers.
    const soft = keeperAngleStand(readX, readZ, goalX, gk.attackSign, (wide ? 4.2 : 3.1) + positioning * 1.3);
    return {
      x: clampBoxX(readX * (wide ? 0.22 : 0.35) + soft.x * (wide ? 0.78 : 0.65)),
      z: clamp(soft.z, -GOAL_WIDTH / 2 - (wide ? 2.2 : 0.35), GOAL_WIDTH / 2 + (wide ? 2.2 : 0.35)),
      rush: opponentBall && distBall < 14,
    };
  }

  // Open play: central when the ball is distant; cut the angle as it approaches.
  return { x: angle.x, z: lineTrack, rush: false };
}

export const KEEPER_DISTRIBUTE_MIN = 0.72;
export const KEEPER_DISTRIBUTE_MAX = 5;
const OUTLET_MIN_DIST = 10;
const OUTLET_MAX_DIST = 46;

export type KeeperDistAction =
  | { action: "wait" }
  | { action: "pass"; target: Player; delivery: "throw" | "roll" | "kick" }
  | { action: "punt"; x: number; z: number; targetId?: string };

/** How the keeper should release a claimed ball to an outlet. */
export function keeperPassDelivery(dist: number, pressure: number): "throw" | "roll" | "kick" {
  if (dist < 14 && pressure < 0.42) return "roll";
  if (dist < 26 && pressure < 0.62) return "throw";
  return "kick";
}

export function isDefensiveOutlet(player: Player): boolean {
  if (player.isGK) return false;
  const s = player.slot;
  if (s.includes("CB") || s === "LB" || s === "RB" || s === "LWB" || s === "RWB") return true;
  if (s === "LW" || s === "RW") return true;
  // Holding mids are valid short outlets when the back line is closed.
  if (s.includes("DM") || (s.includes("CM") && !s.includes("CAM") && !s.includes("AM"))) return true;
  return false;
}

export function keeperRestartReady(teammates: Player[], gk: Player): boolean {
  const outfield = teammates.filter((p) => p.id !== gk.id && !p.isGK);
  if (!outfield.length) return true;
  const defs = outfield.filter(isDefensiveOutlet);
  const pool = defs.length >= 2 ? defs : outfield;
  let near = 0;
  for (const p of pool) {
    if (Math.hypot(p.x - p.anchorX, p.z - p.anchorZ) <= 5.5) near += 1;
  }
  const need = Math.min(pool.length, Math.max(1, Math.ceil(pool.length * 0.55)));
  return near >= need;
}

function crowding(player: Player, teammates: Player[]): number {
  let n = 0;
  for (const mate of teammates) {
    if (mate.id === player.id || mate.isGK) continue;
    if (player.distTo(mate.x, mate.z) < 7) n += 1;
  }
  return n;
}

export function chooseKeeperOutlet(gk: Player, teammates: Player[], opponents: Player[], skipIds: string[] = []): Player | null {
  const fwd = gk.attackSign;
  const skip = new Set(skipIds);
  const scoreOutlet = (mate: Player, soft: boolean): number | null => {
    const dx = mate.x - gk.x;
    const dz = mate.z - gk.z;
    const dist = Math.hypot(dx, dz);
    if (dist < OUTLET_MIN_DIST || dist > OUTLET_MAX_DIST) return null;
    const forward = dx * fwd;
    // Allow slightly deeper square outlets to full-backs; never recycle into the six.
    if (forward < (isFullBackOutlet(mate) ? 3.5 : soft ? 4 : 6)) return null;
    const lane = passingLaneQuality(gk, mate.x, mate.z, opponents);
    if (lane < (soft ? 0.16 : 0.28)) return null;
    let marked = 12;
    for (const op of opponents) {
      if (op.isGK) continue;
      marked = Math.min(marked, mate.distTo(op.x, op.z));
    }
    if (marked < (soft ? 2.05 : 2.8)) return null;
    const crowd = crowding(mate, teammates);
    if (!soft && crowd >= 2 && !isFullBackOutlet(mate)) return null;
    if (crowd >= 3) return null;
    // Prefer FBs, but not when they hug the touchline — those releases go out constantly.
    const tooWide = Math.abs(mate.z) > HALF_WIDTH - TOUCHLINE_SAFE_MARGIN - 1;
    const role =
      isFullBackOutlet(mate) ? (tooWide ? 0.18 : 0.7)
      : mate.slot.includes("CB") ? 0.28
      : mate.slot.includes("DM") || mate.slot.includes("CM") ? 0.22
      : 0.12;
    const wideLane = Math.abs(mate.z) > 10 && Math.abs(mate.z) < HALF_WIDTH - 10 ? 0.18 : -0.12;
    const touchlineRisk = Math.max(0, Math.abs(mate.z) - (HALF_WIDTH - 8)) * 0.45;
    return marked * 0.62 + lane * 1.15 + role + wideLane - crowd * 0.55 + clamp(dist / 28, 0, 1) * 0.12 - touchlineRisk;
  };

  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const mate of teammates) {
    if (mate.id === gk.id || !isDefensiveOutlet(mate) || skip.has(mate.id)) continue;
    const score = scoreOutlet(mate, false);
    if (score == null || score <= bestScore) continue;
    bestScore = score;
    best = mate;
  }
  if (best) return best;

  // Soft fallback: still aim at a free teammate rather than an empty punt.
  for (const mate of teammates) {
    if (mate.id === gk.id || mate.isGK || skip.has(mate.id)) continue;
    const score = scoreOutlet(mate, true);
    if (score == null || score <= bestScore) continue;
    bestScore = score;
    best = mate;
  }
  return best;
}

/** Aim at the outlet's feet, pulled inbound so wide FB throws/kicks stay on the pitch. */
export function keeperOutletAimPoint(target: Player): { x: number; z: number } {
  // Nudge slightly into the pitch and ahead of the FB so the meet isn't on the touchline
  // (wide LBs/RBs were leaving balls that strikers could claim before play started).
  const inbound = clampInboundZ(target.z, TOUCHLINE_SAFE_MARGIN + 2.2);
  const towardMiddle = inbound * 0.82;
  return {
    x: target.x + target.attackSign * 1.8,
    z: towardMiddle,
  };
}

/**
 * Hand release impulse that actually reaches the outlet under stepBall friction.
 * Old fixed caps (roll≤14 / throw≤19) died ~8–12 m short of typical CB/FB outlets.
 */
export function keeperHandReleaseVector(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  delivery: "roll" | "throw",
  kicking01 = 0.7,
): { vx: number; vz: number; vy: number } {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.max(1, Math.hypot(dx, dz));
  const kickBonus = 1 + clamp(kicking01, 0, 1) * 0.08;
  if (delivery === "roll") {
    const t = passFlightTime(dist, "short");
    const vy = 0.42;
    const mag = solvePassGroundSpeed(dist, vy, "short", t) * kickBonus;
    return { vx: (dx / dist) * mag, vz: (dz / dist) * mag, vy };
  }
  // Side-arm throw: mid loft, calibrated to land near the outlet.
  const kick = passKickVector(fromX, fromZ, toX, toZ, "through");
  const vy = clamp(kick.vy * 0.72, 2.4, 5.2);
  const t = passFlightTime(dist, "through");
  const mag = solvePassGroundSpeed(dist, vy, "through", t) * kickBonus;
  return { vx: (dx / dist) * mag, vz: (dz / dist) * mag, vy };
}

/**
 * Safer long clearance: prefer the freest teammate upfield so the kick is contested,
 * not dumped into empty space for the opposition. Fallback is a wide channel.
 * Real hands-punts typically land ~35–50 m upfield (rarely past halfway from the six).
 */
export function keeperPuntAim(
  gk: Player,
  teammates: Player[],
  rng: () => number,
  opponents: Player[] = [],
): { x: number; z: number; targetId?: string } {
  const fwd = gk.attackSign;
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const mate of teammates) {
    if (mate.id === gk.id || mate.isGK) continue;
    const dx = mate.x - gk.x;
    const dist = Math.hypot(dx, mate.z - gk.z);
    const forward = dx * fwd;
    if (forward < 16 || dist < 22 || dist > 58) continue;
    let marked = 14;
    for (const op of opponents) {
      if (op.isGK) continue;
      marked = Math.min(marked, mate.distTo(op.x, op.z));
    }
    const lane = opponents.length ? passingLaneQuality(gk, mate.x, mate.z, opponents) : 0.7;
    const role =
      isStrikerOutlet(mate) ? 0.55
      : isFullBackOutlet(mate) ? 0.35
      : mate.slot.includes("CM") || mate.slot.includes("AM") ? 0.4
      : 0.2;
    const score = marked * 0.55 + lane * 0.9 + role + clamp(forward / 40, 0, 1) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }
  if (best) {
    const aim = keeperOutletAimPoint(best);
    return {
      x: clamp(aim.x, -HALF_LENGTH + 14, HALF_LENGTH - 14),
      z: clampInboundZ(aim.z, 8),
      targetId: best.id,
    };
  }
  const fb = teammates.find((p) => isFullBackOutlet(p) && p.id !== gk.id);
  const wideZ = fb
    ? Math.sign(fb.z || 1) * Math.min(18, Math.max(12, Math.abs(fb.z) * 0.55))
    : rng() > 0.5
      ? 16
      : -16;
  const depth = 38 + rng() * 12; // 38–50 m
  return {
    x: clamp(gk.x + fwd * depth, -HALF_LENGTH + 14, HALF_LENGTH - 14),
    z: clampInboundZ(wideZ + (rng() - 0.5) * 5, 8),
  };
}

export function isStrikerOutlet(player: Player): boolean {
  if (player.isGK) return false;
  const s = player.slot;
  return player.position === "ST" || s.includes("ST") || s.includes("CF");
}

/** Realistic long goal-kick / punt carry from the six-yard line (~40–55 m). */
export const GOAL_KICK_LONG_MAX_M = 55;
export const GOAL_KICK_LONG_TYPICAL_M = 48;

/**
 * Dead-ball goal-kick aim: long services target strikers / the halfway channel;
 * short ones keep the FB/CB outlet nudge so the ball stays on the pitch.
 * Long aims are capped to real kick lengths so the ball does not sail into the final third.
 */
export function goalKickAimPoint(
  gk: Player,
  target: Player | null,
  wantLong: boolean,
  intentZ = 0,
): { x: number; z: number } {
  const fwd = gk.attackSign;
  if (wantLong && target) {
    const rawX = target.x + fwd * 1.6;
    const forward = (rawX - gk.x) * fwd;
    const cappedX =
      forward > GOAL_KICK_LONG_MAX_M ? gk.x + fwd * GOAL_KICK_LONG_MAX_M : rawX;
    return {
      x: clamp(cappedX, -HALF_LENGTH + 12, HALF_LENGTH - 12),
      z: clampInboundZ(target.z * 0.88 + intentZ * 4, 6),
    };
  }
  if (target) return keeperOutletAimPoint(target);
  if (wantLong) {
    const depth = GOAL_KICK_LONG_TYPICAL_M + Math.abs(intentZ) * 2; // ~48–50 m
    return {
      x: clamp(gk.x + fwd * Math.min(depth, GOAL_KICK_LONG_MAX_M), -HALF_LENGTH + 12, HALF_LENGTH - 12),
      z: clampInboundZ(intentZ * 16 + (Math.sign(intentZ || 1) || 1) * 6, 8),
    };
  }
  return {
    x: clamp(gk.x + fwd * 22, -HALF_LENGTH + 14, HALF_LENGTH - 14),
    z: clampInboundZ(intentZ * 14, 8),
  };
}

/**
 * Soft under-hit on long services — `passKickVector` already solves the landing,
 * so any scale > 1 overshoots past real kick lengths.
 */
export function goalKickPowerScale(distance: number, wantLong: boolean): number {
  if (!wantLong) return distance > 28 ? 0.98 : 1;
  // Slightly short of the marker so bounce/carry does not sail past ~55 m.
  return clamp(0.92 + Math.min(distance, GOAL_KICK_LONG_MAX_M) / 400, 0.94, 1);
}

/** Prefer a striker for long goal kicks; fall back to the most advanced teammate. */
export function chooseGoalKickLongTarget(
  gk: Player,
  teammates: Player[],
  intentX = gk.attackSign,
  intentZ = 0,
): Player | null {
  const useStick = Math.hypot(intentX, intentZ) > 0.18;
  const intent = useStick
    ? { x: intentX / (Math.hypot(intentX, intentZ) || 1), z: intentZ / (Math.hypot(intentX, intentZ) || 1) }
    : { x: gk.attackSign, z: 0 };
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const mate of teammates) {
    if (mate.id === gk.id || mate.isGK) continue;
    const dx = mate.x - gk.x;
    const dz = mate.z - gk.z;
    const dist = Math.hypot(dx, dz);
    const forward = dx * gk.attackSign;
    if (dist < 26 || forward < 18) continue;
    // Prefer outlets inside a real long-kick window — do not chase ultra-deep STs.
    if (dist > GOAL_KICK_LONG_MAX_M + 8) continue;
    const dirLen = dist || 1;
    const align = (intent.x * (dx / dirLen) + intent.z * (dz / dirLen) + 1) / 2;
    if (useStick && align < 0.22) continue;
    const st = isStrikerOutlet(mate) ? 1.35 : mate.slot.includes("AM") || mate.slot.includes("CF") ? 0.55 : 0.1;
    const rangeFit = 1 - clamp(Math.abs(dist - GOAL_KICK_LONG_TYPICAL_M) / 28, 0, 0.55);
    const score = forward * 0.035 + st + align * 0.7 + rangeFit * 0.45;
    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }
  return best;
}

export function decideKeeperDistribution(opts: {
  gk: Player;
  teammates: Player[];
  opponents: Player[];
  possessionTime: number;
  pressure: number;
  skipIds?: string[];
  rng?: () => number;
}): KeeperDistAction {
  const { gk, teammates, opponents, possessionTime, pressure, skipIds } = opts;
  const min = pressure > 0.55 ? KEEPER_DISTRIBUTE_MIN * 0.42 : KEEPER_DISTRIBUTE_MIN;
  const ready = keeperRestartReady(teammates, gk);
  const outlet = chooseKeeperOutlet(gk, teammates, opponents, skipIds);
  const rng = opts.rng ?? Math.random;
  // Prefer a short/build-up pass. Punt only under heavy pressure or when forced by the clock.
  const puntChance = clamp(0.05 + pressure * 0.18 + (outlet ? 0 : 0.28), 0.05, 0.48);
  const wantPunt = rng() < puntChance;
  const puntAim = keeperPuntAim(gk, teammates, rng, opponents);
  const punt = { action: "punt" as const, x: puntAim.x, z: puntAim.z, targetId: puntAim.targetId };

  if (possessionTime < min) return { action: "wait" };
  if (!ready && possessionTime < KEEPER_DISTRIBUTE_MAX) return { action: "wait" };

  // Always take an open outlet when available unless the clock forces a clearance.
  if (outlet && !(possessionTime >= KEEPER_DISTRIBUTE_MAX && wantPunt && pressure > 0.5)) {
    if (!wantPunt || possessionTime < KEEPER_DISTRIBUTE_MAX) {
      const dist = gk.distTo(outlet.x, outlet.z);
      return { action: "pass", target: outlet, delivery: keeperPassDelivery(dist, pressure) };
    }
  }
  if (possessionTime >= KEEPER_DISTRIBUTE_MAX) {
    if (outlet) {
      const dist = gk.distTo(outlet.x, outlet.z);
      return { action: "pass", target: outlet, delivery: keeperPassDelivery(dist, pressure) };
    }
    return punt;
  }
  if (outlet) {
    const dist = gk.distTo(outlet.x, outlet.z);
    return { action: "pass", target: outlet, delivery: keeperPassDelivery(dist, pressure) };
  }
  if (possessionTime >= min + 0.55 && wantPunt) return punt;
  if (possessionTime >= min + 1.1) return punt;
  return { action: "wait" };
}

export function parryBall(gk: Player, ball: Ball): void {
  const speed = Math.max(8, Math.hypot(ball.vx, ball.vz));
  const away = gk.attackSign;
  const reflexes = (gk.attrs.gkReflexes ?? gk.attrs.composure) / 100;
  // Parry wide of the goal, not straight into the corridor of the pitch.
  const side = Math.abs(ball.z) > 1.2 ? Math.sign(ball.z) : Math.random() > 0.5 ? 1 : -1;
  ball.vx = away * speed * (0.28 + Math.random() * 0.18);
  ball.vz = side * (6.5 + speed * 0.22) + (Math.random() - 0.5) * 2.2;
  ball.vy = 1.35 + Math.min(3.2, speed * 0.07);
  ball.ownerId = null;
  ball.lastTouchId = gk.id;
  ball.lastTouchSide = gk.side;
  // Better reflexes recover faster for a second save on the rebound.
  gk.kickTimer = clamp(0.48 - reflexes * 0.28, 0.14, 0.48);
  gk.handRelease = false;
  startDive(gk, side, DIVE_DURATION_FULL * (0.78 + (1 - reflexes) * 0.2));
}

export function updateGoalkeeper(
  gk: Player,
  ball: Ball,
  dt: number,
  reactionMul = 1,
  opts?: KeeperTargetOpts,
): "hold" | "parry" | null {
  if (gk.hasBall || ball.ownerId === gk.id) return null;
  const reflexesPre = (gk.attrs.gkReflexes ?? gk.attrs.composure) / 100;
  // Own parry rebound: elite keepers stay live; average gloves need a beat to recover.
  const reboundLock =
    ball.lastTouchId === gk.id &&
    (gk.kickTimer > 0 || (Math.hypot(ball.vx, ball.vz) > 3.2 + reflexesPre * 2.4 && reflexesPre < 0.72));
  if (reboundLock) return null;

  const aim = goalkeeperTarget(gk, ball, reactionMul, opts);
  const distTarget = gk.distTo(aim.x, aim.z);
  const endsFlipped = gk.attackSign !== (gk.side === "home" ? 1 : -1);
  const loose = !ball.ownerId;
  const inBoxEarly = inPenaltyArea(ball.x, ball.z, gk.side, endsFlipped);
  const holdPlant = !!opts?.holdLine || !!opts?.setPieceHold;
  // Sprint onto claims and when the angle stand has moved — keepers must shuffle fast.
  const lateralGap = Math.abs(aim.z - gk.z);
  const allowSprint =
    !holdPlant &&
    (aim.rush || distTarget > 2.4 || lateralGap > 1.15 || (loose && inBoxEarly && distTarget > 1.4));
  const reactBoost = 1 + reflexesPre * 0.18;
  const moveEx = {
    speedMul: (allowSprint ? 1.14 : 1.06) * reactBoost,
    accelMul: (allowSprint ? 1.28 : 1.12) * (1 + reflexesPre * 0.22),
  };
  if (aim.rush && loose && inBoxEarly && !holdPlant) {
    // Commit onto the ball itself when claiming, not only the cover spot.
    const bx = ball.x + ball.vx * 0.1;
    const bz = ball.z + ball.vz * 0.1;
    movePlayer(gk, dt, bx - gk.x, bz - gk.z, true, false, moveEx);
  } else {
    movePlayer(gk, dt, aim.x - gk.x, aim.z - gk.z, allowSprint, false, moveEx);
  }
  // Face the ball so body shape tracks the play.
  if (Math.hypot(ball.x - gk.x, ball.z - gk.z) > 0.4) {
    gk.facing = Math.atan2(ball.x - gk.x, ball.z - gk.z);
  }

  const handling = (gk.attrs.gkHandling ?? gk.attrs.composure) / 100;
  const reflexes = reflexesPre;
  const diving = (gk.attrs.gkDiving ?? gk.attrs.jumping ?? 62) / 100;
  const speed = Math.hypot(ball.vx, ball.vz);
  // Snappy contact prediction — high reflexes read the ball earlier and close sooner.
  const look = clamp((0.1 + reflexes * 0.06 + (1 - reflexes) * 0.04) * reactionMul, 0.07, 0.3);
  const predX = ball.x + ball.vx * look;
  const predZ = ball.z + ball.vz * look;
  const dist = Math.min(gk.distTo(ball.x, ball.z), gk.distTo(predX, predZ));
  const inBox = inBoxEarly || inPenaltyArea(predX, predZ, gk.side, endsFlipped);
  const inSix = inSixYardArea(ball.x, ball.z, gk.side, endsFlipped);
  const shotThreat =
    !!opts?.incomingShot || (speed > 8 && Math.sign(ball.vx) === -gk.attackSign);
  const teammateTouch = !!ball.lastTouchId && ball.lastTouchId !== gk.id && ball.lastTouchSide === gk.side;
  // Back-passes / teammate releases outside the six: leave them for the feet.
  // Inside the six the keeper may smother a bobble.
  if (teammateTouch && !inSix) return null;

  const diveReach = keeperDiveReach(diving, reflexes, opts?.diveReachMul ?? 1);
  const softClaim = loose && inBox && speed < 9.5;
  const catchRange =
    (softClaim
      ? inSix
        ? 2.65
        : 2.25
      : speed > 15
        ? 1.35
        : speed > 11
          ? 1.62
          : inSix
            ? 2.35
            : inBox
              ? 2.0
              : 1.45) +
    handling * 0.55 +
    reflexes * 0.22 +
    (shotThreat ? diveReach * 0.82 : diveReach * 0.32) +
    (aim.rush ? 0.35 : 0);
  if (!inBox && dist > 1.55 + diveReach * 0.3) return null;
  const maxY = softClaim ? 2.35 + diving * 0.45 : 2.95 + diving * 0.4 + handling * 0.25 + reflexes * 0.15;
  if (dist > catchRange || ball.y > maxY) return null;

  const canSmother = loose || ball.lastTouchSide !== gk.side || speed > 3.5;
  if (!canSmother && ball.ownerId && ball.ownerId !== gk.id) return null;

  // Dive laterally toward the flight when the ball is outside the body.
  const lateral = predZ - gk.z;
  if ((shotThreat || speed > 10) && Math.abs(lateral) > 0.28) {
    const step = Math.min(Math.abs(lateral), diveReach * (0.75 + reflexes * 0.2)) * Math.sign(lateral);
    gk.z += step * clamp(0.68 + diving * 0.4 + reflexes * 0.24, 0.55, 1.2);
    startDive(gk, Math.sign(lateral) || 1, DIVE_DURATION_FULL * (0.82 + diving * 0.18 + reflexes * 0.1));
  }

  const punch = preferKeeperPunch({
    ballY: ball.y,
    ballSpeed: speed,
    handling,
    inSix,
    traffic: opts?.traffic ?? 0,
  });
  // Prefer holding soft loose balls / six-yard claims over punching them away.
  const forceHold = softClaim && ball.y < 1.85 && (opts?.traffic ?? 0) < 2;
  const kind = forceHold
    ? "hold"
    : keeperSaveKind(speed, handling, inSix, dist, {
        reflexes,
        diving,
        ballY: ball.y,
        holdBiasMul: opts?.holdBiasMul,
        diveReachMul: opts?.diveReachMul,
      });
  if (!forceHold && (punch || kind !== "hold")) {
    parryBall(gk, ball);
    // Crowded high crosses: punch further upfield.
    if (punch && ball.y > 1.7) {
      ball.vx += gk.attackSign * (2.5 + (1 - handling) * 2);
      ball.vy = Math.max(ball.vy, 2.4 + (1 - handling) * 1.2);
    }
    return "parry";
  }
  // Claim into the hands — ball sits at chest once Match takes possession.
  ball.reset(gk.x - gk.attackSign * 0.35, gk.z);
  ball.y = 1.05;
  ball.ownerId = gk.id;
  ball.lastTouchId = gk.id;
  ball.lastTouchSide = gk.side;
  gk.handRelease = false;
  gk.facing = gk.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (shotThreat) {
    startDive(gk, Math.sign(lateral) || gk.diveDirZ || 1, DIVE_DURATION_CLAIM);
  }
  return "hold";
}
