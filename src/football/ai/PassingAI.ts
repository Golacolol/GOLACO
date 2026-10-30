import { clamp, dist2, dot2, normalize2, stat01 } from "../../core/math";
import { scorePassCandidate, type PassType } from "../ball/PassModel";
import { HALF_LENGTH } from "../constants";
import { inPenaltyArea } from "../pitch/PitchZones";
import { isInOffsidePosition, offsideLineX } from "../rules/Offside";
import type { Ball } from "../ball/Ball";
import type { Player } from "../players/Player";
import { setPieceRole } from "./SetPieceAI";
import { playStylePassWeights, type PlayStyleProfile } from "./PlayStyle";

/** Buckland-style optimal support pocket (~12–18m). */
export function supportDistanceScore(distance: number, buildup = false): number {
  const optimal = buildup ? 13.5 : 16.5;
  const temp = Math.abs(optimal - distance);
  if (temp >= optimal) return 0;
  return (1 - temp / optimal) * (buildup ? 0.58 : 0.4);
}

/**
 * Hard FindPass gate (Buckland): lane must be pass-safe before scoring soft options.
 * Returns false when an opponent sits in the corridor.
 */
export function isPassSafe(
  passer: Player,
  toX: number,
  toZ: number,
  opponents: Player[],
  minLane = 0.4,
): boolean {
  return passingLaneQuality(passer, toX, toZ, opponents) >= minLane;
}

/**
 * CanShoot gate: clear enough lane + close enough for a forced shot decision.
 */
export function canShoot(
  carrier: Player,
  opponents: Player[],
  opts?: { maxDist?: number; minLane?: number },
): boolean {
  const goalX = carrier.oppGoalX();
  const dist = carrier.distTo(goalX, 0);
  const maxDist = opts?.maxDist ?? 18;
  if (dist > maxDist || Math.abs(carrier.z) > 14) return false;
  return passingLaneQuality(carrier, goalX, 0, opponents) >= (opts?.minLane ?? 0.38);
}

/** Best pass-safe teammate for a type, or null (hard filter before soft scores). */
export function findPass(
  passer: Player,
  teammates: Player[],
  opponents: Player[],
  ball: Ball,
  passType: PassType,
  opts?: { forbidIds?: string[]; style?: "attack" | "buildup"; minLane?: number },
): Player | null {
  const intentX = passer.attackSign * 20;
  const candidate = choosePassTarget(passer, teammates, opponents, ball, intentX, 0, passType, opts);
  if (!candidate) return null;
  const minLane = opts?.minLane ?? (passType === "short" ? 0.42 : 0.36);
  if (!isPassSafe(passer, candidate.x, candidate.z, opponents, minLane)) return null;
  return candidate;
}

/** Striker layover: short option back/side into midfield after a first touch. */
export function layoffOptionBonus(
  passer: Player,
  mate: Player,
  distance: number,
  forward: number,
  width: number,
): number {
  const passerSt = passer.slot.includes("ST") || passer.position === "ST";
  if (!passerSt) return 0;
  const mateMid =
    mate.slot.includes("CM") ||
    mate.slot.includes("AM") ||
    mate.slot.includes("DM") ||
    mate.position === "CM" ||
    mate.position === "AM" ||
    mate.position === "DM";
  if (!mateMid) return 0;
  if (distance > 16 || distance < 3.5) return 0;
  if (forward > 5 || width > 14) return 0;
  return clamp(0.72 - distance * 0.02 + (forward < 0 ? 0.12 : 0), 0.2, 0.85);
}

export function ownGoalX(side: "home" | "away", endsFlipped = false): number {
  return side === "home"
    ? endsFlipped
      ? HALF_LENGTH
      : -HALF_LENGTH
    : endsFlipped
      ? -HALF_LENGTH
      : HALF_LENGTH;
}

export function isBackwardPass(passer: Player, toX: number, _toZ: number): boolean {
  const forward = (toX - passer.x) * passer.attackSign;
  return forward < 1.2;
}

