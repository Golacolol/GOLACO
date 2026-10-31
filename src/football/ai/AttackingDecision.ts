import { clamp, stat01 } from "../../core/math";
import { GOAL_WIDTH, HALF_LENGTH, PENALTY_AREA_LENGTH } from "../constants";
import type { Player } from "../players/Player";
import type { GameplayTuning } from "../gameplay/GameplayTuning";
import { canShoot, choosePassTarget, isBackwardPass, passingLaneQuality } from "./PassingAI";
import { matchPhase, roleOnBallBias, classifyFootballRole } from "./MatchBrain";
import { bestAvailableSpace, forwardPathCongested } from "./SpaceField";
import type { SpaceSample } from "./SpaceField";
import type { PassType } from "../ball/PassModel";
import type { Ball } from "../ball/Ball";
import { playStylePassWeights, playStyleProfile, type PlayStyleProfile } from "./PlayStyle";
import { positionArchetype } from "./PositionArchetype";
import { offsideLineX } from "../rules/Offside";

export type AttackAction = "PASS" | "THROUGH" | "LONG_PASS" | "CROSS" | "RUN" | "SHOT" | "LONG_SHOT" | "HOLD";

export interface AttackScores {
  passScore: number;
  runScore: number;
  shotScore: number;
  longShotScore: number;
  throughBallScore: number;
  longPassScore: number;
  crossScore: number;
  holdScore: number;
}

export interface AttackDecision {
  action: AttackAction;
  scores: AttackScores;
  space: SpaceSample;
  passTarget: Player | null;
  passType: PassType;
}

export interface AttackContext {
  carrier: Player;
  teammates: Player[];
  opponents: Player[];
  ball: Ball;
  possessionTime: number;
  pressure: number;
  tuning: GameplayTuning;
  rng?: () => number;
  forbidIds?: string[];
  /** Team play-style (route one vs possession). */
  playStyle?: PlayStyleProfile;
}

export function possessionUrgency(possessionTime: number): number {
  if (possessionTime < 2.8) return 0.36;
  if (possessionTime < 5.5) return 0.62;
  return clamp(0.88 + (possessionTime - 5.5) * 0.08, 0.88, 1.18);
}

export function longShotOpportunity(carrier: Player, opponents: Player[]): { open: boolean; distance: number; blocked: boolean; inZone: boolean } {
  const goalX = carrier.oppGoalX();
  const distance = carrier.distTo(goalX, 0);
  const inZone = distance >= 18 && distance <= 26 && Math.abs(carrier.z) < 11;
  const toward = carrier.attackSign;
  const backToGoal = Math.sin(carrier.facing) * toward < -0.35;
  let blocked = false;
  for (const o of opponents) {
    const t = ((o.x - carrier.x) * (goalX - carrier.x) + (o.z - carrier.z) * (0 - carrier.z)) / (distance * distance || 1);
    if (t > 0.1 && t < 0.94) {
      const px = carrier.x + (goalX - carrier.x) * t;
      const pz = carrier.z + (0 - carrier.z) * t;
      if (Math.hypot(o.x - px, o.z - pz) < 1.85) blocked = true;
    }
  }
  return { open: inZone && !backToGoal && !blocked, distance, blocked, inZone };
}

/**
 * Near-goal chance quality: clear lane + exposed keeper (even if he can still dive).
 * High values should force a shot rather than another recycle pass.
 */
