import { clamp } from "../../core/math";
import type { Player } from "../players/Player";
import { attackingSupport } from "./AttackingAI";
import {
  awareness01,
  blockLineDepth,
  centreBackLineX,
  closeDownTarget,
  containTarget,
  coverShadowTarget,
  coverTarget,
  defensiveBlockFor,
  inCounterPressWindow,
  pressTarget,
  pressTrapTarget,
  selectClosingPlayers,
} from "./DefensiveAI";
import { designatePursuers, mustChaseLoose, roleShapeTarget, teamMatchPhase } from "./MatchBrain";
import { bestSupportSpot } from "./SupportSpotCalculator";
import type { Ball } from "../ball/Ball";
import { movePlayer } from "../players/PlayerMovement";
import type { GameplayTuning } from "../gameplay/GameplayTuning";
import type { SetPieceContext } from "./SetPieceAI";
import { setPieceTarget } from "./SetPieceAI";
import { pitchClamp } from "../pitch/PitchZones";
import { HALF_LENGTH } from "../constants";

export interface TeamAIResult {
  pressingId: string | null;
  /** Loose-ball primary pursuer (full press). */
  primaryPursuerId: string | null;
  /** Loose-ball support (contain only). */
  supportPursuerId: string | null;
}

export function updateTeamAI(
  players: Player[],
  side: "home" | "away",
  ball: Ball,
  possessingSide: "home" | "away" | null,
  dt: number,
  skipIds: Set<string>,
  extras?: {
    tuning?: GameplayTuning;
    grip?: number;
    setPiece?: SetPieceContext | null;
    kickOff?: boolean;
    keeperHold?: boolean;
    /** When set, these players close down instead of auto-selected closers. */
    forceClosers?: Player[];
    /** When false, skip automatic closer selection (user side uses Space/B press). */
    autoClosers?: boolean;
    /** Use aggressive pressTarget for forced closers. */
    aggressivePress?: boolean;
    /** Duration-aware stamina scale from the match clock. */
    matchDrainScale?: number;
    drainMul?: number;
    /** Seconds since possession last changed (counter-press window). */
    possessionChangeAge?: number;
    /** homeScore - awayScore from this side's perspective (positive = leading). */
    scoreDiff?: number;
    /** 0..1 through the match clock. */
    minute01?: number;
  },
): TeamAIResult {
  const us = players.filter((p) => p.side === side);
  const them = players.filter((p) => p.side !== side);
  const defending = possessingSide !== side;
  const autoClosers = extras?.autoClosers !== false;
  const forced = (extras?.forceClosers ?? []).filter((p) => p.side === side && !p.isGK && !p.celebrating);
  const looseBall = possessingSide == null;
  const pressWindow = 3.4 * (extras?.tuning?.counterPressWindowMultiplier ?? 1);
  const pressAggro = extras?.tuning?.counterPressAggressionMultiplier ?? 1;
  const counterPress =
    defending &&
    !looseBall &&
    inCounterPressWindow(extras?.possessionChangeAge ?? 99, pressWindow);
  const sample = us.find((p) => !p.isGK) ?? us[0];
  const ownGoal = sample?.ownGoalX() ?? (side === "home" ? -HALF_LENGTH : HALF_LENGTH);
  const attackSign = sample?.attackSign ?? (side === "home" ? 1 : -1);
  const block = defending
    ? defensiveBlockFor(ball.x, ownGoal, attackSign, extras?.scoreDiff ?? 0, extras?.minute01 ?? 0.5)
    : "mid";
  const blockDepth = blockLineDepth(block);
  let closers =
    defending && !extras?.kickOff && !extras?.keeperHold
      ? forced.length > 0
        ? forced
        : autoClosers
          ? selectClosingPlayers(us, ball, 2)
          : []
      : [];
  // MatchBrain: loose ball always has designated pursuers (Gameplay Football pattern).
  if (looseBall && !extras?.kickOff && !extras?.keeperHold && autoClosers) {
    const pursuers = designatePursuers(us, ball, 2);
    const ids = new Set(closers.map((p) => p.id));
    for (const p of pursuers) {
      if (!ids.has(p.id)) closers = [...closers, p].slice(0, 2);
    }
    if (!closers.length) closers = pursuers;
  }
  // Pursuit roles: primary full-presses; support contains only (no swarm).
  if (closers.length > 2) closers = closers.slice(0, 2);
  const primaryPursuer = closers[0] ?? null;
  const supportPursuer = closers[1] ?? null;
  const closerIds = new Set(closers.map((p) => p.id));
  const presser = primaryPursuer;
  const carrier = players.find((p) => p.hasBall && p.side === side) ?? null;
  const markedIds = new Set<string>();
  const coveringCbs = us.filter((p) => p.slot.includes("CB") && !closerIds.has(p.id) && !p.celebrating);
  const cbLineX = defending ? centreBackLineX(coveringCbs, ball.x, { blockDepth }) : null;
  // Buckland support-spot refresh (~3 Hz) when we have the ball.
  const supportSpot =
    !defending && carrier ? bestSupportSpot(carrier, them, { buildup: block === "low" || ball.x * attackSign < 0 }) : null;
  const moveEx = {
    accelMul: extras?.tuning?.movementAccelerationMultiplier,
    speedMul: extras?.tuning?.maxSpeedMultiplier,
    turnMul: extras?.tuning?.turnMultiplier,
    drainMul: extras?.drainMul ?? extras?.tuning?.staminaDrainMultiplier,
    matchDrainScale: extras?.matchDrainScale ?? 1,
    grip: extras?.grip,
  };
  const aggressive = !!extras?.aggressivePress && forced.length > 0;
  const attackPhase = teamMatchPhase(side, ball, possessingSide, attackSign, {
    transitionAge: extras?.possessionChangeAge ?? 99,
  });

  for (const p of us) {
    if (skipIds.has(p.id) || p.celebrating || p.sentOff || p.sliding || p.slideRecoverTimer > 0) continue;
    if (p.isGK) continue;
    p.giveAndGoTimer = Math.max(0, p.giveAndGoTimer - dt);
    if (extras?.kickOff) {
      movePlayer(p, dt, 0, 0, false, false, { hasBall: p.hasBall, pressure: 0, ...moveEx });
      continue;
    }
    if (extras?.keeperHold) {
      // Own team recycles to outlets; opposition must NOT hunt the keeper.
      let holdX = p.anchorX;
      let holdZ = p.anchorZ;
      if (defending) {
        const ownGoal = p.ownGoalX();
        holdX = clamp(p.anchorX * 0.42 + ownGoal * 0.12, -HALF_LENGTH + 8, HALF_LENGTH - 8);
        holdZ = clamp(p.anchorZ * 0.75, -22, 22);
        // Keep a respectful ring clear of the ball / GK.
        const awayX = holdX - ball.x;
        const awayZ = holdZ - ball.z;
        const clear = Math.hypot(awayX, awayZ);
        if (clear < 16) {
          const push = (16 - clear) / Math.max(0.4, clear);
          holdX += awayX * push;
          holdZ += awayZ * push;
        }
      }
      p.desiredX = holdX;
      p.desiredZ = holdZ;
      const dxk = holdX - p.x;
      const dzk = holdZ - p.z;
      const dsk = Math.hypot(dxk, dzk);
      if (dsk > 0.9) {
        // Walk back into shape — never sprint-press a keeper on the ball.
        movePlayer(p, dt, dxk, dzk, false, false, {
          hasBall: p.hasBall,
          pressure: 0,
          ...moveEx,
          speedMul: (moveEx.speedMul ?? 1) * (defending ? 0.62 : 0.78),
          drainMul: (moveEx.drainMul ?? 1) * 0.55,
        });
      } else {
        movePlayer(p, dt, 0, 0, false, false, {
          hasBall: p.hasBall,
          pressure: 0,
          ...moveEx,
          drainMul: (moveEx.drainMul ?? 1) * 0.35,
        });
      }
      continue;
    }
    if (extras?.setPiece) {
      const spot = setPieceTarget(p, extras.setPiece);
      p.desiredX = spot.x;
      p.desiredZ = spot.z;
      const dxs = spot.x - p.x;
      const dzs = spot.z - p.z;
      const ds = Math.hypot(dxs, dzs);
      const goalKick = extras.setPiece.kind === "GOAL_KICK";
      const corner = extras.setPiece.kind === "CORNER";
      const attacking = p.side === extras.setPiece.takingSide;
      // Corners: attackers arrive quickly; defenders are slower so a quick take can catch them out.
      // Goal kicks: walk to the mark; no sprint toward the six-yard box.
      const sprint = !goalKick && ds > (corner && !attacking ? 18 : 14);
      let speedMul = goalKick ? 0.58 : 0.85;
      if (corner) speedMul = attacking ? 0.98 : 0.52;
      if (ds > 0.6) {
        movePlayer(p, dt, dxs, dzs, sprint, false, {
          hasBall: p.hasBall,
          pressure: 0,
          ...moveEx,
          speedMul: (moveEx.speedMul ?? 1) * speedMul,
          drainMul: (moveEx.drainMul ?? 1) * (goalKick ? 0.4 : corner && !attacking ? 0.55 : 0.7),
        });
      } else {
        movePlayer(p, dt, 0, 0, false, false, {
          hasBall: p.hasBall,
          pressure: 0,
          ...moveEx,
          drainMul: (moveEx.drainMul ?? 1) * 0.3,
        });
      }
      continue;
    }
    let target = { x: p.anchorX, z: p.anchorZ };
    const aw = awareness01(p);
    if (defending) {
      const goalX = p.ownGoalX();
      if (closerIds.has(p.id)) {
        const loose = possessingSide == null;
        const ballDist = p.distTo(ball.x, ball.z);
        const trap = Math.abs(ball.z) > 14;
        const isPrimary = primaryPursuer?.id === p.id;
        const isSupport = supportPursuer?.id === p.id;
        // Loose: primary hunts; support contains / cuts the lane. Owned ball: prior behaviour.
        if (loose && isSupport && !aggressive) {
          target = containTarget(p, ball.x, ball.z, goalX);
        } else if (aggressive || counterPress || (loose && isPrimary) || (!loose && ballDist > 4)) {
          target =
            trap && !loose
              ? pressTrapTarget(p, ball.x, ball.z, goalX)
              : pressTarget(p, ball.x, ball.z, goalX);
        } else if (aw > 0.58 && !aggressive) {
          target = containTarget(p, ball.x, ball.z, goalX);
        } else {
          target = closeDownTarget(p, ball.x, ball.z, goalX);
        }
        let dx = target.x - p.x;
        let dz = target.z - p.z;
        // If the waypoint is underfoot but the ball is still away, chase the ball (primary only on loose).
        if (Math.hypot(dx, dz) < 0.35 && ballDist > 1.15 && (!loose || isPrimary)) {
          dx = ball.x - p.x;
          dz = ball.z - p.z;
        }
        const dist = Math.hypot(dx, dz);
        const sprint =
          (loose && isPrimary) || counterPress
            ? ballDist > 1.4
            : loose && isSupport
              ? false
              : dist > (aggressive ? 1.4 : 3.1 - aw * 1.5);
        p.desiredX = target.x;
        p.desiredZ = target.z;
        const huntMul =
          counterPress
            ? 1.05 + aw * 0.2 * pressAggro
            : aggressive || (loose && isPrimary)
              ? 1.05 + aw * 0.2
              : loose && isSupport
                ? 0.7 + aw * 0.25
                : 0.76 + aw * 0.42;
        movePlayer(p, dt, dx, dz, sprint, !loose && !aggressive && !counterPress && dist < 4.2, {
          hasBall: p.hasBall,
          pressure: 0,
          ...moveEx,
          speedMul: (moveEx.speedMul ?? 1) * huntMul * p.energy.pressMultiplier,
          accelMul: (moveEx.accelMul ?? 1) * (counterPress ? 1 + 0.18 * pressAggro : 1),
        });
        continue;
      }
      const cover = coverTarget(p, ball.x, ball.z, them, {
        teammates: us,
        closerIds,
        markedIds,
        lineX: cbLineX,
        looseBall,
      });
      const shape = roleShapeTarget(p, ball, possessingSide);
      // Cover + role block (Gameplay Football / GRF position model).
      let shapeW = shape.role === "CB" || shape.role === "DM" ? 0.55 : 0.4;
      target = {
        x: cover.x * (1 - shapeW) + shape.x * shapeW,
        z: cover.z * (1 - shapeW) + shape.z * shapeW,
      };
      // Cover shadow: CB sits behind the lead presser.
      if (shape.role === "CB" && presser && closerIds.has(presser.id)) {
        const shadow = coverShadowTarget(p, presser, ball.x, ball.z);
        target = { x: target.x * 0.55 + shadow.x * 0.45, z: target.z * 0.55 + shadow.z * 0.45 };
      }
    } else if (p.hasBall) {
      const dir = p.attackSign;
      const room = HALF_LENGTH - 2.5 - Math.abs(p.x);
      if (p.runTargetX !== 0 || p.runTargetZ !== 0) {
        target = pitchClamp(p.runTargetX, p.runTargetZ, 2.2);
      } else if (room < 4) {
        target = pitchClamp(p.x - dir * 3.5, p.z * 0.55, 2.5);
      } else {
        target = pitchClamp(p.x + dir * Math.min(8, room), p.z, 2.2);
      }
    } else {
      const support = attackingSupport(p, ball.x, ball.z, p.hasBall, carrier, us, them, attackPhase);
      const shape = roleShapeTarget(p, ball, possessingSide);
      // Role channels dominate for wide/FB; SupportAI owns CF/AM depth (avoid CF shape nudging past the line).
      const shapeW =
        shape.role === "W" || shape.role === "WM" || shape.role === "FB"
          ? 0.48
          : shape.role === "CF"
            ? 0.1
            : shape.role === "AM"
              ? 0.18
              : 0.38;
      target = {
        x: support.x * (1 - shapeW) + shape.x * shapeW,
        z: support.z * (1 - shapeW) + shape.z * shapeW,
      };
      // Blend toward the live support-spot grid (Buckland FindSupport).
      if (supportSpot && (shape.role === "CM" || shape.role === "AM" || shape.role === "CF" || shape.role === "WM")) {
        const sameSide = Math.sign(p.anchorZ || 1) === Math.sign(supportSpot.z || 1) || Math.abs(supportSpot.z) < 7;
        const pull = sameSide ? 0.28 : 0.12;
        target = {
          x: target.x * (1 - pull) + supportSpot.x * pull,
          z: target.z * (1 - pull) + supportSpot.z * pull,
        };
      }
    }
    target = pitchClamp(target.x, target.z, 2.2);
    p.desiredX = target.x;
    p.desiredZ = target.z;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.85) {
      if (p.hasBall) {
        // Soft carry — unit direction so movePlayer keeps intent (not a micro-delta stop).
        const cutIn = Math.abs(p.z) > 12 ? -Math.sign(p.z) * 0.45 : 0;
        const len = Math.hypot(p.attackSign, cutIn) || 1;
        movePlayer(p, dt, (p.attackSign / len) * 1.25, (cutIn / len) * 1.25, false, false, {
          hasBall: true,
          pressure: 0,
          ...moveEx,
        });
      } else if (mustChaseLoose(p, ball, possessingSide, primaryPursuer?.id ?? null)) {
        // Only the primary pursuer refuses to plant on a loose ball.
        const bx = ball.x - p.x;
        const bz = ball.z - p.z;
        movePlayer(p, dt, bx, bz, p.distTo(ball.x, ball.z) > 2.2, false, {
          hasBall: false,
          pressure: 0,
          ...moveEx,
        });
      } else {
        movePlayer(p, dt, 0, 0, false, false, { hasBall: p.hasBall, pressure: 0, ...moveEx });
      }
      continue;
    }
    // Sprint when covering real ground — attackers may burst onto progressive runs.
    const far = dist > 12;
    const progressive =
      !defending &&
      !p.hasBall &&
      dist > 10 &&
      (Math.abs(target.x - p.anchorX) > 5 || Math.abs(target.z - p.anchorZ) > 6);
    const energyOk = p.energy.value > 0.28;
    const wantSprint =
      energyOk &&
      ((far && defending) ||
        (p.hasBall && dist > 16) ||
        (progressive && dist > 11));
    movePlayer(p, dt, dx, dz, wantSprint, false, { hasBall: p.hasBall, pressure: 0, ...moveEx });
  }
  return {
    pressingId: presser?.id ?? null,
    primaryPursuerId: looseBall ? primaryPursuer?.id ?? null : null,
    supportPursuerId: looseBall ? supportPursuer?.id ?? null : null,
  };
}