/**
 * Lateral switch that cuts across a penalty area — rare and risky; prefer available players instead.
 * Own-box squares are almost never selected; opposition goal-mouth squares are heavily discouraged.
 */
export function isAcrossGoalBoxPass(passer: Player, toX: number, toZ: number): boolean {
  const endsFlipped = passer.attackSign !== (passer.side === "home" ? 1 : -1);
  const own = passer.ownGoalX();
  const opp = -own;
  const lateral = Math.abs(toZ - passer.z);
  if (lateral < 11) return false;
  const crosses =
    Math.sign(passer.z || 0.01) !== Math.sign(toZ || 0.01) && Math.abs(passer.z) > 3.5 && Math.abs(toZ) > 3.5;
  if (!crosses && lateral < 16) return false;
  const nearOwn =
    (inPenaltyArea(passer.x, passer.z, passer.side, endsFlipped) || Math.hypot(passer.x - own, passer.z) < 22) &&
    (inPenaltyArea(toX, toZ, passer.side, endsFlipped) || Math.hypot(toX - own, toZ) < 22);
  const nearOpp =
    Math.hypot(passer.x - opp, passer.z) < 24 &&
    Math.hypot(toX - opp, toZ) < 24 &&
    Math.abs(passer.x - opp) < 28 &&
    Math.abs(toX - opp) < 28;
  return nearOwn || nearOpp;
}

export function isAcrossOwnGoalBoxPass(passer: Player, toX: number, toZ: number): boolean {
  if (!isAcrossGoalBoxPass(passer, toX, toZ)) return false;
  const endsFlipped = passer.attackSign !== (passer.side === "home" ? 1 : -1);
  const own = passer.ownGoalX();
  return (
    (inPenaltyArea(passer.x, passer.z, passer.side, endsFlipped) || Math.hypot(passer.x - own, passer.z) < 22) &&
    (inPenaltyArea(toX, toZ, passer.side, endsFlipped) || Math.hypot(toX - own, toZ) < 22)
  );
}

/**
 * Flat side-to-side switch with little forward progress — kills build-up.
 * Progressive diagonals (ahead + width) are allowed.
 */
export function isFlatCrossFieldPass(passer: Player, toX: number, toZ: number): boolean {
  const forward = (toX - passer.x) * passer.attackSign;
  const width = Math.abs(toZ - passer.z);
  if (width < 14) return false;
  const opposite =
    Math.sign(passer.z || 0.01) !== Math.sign(toZ || 0.01) && Math.abs(passer.z) > 8 && Math.abs(toZ) > 8;
  if (opposite && forward < 10 && width > 16) return true;
  if (width >= 20 && forward < 9) return true;
  if (width > 16 && forward < 5) return true;
  return false;
}

export function towardOwnKeeper(passer: Player, toX: number, toZ: number, teammates: Player[]): boolean {
  const gk = teammates.find((p) => p.isGK && p.side === passer.side);
  const endsFlipped = passer.attackSign !== (passer.side === "home" ? 1 : -1);
  if (!gk) return inPenaltyArea(toX, toZ, passer.side, endsFlipped);
  const closerToGk = Math.hypot(toX - gk.x, toZ - gk.z) < 12 && isBackwardPass(passer, toX, toZ);
  return closerToGk || (inPenaltyArea(toX, toZ, passer.side, endsFlipped) && isBackwardPass(passer, toX, toZ));
}