export function clearChanceOpportunity(
  carrier: Player,
  opponents: Player[],
): { quality: number; close: boolean; laneClear: boolean; gkExposed: boolean } {
  const goalX = carrier.oppGoalX();
  const distance = carrier.distTo(goalX, 0);
  const close = distance < 14 && Math.abs(carrier.z) < 10;
  if (!close) return { quality: 0, close: false, laneClear: false, gkExposed: false };

  let outfieldBlock = false;
  for (const o of opponents) {
    if (o.isGK) continue;
    const t = ((o.x - carrier.x) * (goalX - carrier.x) + (o.z - carrier.z) * (0 - carrier.z)) / (distance * distance || 1);
    if (t > 0.08 && t < 0.95) {
      const px = carrier.x + (goalX - carrier.x) * t;
      const pz = carrier.z + (0 - carrier.z) * t;
      if (Math.hypot(o.x - px, o.z - pz) < 1.55) outfieldBlock = true;
    }
  }
  const laneClear = !outfieldBlock;

  const gk = opponents.find((o) => o.isGK) ?? null;
  let gkExposed = true;
  let gkCover = 0;
  if (gk) {
    const t = Math.max(
      0,
      Math.min(1, ((gk.x - carrier.x) * (goalX - carrier.x) + (gk.z - carrier.z) * (0 - carrier.z)) / (distance * distance || 1)),
    );
    const px = carrier.x + (goalX - carrier.x) * t;
    const pz = carrier.z + (0 - carrier.z) * t;
    const lineDist = Math.hypot(gk.x - px, gk.z - pz);
    const gkFromGoal = Math.abs(gk.x - goalX);
    // Cover drops when keeper is off the shot line or rushed off his line.
    gkCover = clamp(1 - lineDist / (GOAL_WIDTH * 0.55), 0, 1) * clamp(1.15 - gkFromGoal / 7, 0.25, 1);
    gkExposed = gkCover < 0.62 || Math.abs(gk.z) > 2.4;
  }

  let quality = 0;
  if (laneClear) {
    quality = 0.32 + (1 - distance / 14) * 0.38 + (gkExposed ? 0.28 : 0.08);
    if (distance < 11) quality += 0.18;
    if (Math.abs(carrier.z) < 5.5) quality += 0.1;
    if (gk && Math.abs(gk.z - carrier.z) > 2.8) quality += 0.12;
  } else if (distance < 9 && Math.abs(carrier.z) < 8) {
    // Still must hit it when very close even through a crowd.
    quality = 0.38 + (gkExposed ? 0.12 : 0);
  }
  return { quality: clamp(quality, 0, 1), close, laneClear, gkExposed };
}

export function isStriker(player: Player): boolean {
  return player.position === "ST" || player.slot.includes("ST");
}

export function isWideAttacker(player: Player): boolean {
  const s = player.slot;
  return s === "LM" || s === "RM" || s === "LW" || s === "RW" || s === "LAM" || s === "RAM" || s.includes("W");
}

export function isMidfielder(player: Player): boolean {
  const s = player.slot;
  if (isWideAttacker(player)) return false;
  return s.includes("CM") || s.includes("DM") || s === "CAM";
}