/** Keep outfield kicks from rolling back onto the goalkeeper. */
export function safePassDestination(
  passer: Player,
  destX: number,
  destZ: number,
  teammates: Player[],
  opts?: { forceForward?: boolean; allowBackward?: boolean },
): { x: number; z: number } {
  if (passer.isGK || opts?.allowBackward) return { x: destX, z: destZ };
  const fwd = passer.attackSign;
  const own = passer.ownGoalX();
  const backward = isBackwardPass(passer, destX, destZ);
  const toKeeper = towardOwnKeeper(passer, destX, destZ, teammates);
  const nearOwnGoal = Math.hypot(destX - own, destZ) < 22;
  if (toKeeper || (nearOwnGoal && backward) || (opts?.forceForward && backward)) {
    // Soft forward correction — keep lateral intent, avoid dumping into empty channels.
    const push = clamp(Math.abs(destX - passer.x), 6, 12);
    const lateral = clamp(destZ * 0.75 + passer.z * 0.25, passer.z - 9, passer.z + 9);
    return { x: passer.x + fwd * push, z: clamp(lateral, -24, 24) };
  }
  return { x: destX, z: destZ };
}

export function choosePassTarget(
  passer: Player,
  teammates: Player[],
  opponents: Player[],
  ball: Ball,
  intentX: number,
  intentZ: number,
  passType: PassType,
  opts?: { forbidIds?: string[]; style?: "attack" | "buildup"; playStyle?: PlayStyleProfile },
): Player | null {
  void ball;
  const forbid = new Set(opts?.forbidIds ?? []);
  const buildup = opts?.style === "buildup" || setPieceRole(passer) === "mid";
  const styleW = opts?.playStyle
    ? playStylePassWeights(opts.playStyle, { phase: buildup ? "build" : "attack" })
    : null;
  const intentIn = normalize2(intentX, intentZ);
  const useStick = Math.hypot(intentX, intentZ) > 0.15;
  const attackX = passer.attackSign;
  const intent = useStick ? intentIn : { x: attackX, z: 0 };
  const own = passer.ownGoalX();
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const mate of teammates) {
    if (mate.id === passer.id) continue;
    if (mate.isGK) continue;
    if (forbid.has(mate.id)) continue;
    // Need a real defensive line (2+ opponents) before offside filtering applies.
    const offside = opponents.length >= 2 && isInOffsidePosition(mate, passer.x, opponents);
    // Never pick an offside runner — through balls especially must stay legal.
    if (offside) continue;
    // Score lanes / alignment to the same lead point executePass aims at.
    const lead =
      passType === "through" || passType === "chip"
        ? throughBallAim(passer, mate, opponents)
        : passLeadPoint(mate);
    const dx = lead.x - passer.x;
    const dz = lead.z - passer.z;
    const distance = Math.hypot(mate.x - passer.x, mate.z - passer.z);
    const forward = (mate.x - passer.x) * passer.attackSign;
    if (distance < 2.2) continue;
    if (passType === "short" && distance > (buildup ? 26 : 30)) continue;
    if (passType === "short" && distance < 6.5 && Math.abs(mate.z - passer.z) < 5.5 && forward < 4) continue;
    if (passType === "through" && distance < 6) continue;
    if (passType === "long" && distance < 14) continue;
    // Extreme flat dumps only — milder switches stay available but lose to short options on score.
    if (passType !== "cross" && Math.abs(mate.z - passer.z) >= 28 && forward < 5) continue;
    if (passType === "short" && Math.abs(mate.z - passer.z) > 24 && forward < 6) continue;
    if (passType === "long" && Math.abs(mate.z - passer.z) > 24 && forward < 10) continue;
    if (passType === "long" && Math.abs(mate.z - passer.z) > 18 && forward < 5) continue;
    if (forward < (buildup ? -16 : -6)) continue;
    if (mate.distTo(own, 0) < 14) continue;
    if (towardOwnKeeper(passer, mate.x, mate.z, teammates)) continue;
    // Never square across your own box when another option exists; skip outright for non-crosses.
    const acrossOwn = isAcrossOwnGoalBoxPass(passer, mate.x, mate.z);
    const acrossBox = isAcrossGoalBoxPass(passer, mate.x, mate.z);
    if (acrossOwn && passType !== "cross") continue;
    if (acrossBox && passType === "long") continue;
    const dir = normalize2(dx, dz);
    const alignment = (dot2(intent.x, intent.z, dir.x, dir.z) + 1) / 2;
    if (useStick && alignment < 0.16 && passType === "short") continue;
    if (useStick && alignment < 0.26 && passType !== "short") continue;
    const laneClear = passingLaneQuality(passer, lead.x, lead.z, opponents);
    const width = Math.abs(mate.z - passer.z);
    const space = nearestOpp(mate, opponents);
    const role = setPieceRole(mate);
    const lateral = width > 7 && forward < 10;
    const recycle = forward < 0 && (role === "cb" || role === "fb" || role === "mid");
    const wing = role === "wide" || Math.abs(mate.z) > 16;
    // Skip clogged lanes early — must find free routes, not thread bodies.
    if (passType === "short" && laneClear < (buildup ? 0.48 : 0.42)) continue;
    // Through balls: soften the hard filter when the runner is onside with space ahead.
    const aheadSpace = forward > 5 && space > 4.2;
    if (passType === "through" && laneClear < 0.28) continue;
    if (passType === "through" && laneClear < 0.5 && !aheadSpace) continue;
    if (passType !== "short" && passType !== "through" && laneClear < 0.36) continue;
    const open = space > (buildup ? 4.5 : 5.5) && laneClear > (buildup ? 0.62 : 0.68);
    const tightPingPong = distance < 9 && width < 7 && Math.abs(forward) < 6;
    const passerWide = setPieceRole(passer) === "wide" || Math.abs(passer.z) > 16;
    const oppositeWing =
      Math.sign(passer.z || 1) !== Math.sign(mate.z || 1) && Math.abs(passer.z) > 10 && Math.abs(mate.z) > 10;
    const flatReswitch = oppositeWing && forward < 10 && (passerWide || wing || width > 18);
    const crossFieldSpam = width > 16 && forward < 8;
    // Reward progressive diagonals; punish flat width.
    const switchedLane =
      width > 8
        ? forward > 8
          ? buildup
            ? 0.22
            : 0.16
          : forward > 4
            ? buildup
              ? 0.06
              : 0.02
            : buildup
              ? -0.55
              : -0.72
        : 0;
    // Same-side / nearby width for build-up; opposite wing only if clearly progressive.
    const wingBonus = wing
      ? forward > 6
        ? buildup
          ? oppositeWing
            ? 0.12
            : 0.34
          : 0.32
        : forward > 2
          ? buildup
            ? oppositeWing
              ? -0.15
              : 0.22
            : 0.16
          : oppositeWing
            ? -0.45
            : 0.04
      : 0;
    // Discourage passes into the corner / byline pocket — keep play circulating.
    const cornerDump = Math.abs(mate.z) > 20 || (Math.abs(mate.z) > 17 && Math.abs(mate.x) > HALF_LENGTH - 18);
    const flatSwitch = isFlatCrossFieldPass(passer, mate.x, mate.z);
    // Progressive diagonal switch (ahead + width) can still beat a dead end — flat ones cannot.
    const progressiveSwitch = flatSwitch && forward >= 8 && width < 26;
    const shortBuild =
      buildup &&
      passType === "short" &&
      distance < 20 &&
      width < 14 &&
      forward > -2 &&
      laneClear > 0.48;
    const tactical =
      (forward > 8 ? 0.62 : forward > 2 ? 0.48 : lateral ? (buildup ? 0.1 : 0.2) : recycle ? (buildup ? 0.36 : 0.18) : 0.08) +
      (role === "st"
        ? laneClear > 0.62 && space > 5
          ? 0.16
          : space < 3.2
            ? -0.95
            : -0.12
        : 0) +
      (space < 2.8 && forward > 8 ? -0.55 : 0) +
      (role === "mid" ? (buildup ? 0.48 : 0.24) : 0) +
      (role === "cb" && buildup && forward > -4 && width < 12 ? 0.22 : 0) +
      wingBonus +
      (recycle && buildup ? 0.22 : 0) +
      (open ? (buildup ? 0.75 : 0.38) : space < 3.2 ? -0.35 : 0) +
      // Continuous reward for clear corridors so free routes beat sticky triangles.
      (laneClear - 0.5) * (buildup ? 0.78 : 0.42) +
      switchedLane +
      (flatReswitch ? -1.95 : 0) +
      (crossFieldSpam ? (passType === "short" ? -1.05 : -1.75) : 0) +
      (flatSwitch ? (progressiveSwitch ? -0.55 : passType === "short" ? -1.45 : -2.1) : 0) +
      (oppositeWing && forward < 12 ? -0.75 : 0) +
      (width > 14 && forward < 5 ? -0.95 : 0) +
      (tightPingPong ? -0.85 : 0) +
      (acrossOwn ? -1.55 : acrossBox ? -1.35 : 0) +
      (cornerDump ? (passType === "short" ? -0.42 : -0.75) : 0) +
      (passType === "long" ? clamp(space / 10, 0, 0.14) - clamp(width / 20, 0, 1.05) - (oppositeWing ? 0.65 : 0) : 0) +
      (shortBuild ? 0.48 : 0) +
      (buildup && passType === "short" && distance < 16 && width < 11 && forward >= 0 ? 0.28 : 0) +
      (passType === "short" && distance < 12 && width < 9 ? 0.16 : 0) +
      (passType === "through" && aheadSpace && laneClear >= 0.5 ? (buildup ? 0.28 : 0.42) : 0) +
      (buildup && passType === "through" && wing && forward > 5 && !oppositeWing ? 0.14 : 0) +
      (buildup && passType === "long" ? -0.45 : 0) +
      (passType === "long" && !buildup ? -0.18 : 0) +
      (passType === "through" && role === "wide" && forward > 6 && !oppositeWing ? (buildup ? 0.1 : 0.18) : 0) +
      // Support pocket + striker layoff (Buckland Simple Soccer ideas).
      supportDistanceScore(distance, buildup) +
      layoffOptionBonus(passer, mate, distance, forward, width) +
      (role === "st" && open && forward > 4 && laneClear > 0.55
        ? passType === "through"
          ? 0.48
          : 0.14
        : 0) +
      (styleW
        ? passType === "short"
          ? styleW.shortBonus * 1.35
          : passType === "through"
            ? styleW.throughBonus * 1.25 + (aheadSpace ? 0.14 : 0)
            : passType === "long"
              ? styleW.longBonus * 1.2 +
                (forward > 12 ? 0.18 : 0) +
                (buildup ? -styleW.buildupCrush * 0.35 : 0)
              : 0
        : 0);
    const scored = scorePassCandidate({
      alignment: useStick ? alignment : buildup ? Math.max(alignment, 0.4) : alignment,
      distance,
      // Prefer truly clear lanes; do not inflate mediocre ones in buildup.
      laneClear: buildup ? (open ? Math.max(laneClear, 0.65) : laneClear * 0.88) : laneClear,
      tactical,
      passType,
      vision: stat01(passer.attrs.vision),
    });
    // High vision unlocks ambitious options; low vision prefers safer short lanes.
    let visionBias = 0;
    if (passType === "through" || passType === "long") {
      visionBias = (stat01(passer.attrs.vision) - 0.5) * 0.55;
    } else if (passType === "short" && open && forward > 2) {
      visionBias = (stat01(passer.attrs.vision) - 0.45) * 0.18;
    }
    const total = scored.total + visionBias;
    if (total > bestScore) {
      bestScore = total;
      best = mate;
    }
  }
  return best;
}

/** Lead point matching Match.executePass ground-pass aim (desired/velocity blend). */
export function passLeadPoint(mate: Player): { x: number; z: number } {
  return {
    x:
      mate.x +
      (mate.desiredX !== 0 ? (mate.desiredX - mate.x) * 0.35 : mate.vx * 0.45) +
      mate.vx * 0.25,
    z:
      mate.z +
      (mate.desiredZ !== 0 ? (mate.desiredZ - mate.z) * 0.35 : mate.vz * 0.45) +
      mate.vz * 0.25,
  };
}

export function throughBallAim(
  passer: Player,
  mate: Player,
  opponents: Player[] = [],
): { x: number; z: number } {
  const fwd = passer.attackSign;
  const pace01 = mate.attrs.pace / 100;
  const vision01 = passer.attrs.vision / 100;
  // Lead relative to runner pace/vector and the offside line — not only current feet.
  const runLead = 2.8 + vision01 * 1.6 + pace01 * 3.2 + Math.max(0, mate.vx * fwd) * 0.55;
  const runX = mate.x + mate.vx * 0.55 + fwd * runLead;
  let aimX = runX;
  if (opponents.length >= 2) {
    const line = offsideLineX(opponents, fwd);
    // Drop just onside of the line so the runner meets the ball legally.
    const legal = line - fwd * (0.6 + (1 - pace01) * 0.5);
    if ((aimX - legal) * fwd > 0) aimX = legal;
    // Still reward a modest lead ahead of the mate when they are deep of the line.
    const behindLine = (legal - mate.x) * fwd;
    if (behindLine > 2) {
      aimX = mate.x + fwd * Math.min(runLead, behindLine * 0.85);
    }
  }
  let z = mate.z + mate.vz * 0.55 + (mate.desiredZ !== 0 ? (mate.desiredZ - mate.z) * 0.25 : (mate.anchorZ - mate.z) * 0.12);
  if (Math.abs(z) > 16) z *= 0.72;
  return {
    x: aimX,
    z: clamp(z, -22, 22),
  };
}