export function decideAttack(ctx: AttackContext): AttackDecision {
  const { carrier, teammates, opponents, ball, possessionTime, pressure, tuning } = ctx;
  const style = ctx.playStyle ?? playStyleProfile("balanced");
  const arch = positionArchetype(carrier);
  const progress = clamp((carrier.x * (carrier.attackSign) + HALF_LENGTH) / (HALF_LENGTH * 2), 0, 1);
  const striker = isStriker(carrier);
  const wide = isWideAttacker(carrier);
  const midfield = isMidfielder(carrier);
  const footRole = classifyFootballRole(carrier);
  const roleBias = roleOnBallBias(carrier);
  const directTeam = style.id === "direct" || style.id === "routeOne";
  const counterTeam = style.id === "counter";
  const building = progress < 0.64 && pressure < 0.62 && !directTeam;
  // Tentative phase for style weights (refined again after chance calc).
  const earlyPhase = progress < 0.55 ? "build" : "attack";
  const styleW = playStylePassWeights(style, { phase: earlyPhase });
  const wantBuildup =
    !directTeam &&
    (roleBias.buildup > 0.48 ||
      arch.safeRecycle > 0.65 ||
      (midfield && progress < 0.8) ||
      (striker && progress < 0.66) ||
      (wide && progress < 0.64 && pressure < 0.58) ||
      (building && !wide) ||
      (building && wide && progress < 0.58) ||
      footRole === "CB" ||
      footRole === "DM" ||
      footRole === "FB" ||
      footRole === "CM");
  const forbid = new Set(ctx.forbidIds ?? []);
  const passOpts = {
    forbidIds: ctx.forbidIds,
    style: wantBuildup ? ("buildup" as const) : ("attack" as const),
    playStyle: style,
  };
  const space = bestAvailableSpace(carrier, opponents, teammates);
  const congested = forwardPathCongested(carrier, opponents);
  const goalX = carrier.oppGoalX();
  const distGoal = carrier.distTo(goalX, 0);
  const urgency =
    possessionUrgency(possessionTime) *
    tuning.passUrgencyMultiplier *
    style.tempo *
    (wantBuildup && possessionTime < 4.2 ? 0.72 : wantBuildup ? 0.88 : 1);
  const vision = stat01(carrier.attrs.vision);
  const passing = stat01(carrier.attrs.passing);
  const drib = stat01(carrier.attrs.dribbling);
  const pace = stat01(carrier.attrs.pace);
  const shoot = stat01(carrier.attrs.shooting);
  const longS = stat01(carrier.attrs.longShots);
  const comp = stat01(carrier.attrs.composure);
  const attAw = stat01(carrier.attrs.attackingAwareness ?? carrier.attrs.vision);

  // VISION chooses valuable options; PASSING executes (execution is PassModel).
  // Decision scores lean on vision for ambitious actions and passing for short reliability.

  const shortT = choosePassTarget(carrier, teammates, opponents, ball, 0, 0, "short", passOpts);
  const throughT = choosePassTarget(carrier, teammates, opponents, ball, goalX - carrier.x, 0, "through", passOpts);
  // Long balls aim up the pitch — never bias toward the opposite wing.
  const longT = choosePassTarget(carrier, teammates, opponents, ball, goalX - carrier.x, 0, "long", passOpts);
  const crossT = choosePassTarget(carrier, teammates, opponents, ball, goalX - carrier.x, -Math.sign(carrier.z || 1), "cross", passOpts);

  const forwardMate = shortT ? ((shortT.x - carrier.x) * carrier.attackSign) : 0;
  const lane = shortT ? passingLaneQuality(carrier, shortT.x, shortT.z, opponents) : 0.2;
  const longShot = longShotOpportunity(carrier, opponents);
  const recycleTarget =
    shortT && isBackwardPass(carrier, shortT.x, shortT.z) && !forbid.has(shortT.id)
      ? shortT
      : teammates.find((t) => {
          if (t.id === carrier.id || t.isGK || forbid.has(t.id)) return false;
          if (!isBackwardPass(carrier, t.x, t.z)) return false;
          const roleOk = t.slot.includes("CB") || t.slot === "LB" || t.slot === "RB" || t.slot.includes("DM");
          return roleOk && passingLaneQuality(carrier, t.x, t.z, opponents) > 0.45 && carrier.distTo(t.x, t.z) < 22;
        }) ?? null;

  const panic = (1 - comp) * pressure;
  let passScore =
    (0.28 + pressure * 0.42 + (forwardMate > 4 ? 0.14 : 0) + lane * 0.52 + vision * 0.14 + passing * 0.3) * urgency + panic * 0.22;
  if (congested) passScore += 0.48;
  if (!shortT) passScore *= 0.28;
  else passScore += 0.28 + lane * 0.28;
  // Strongly prefer open lanes — clogged outlets should not win the decision.
  if (shortT && lane < 0.42) passScore *= 0.55;
  else if (shortT && lane > 0.7) passScore += 0.22;
  if (possessionTime < 0.4 && pressure < 0.22 && !congested && !wantBuildup) passScore *= 0.9;
  const goMate = teammates.find((t) => {
    if (t.giveAndGoTimer <= 0.15 || t.id === carrier.id || t.isGK) return false;
    if (forbid.has(t.id)) return false;
    const dist = carrier.distTo(t.x, t.z);
    if (dist < 8.5) return false;
    const ahead = (t.x - carrier.x) * carrier.attackSign;
    if (ahead < 3.5) return false;
    return passingLaneQuality(carrier, t.x, t.z, opponents) > 0.45;
  });
  if (goMate) {
    passScore += 0.28 + (possessionTime < 2.2 ? 0.1 : 0);
  }

  const closeSupport =
    shortT && carrier.distTo(shortT.x, shortT.z) < 9 && Math.abs(shortT.z - carrier.z) < 7 && forwardMate < 5;
  const freeMan =
    shortT && lane > 0.58 && carrier.distTo(shortT.x, shortT.z) >= 7 && (forwardMate > 2 || Math.abs(shortT.z - carrier.z) > 6);

  let runScore =
    (0.22 + space.score * 0.28 + drib * 0.22 + pace * 0.16 + attAw * 0.18 - pressure * 0.32) *
    tuning.attackingRunMultiplier *
    (1.18 - urgency * 0.12);
  if (congested && space.kind === "forward") runScore *= 0.28;
  if (space.kind === "diagonal" || space.kind === "lateral") runScore += 0.18;
  if (space.kind === "back" && pressure > 0.45) runScore += 0.08;
  if (pressure > 0.55 && space.score < 1.2) runScore *= 0.4;
  if (pressure < 0.32 && space.score > 1.4) runScore += 0.28;
  // Open grass ahead: carry / attack — do not recycle the moment the ball arrives.
  const openCarry = pressure < 0.34 && space.score > 1.35 && space.kind !== "back" && !congested;
  if (openCarry) {
    runScore += 0.42 + pace * 0.18 + drib * 0.12;
    passScore *= 0.58;
  }
  // Close support: carry briefly, but do not starve the pass forever.
  if (closeSupport && possessionTime < 1.6) {
    runScore += 0.22;
    passScore *= 0.82;
  } else if (closeSupport) {
    passScore += 0.18;
    runScore *= 0.72;
  }
  if (freeMan) passScore += 0.36 + lane * 0.18;

  const clearChance = clearChanceOpportunity(carrier, opponents);

  let shotScore = 0;
  if (distGoal < PENALTY_AREA_LENGTH + 0.5 && Math.abs(carrier.z) < 12) {
    // Box strikes should finish — keep spam gated by clearChance / canShoot floors below.
    shotScore = 0.22 + shoot * 0.42 + (1 - pressure) * 0.16 - (shortT && forwardMate > 6 ? 0.28 : 0);
    if (shortT && lane > 0.55 && forwardMate > 4 && clearChance.quality < 0.45) shotScore *= 0.62;
  }

  let longShotScore = 0;
  if (longShot.inZone) {
    longShotScore =
      (0.1 + longS * 0.34 + shoot * 0.14 + (1 - pressure) * 0.12) * tuning.longShotDecisionMultiplier;
    if (longS < 0.55) longShotScore *= 0.35;
    if (shortT && forwardMate > 6 && lane > 0.55) longShotScore *= 0.42;
    if (!longShot.open) longShotScore *= 0.45;
    if ((wantBuildup || building) && clearChance.quality < 0.4) longShotScore *= 0.45;
    // Central pockets invite a strike rather than forced recycling.
    if (Math.abs(carrier.z) < 10 && progress > 0.52 && longS > 0.5) longShotScore += 0.14;
  }
  if (longShot.blocked) longShotScore *= 0.1;

  let throughBallScore = throughT
    ? Math.max(
        0,
        (0.14 + vision * 0.32 + passing * 0.08 + Math.min(14, (throughT.x - carrier.x) * carrier.attackSign) * 0.022) *
          (0.82 + urgency * 0.28),
      )
    : 0;
  if (throughT) {
    let thruSpace = 40;
    for (const op of opponents) {
      if (op.isGK) continue;
      thruSpace = Math.min(thruSpace, throughT.distTo(op.x, op.z));
    }
    const thruLane = passingLaneQuality(carrier, throughT.x, throughT.z, opponents);
    const thruAhead = (throughT.x - carrier.x) * carrier.attackSign;
    // Onside runner with space ahead beats endless recirculation.
    if (thruAhead > 4 && thruSpace > 4.5 && thruLane >= 0.5) {
      throughBallScore += 0.22 + vision * 0.12 + Math.min(0.18, (thruSpace - 4) * 0.04);
    }
    // Reward playing into a stretcher sitting on / beyond the line (risk → offside).
    const line = offsideLineX(opponents, carrier.attackSign);
    const depth = (throughT.x - line) * carrier.attackSign;
    if (depth > -0.4 && depth < 2.8 && thruAhead > 5) {
      throughBallScore += 0.16 + vision * 0.08;
    }
  }
  throughBallScore += styleW.throughBonus + arch.progressiveRisk * 0.12;
  if (throughT && isWideAttacker(throughT) && (throughT.x - carrier.x) * carrier.attackSign > 5) {
    throughBallScore += wantBuildup ? 0.1 : 0.2 + vision * 0.08;
  }
  if (throughT && Math.abs(throughT.z) > 18) throughBallScore *= 0.55;
  let longPassScore = longT
    ? (pressure > 0.55 || directTeam || (Math.abs(carrier.z) > 16 && progress < 0.4)
        ? 0.16 +
          stat01(carrier.attrs.longPassing) * 0.2 +
          vision * 0.1 +
          styleW.longBonus +
          (directTeam ? 0.28 : 0.08)
        : 0.08 + vision * 0.06 + styleW.longBonus * 0.85 + style.longBias * 0.12)
    : 0.01;
  if (longT) {
    const longWidth = Math.abs(longT.z - carrier.z);
    const longAhead = (longT.x - carrier.x) * carrier.attackSign;
    // Route-one: reward vertical long; still punish flat switches.
    if (directTeam && longAhead > 12 && longWidth < 14) longPassScore += 0.32 + style.longBias * 0.22;
    else if (longWidth > 16 && longAhead < 8) longPassScore *= 0.48;
    else if (longWidth > 20) longPassScore *= 0.55;
    else if (longWidth > 14) longPassScore *= 0.85;
    if (longAhead > 10 && longWidth < 16) longPassScore += 0.18 + vision * 0.08;
    else if (longAhead > 14 && longWidth < 20) longPassScore += 0.12;
  }
  const boxMate = teammates.some(
    (t) =>
      t.id !== carrier.id &&
      !t.isGK &&
      (t.x - carrier.x) * carrier.attackSign > 4 &&
      Math.abs(t.x - goalX) < PENALTY_AREA_LENGTH + 6 &&
      Math.abs(t.z) < 16,
  );
  let crossScore =
    crossT && distGoal < 38 && Math.abs(carrier.z) > 12 ? 0.18 + passing * 0.14 + (wide ? 0.16 : 0) : 0;
  if (wide && progress > 0.55 && Math.abs(carrier.z) > 14 && distGoal < 42) {
    crossScore += 0.22 + (1 - pressure) * 0.12;
  }
  if (boxMate && Math.abs(carrier.z) > 11 && distGoal < 40) {
    crossScore += 0.2 + passing * 0.08;
  }
  let holdScore = Math.max(0.04, 0.14 - pressure * 0.22 - (urgency - 1) * 0.12) * comp;
  if (openCarry) holdScore *= 0.7;
  // Stall breaker — longer window so players have think time; only dump if a lane exists.
  const stallT = 3.6 / Math.max(0.85, style.tempo);
  if (possessionTime > stallT) {
    holdScore *= 0.45;
    if (shortT && lane > 0.48) passScore += 0.18 + (freeMan ? 0.12 : 0);
    else if (directTeam && (throughT || longT)) {
      throughBallScore += 0.16;
      longPassScore += 0.14;
    } else {
      holdScore += 0.08;
      runScore += 0.1;
    }
    runScore *= 0.9;
  }
  if (possessionTime > stallT + 2.2) {
    holdScore *= 0.28;
    if (shortT && lane > 0.4) passScore += 0.22;
    else if (throughT) throughBallScore += 0.18;
    else if (longT) longPassScore += 0.16;
  }

  // MatchBrain role model + position archetype.
  passScore += roleBias.pass + styleW.shortBonus + arch.safeRecycle * 0.1;
  runScore += roleBias.run + arch.stretchRun * 0.08;
  throughBallScore = Math.max(0, throughBallScore + roleBias.through);
  crossScore = Math.max(0, crossScore + roleBias.cross);
  holdScore = Math.max(0, holdScore + roleBias.hold);
  shotScore = Math.max(0, shotScore + roleBias.shot + arch.finishBias * 0.08);
  if (footRole === "CB" || footRole === "DM") longPassScore += pressure > 0.4 ? 0.12 : -0.05;
  if (footRole === "FB" || footRole === "W" || footRole === "WM") {
    if (Math.abs(carrier.z) > 12 && distGoal < 40) crossScore += 0.14;
  }

  // Gilt-edged / near-open-goal: shoot — keeper may still dive, but pass is wrong.
  if (clearChance.quality > 0.55) {
    shotScore = Math.max(
      shotScore,
      0.62 + clearChance.quality * 0.95 + shoot * 0.28 + (clearChance.gkExposed ? 0.22 : 0.08),
    );
    passScore *= 1 - clearChance.quality * 0.6;
    holdScore *= 0.22;
    runScore *= 0.4;
    throughBallScore *= 0.35;
    longPassScore *= 0.2;
    crossScore *= 0.35;
  }
  // CanShoot hard gate — only force the finish on a genuine clear chance.
  if (canShoot(carrier, opponents) && clearChance.quality >= 0.42 && possessionTime > 0.45) {
    shotScore = Math.max(shotScore, 0.82 + shoot * 0.2);
    passScore *= 0.48;
    holdScore *= 0.18;
    throughBallScore *= 0.35;
  }
  // Phase weights: transition = progressive; chance = shoot/through; build = recycle.
  const phase = matchPhase(carrier, ball, carrier.side, {
    distGoal,
    chanceQuality: clearChance.quality,
  });
  if (phase === "transition") {
    throughBallScore += 0.22 + style.transitionBurst * 0.35;
    runScore += 0.12 + (counterTeam ? 0.14 : 0);
    holdScore *= counterTeam ? 0.35 : 0.55;
    longPassScore += 0.08 + (counterTeam ? 0.06 : 0);
    if (counterTeam) passScore *= 0.82;
  } else if (phase === "chance") {
    shotScore += 0.28;
    throughBallScore += 0.1;
    passScore *= 0.72;
    holdScore *= 0.2;
  } else if (phase === "build") {
    passScore += 0.12 + (style.id === "possession" ? 0.14 : 0);
    throughBallScore *= counterTeam || style.id === "possession" ? 0.72 : 0.85;
    if (counterTeam) longPassScore *= 0.55;
  }

  if (building || wantBuildup) {
    holdScore *= style.id === "possession" ? 0.95 : 0.82;
    // Softened pass stack so RUN/HOLD can compete after receive dwell.
    passScore += 0.28 + passing * 0.14 + lane * 0.16 + styleW.shortBonus * 0.28;
    runScore *= closeSupport ? 1.05 : 0.72;
    // Style-aware crush: possession kills long; direct keeps progressive alive.
    const phaseW = playStylePassWeights(style, { phase });
    throughBallScore *= throughT && throughBallScore > 0.28 ? Math.max(0.78, phaseW.buildupCrush + 0.22) : Math.max(0.55, phaseW.buildupCrush);
    // Keep progressive long outlets alive — was crushed to near-zero in sims.
    longPassScore *= pressure > 0.55 ? 0.88 : directTeam ? 1.05 : counterTeam ? 0.78 : 0.85;
    if (longT && !wantBuildup) longPassScore += 0.12;
    if (longT && pressure > 0.4) longPassScore += 0.16;
    // Don't suppress finishing when the chance is already there.
    if (clearChance.quality < 0.4) {
      shotScore *= 0.35;
      longShotScore *= 0.25;
    }
    if (progress < 0.5 && clearChance.quality < 0.4) {
      passScore += 0.22;
      runScore *= 0.62;
      holdScore += 0.12;
      longPassScore *= directTeam ? 0.85 : 0.72;
      shotScore *= 0.2;
    } else if (progress < 0.5) {
      passScore += 0.1;
      if (longT && longPassScore > 0.12) longPassScore += 0.06;
    }
    if (recycleTarget && pressure > 0.5 && possessionTime > 0.9 && !closeSupport && !openCarry) {
      passScore += 0.1;
    }
    if (shortT && lane > 0.55 && Math.abs(shortT.z - carrier.z) > 8 && progress < 0.62) {
      const ahead = (shortT.x - carrier.x) * carrier.attackSign;
      const width = Math.abs(shortT.z - carrier.z);
      // Progressive switch OK; flat cross-field dump is not build-up.
      if (width > 14 && ahead < 5) passScore *= 0.42;
      else if (width > 18 && ahead < 8) passScore *= 0.55;
      else passScore += ahead > 3 ? 0.22 : width < 12 ? 0.14 : 0.05;
    }
    if (shortT && carrier.distTo(shortT.x, shortT.z) < 16 && lane > 0.45 && Math.abs(shortT.z - carrier.z) < 12) {
      passScore += 0.22;
    }
  } else if (progress < 0.62 && pressure < 0.42 && clearChance.quality < 0.4) {
    holdScore += 0.12;
    passScore += 0.14;
    runScore *= 0.85;
    shotScore *= 0.7;
  }

  if (striker && progress > 0.68) {
    runScore += 0.28;
    if (space.kind === "forward" || space.kind === "diagonal") runScore += 0.22;
    holdScore *= 0.35;
    passScore *= 0.9;
    // Only stack shot intent in a real shooting pocket with a clear lane.
    if (distGoal < 18 && Math.abs(carrier.z) < 11 && !longShot.blocked) {
      shotScore += 0.28 + shoot * 0.18;
    }
    if (longShot.open && longS > 0.55) longShotScore += 0.12;
    if (distGoal < PENALTY_AREA_LENGTH + 2 && Math.abs(carrier.z) < 10) shotScore += 0.18;
    if (shortT && lane > 0.6 && forwardMate > 5 && clearChance.quality < 0.45) {
      passScore += 0.2;
      shotScore *= 0.65;
    }
  } else if (striker && clearChance.quality < 0.4) {
    runScore += 0.08;
    passScore += 0.32;
    holdScore *= 0.75;
    throughBallScore += 0.06;
    shotScore *= 0.55;
  }

  if (wide && progress > 0.48 && pressure < 0.6) {
    // Cut inside / find a pass rather than sprinting into the corner flag.
    runScore += 0.08;
    if (space.kind === "diagonal") runScore += 0.16;
    holdScore *= 0.45;
    if (shortT && forwardMate > 1 && lane > 0.48) {
      passScore += 0.38;
      runScore *= 0.58;
    }
    if (shortT && Math.abs(shortT.z - carrier.z) > 14) {
      const ahead = (shortT.x - carrier.x) * carrier.attackSign;
      if (ahead < 5) passScore -= 0.18;
    }
    if (Math.abs(carrier.z) > 15) {
      runScore *= 0.42;
      passScore += 0.28;
      crossScore += progress > 0.58 ? 0.22 : 0.08;
      holdScore *= 0.5;
    }
    if (progress > 0.62 && distGoal < 36) {
      crossScore += 0.16;
      passScore += 0.12;
    }
  }
  // Any carrier pinned wide: prefer recycle / cut-back over driving the flag.
  if (Math.abs(carrier.z) > 18) {
    runScore *= 0.5;
    passScore += 0.22;
    holdScore *= 0.55;
  }

  if (midfield && progress < 0.78) {
    passScore += 0.22;
    holdScore *= 0.7;
    throughBallScore *= 1.08;
    // Midfielders must keep long / switch outlets — 0.22 crush killed ~all long passes.
    longPassScore *= directTeam ? 0.95 : 0.72;
    if (Math.abs(carrier.z) < 14) runScore += 0.08;
    if (shortT && Math.abs(shortT.z - carrier.z) > 9) {
      const ahead = (shortT.x - carrier.x) * carrier.attackSign;
      passScore += ahead > 5 ? 0.14 : ahead > 2 ? 0.04 : -0.22;
    }
    if (recycleTarget && !closeSupport && !openCarry && pressure > 0.4) passScore += 0.12;
  }

  // Prefer a progressive switch; flat midfield switches are weak.
  if (shortT && Math.abs(shortT.z - carrier.z) > 11 && lane > 0.4 && clearChance.quality < 0.45) {
    const ahead = (shortT.x - carrier.x) * carrier.attackSign;
    passScore += ahead > 6 ? 0.12 : ahead > 3 ? 0.02 : -0.28;
  }
  let longPassScoreAdj = longPassScore;
  if (longT && Math.abs(longT.z - carrier.z) > 12) {
    const ahead = (longT.x - carrier.x) * carrier.attackSign;
    // Only reward long diagonals that clearly advance; never flat switches.
    longPassScoreAdj += ahead > 10 ? 0.06 : ahead > 6 ? -0.12 : -0.45;
  }
  // Short circulation still preferred, but not stacked enough to bury through balls.
  if (shortT && lane > 0.42) {
    passScore += 0.08 + (wantBuildup ? 0.05 : 0);
  }
  // When a through runner is on, pull short down so THROUGH can compete.
  if (throughT && throughBallScore > 0.28) {
    passScore *= 0.88;
    throughBallScore += 0.12;
  }
  longPassScoreAdj *= wantBuildup ? (pressure > 0.5 ? 0.95 : 0.9) : 1.05;
  // When short lanes are clogged, elevate progressive long / through.
  if (shortT && lane < 0.42 && longT && longPassScoreAdj > 0.1) {
    longPassScoreAdj += 0.14;
    passScore *= 0.88;
  }
  if (!shortT && longT) longPassScoreAdj += 0.18;

  // Final floor: only gilt-edged chances must outrank recycle/pass.
  if (clearChance.quality > 0.62 && possessionTime > 0.5) {
    shotScore = Math.max(shotScore, 0.82 + clearChance.quality * 0.65 + shoot * 0.15);
    passScore = Math.min(passScore, shotScore - 0.08);
    runScore = Math.min(runScore, shotScore - 0.15);
    holdScore = Math.min(holdScore, 0.1);
  }

  const scores: AttackScores = {
    passScore,
    runScore,
    shotScore,
    longShotScore,
    throughBallScore,
    longPassScore: longPassScoreAdj,
    crossScore,
    holdScore,
  };

  const ranked: { action: AttackAction; score: number; type: PassType; target: Player | null }[] = [
    { action: "PASS", score: passScore, type: "short", target: shortT },
    { action: "RUN", score: runScore, type: "short", target: null },
    { action: "SHOT", score: shotScore, type: "short", target: null },
    { action: "LONG_SHOT", score: longShotScore, type: "short", target: null },
    { action: "THROUGH", score: throughBallScore, type: "through", target: throughT },
    { action: "LONG_PASS", score: longPassScoreAdj, type: "long", target: longT },
    { action: "CROSS", score: crossScore, type: "cross", target: crossT },
    { action: "HOLD", score: holdScore, type: "short", target: null },
  ];
  ranked.sort((a, b) => b.score - a.score);
  const pick = pickAttackAction(ranked, ctx.rng ?? Math.random);
  let passTarget = pick.target;
  if (pick.action === "PASS") {
    // Give-and-go only when the return is progressive — never a forced bounce-back.
    if (goMate && (goMate.x - carrier.x) * carrier.attackSign > 3.5) {
      passTarget = goMate;
    } else if (
      recycleTarget &&
      wantBuildup &&
      pressure > 0.48 &&
      !openCarry &&
      !closeSupport &&
      forwardMate < 2 &&
      (ctx.rng ?? Math.random)() < 0.12 &&
      (!passTarget || passingLaneQuality(carrier, recycleTarget.x, recycleTarget.z, opponents) >= lane - 0.05)
    ) {
      // Recycle only under real pressure with no forward outlet — not a random build-up habit.
      passTarget = recycleTarget;
    }
  }
  if (passTarget && forbid.has(passTarget.id)) {
    passTarget = shortT && !forbid.has(shortT.id) ? shortT : null;
  }
  if (passTarget && carrier.distTo(passTarget.x, passTarget.z) < 7.5 && Math.abs(passTarget.z - carrier.z) < 6) {
    // Too tight to keep recycling — force a carry instead when that was the only short option.
    if (pick.action === "PASS" && runScore >= passScore - 0.2) {
      return {
        action: "RUN",
        scores: { ...scores, runScore: runScore + 0.15 },
        space,
        passTarget: null,
        passType: "short",
      };
    }
  }
  return {
    action: pick.action,
    scores,
    space,
    passTarget,
    passType: pick.type,
  };
}

export function pickAttackAction<T extends { score: number }>(ranked: T[], rng: () => number = Math.random): T {
  const viable = ranked.filter((r) => r.score > 0.04);
  const top = viable[0] ?? ranked[0];
  const second = viable[1];
  if (!second || top.score > second.score + 0.22) return top;
  const t = Math.exp(top.score * 2.4);
  const s = Math.exp(second.score * 2.4);
  return rng() * (t + s) < t ? top : second;
}

/** v0.4 pass urge per frame — used as a baseline comparison, not as live logic. */
export function v04PassUrge(pressure: number, possessionTime: number): number {
  return 0.008 + pressure * 0.045 + (possessionTime > 2.4 ? 0.02 : 0) + (possessionTime > 4 ? 0.03 : 0);
}