export function passingLaneQuality(from: Player, toX: number, toZ: number, opponents: Player[]): number {
  let min = 1;
  const dx = toX - from.x;
  const dz = toZ - from.z;
  const len = Math.hypot(dx, dz) || 1;
  // Tight corridor — bodies near the line tank quality hard.
  const corridor = 2.35;
  for (const op of opponents) {
    if (op.isGK) continue;
    const t = Math.max(0, Math.min(1, ((op.x - from.x) * dx + (op.z - from.z) * dz) / (len * len)));
    // Include pressers on the passer and markers on the receiver (full lane).
    if (t < 0.02 || t > 0.98) continue;
    const px = from.x + dx * t;
    const pz = from.z + dz * t;
    const d = dist2(op.x, op.z, px, pz);
    if (d < corridor) {
      // Nonlinear falloff so near-misses are not "good enough".
      const q = (d / corridor) * (d / corridor);
      min = Math.min(min, q);
    }
  }
  return min;
}

export function interceptCandidate(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  ballY: number,
  opponents: Player[],
): Player | null {
  // Lofted balls are harder to pick off mid-flight.
  if (ballY > 1.65) return null;
  let best: Player | null = null;
  let bestD = 1.15;
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  for (const op of opponents) {
    const t = Math.max(0.02, Math.min(0.98, ((op.x - fromX) * dx + (op.z - fromZ) * dz) / (len * len)));
    const px = fromX + dx * t;
    const pz = fromZ + dz * t;
    const d = dist2(op.x, op.z, px, pz);
    const toBall = dist2(op.x, op.z, toX, toZ);
    // Must be genuinely in the lane and close enough to step across.
    if (toBall > 3.4 && d > 1.35) continue;
    const react = stat01(op.attrs.reactions ?? op.attrs.composure);
    const pace = stat01(op.attrs.pace);
    const reach = 0.85 + stat01(op.attrs.defending) * 0.4 + react * 0.25 + pace * 0.15;
    // Low reactions miss sticky interceptions that used to feel automatic.
    if (d < bestD && d < reach && (react > 0.38 || d < 0.7)) {
      bestD = d;
      best = op;
    }
  }
  return best;
}

function nearestOpp(mate: Player, opponents: Player[]): number {
  let best = 20;
  for (const op of opponents) {
    const d = mate.distTo(op.x, op.z);
    if (d < best) best = d;
  }
  return best;
}
