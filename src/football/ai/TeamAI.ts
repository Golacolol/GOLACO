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
import {
  classifyFootballRole,
  designatePursuers,
  mustChaseLoose,
  roleShapeTarget,
  teamMatchPhase,
} from "./MatchBrain";
import { playStyleProfile, type PlayStyleProfile } from "./PlayStyle";
import { positionArchetype } from "./PositionArchetype";
import { bestSupportSpot } from "./SupportSpotCalculator";
import type { Ball } from "../ball/Ball";
import { movePlayer } from "../players/PlayerMovement";
import type { GameplayTuning } from "../gameplay/GameplayTuning";
import type { SetPieceContext } from "./SetPieceAI";
import { setPieceTarget } from "./SetPieceAI";
import { pitchClamp } from "../pitch/PitchZones";
import { HALF_LENGTH, PITCH_LENGTH } from "../constants";

export interface TeamAIResult {
  pressingId: string | null;
  /** Loose-ball primary pursuer (full press). */
  primaryPursuerId: string | null;
  /** Support: contain-only shape, or the intentional second closer on a double-team. */
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
    /** Team play-style (route one vs possession). */
    playStyle?: PlayStyleProfile;
  },
): TeamAIResult {
  const us = players.filter((p) => p.side === side);
  const them = players.filter((p) => p.side !== side);
  const looseBall = possessingSide == null;
  // Our pass / loose ball after our touch stays attacking so support runs form in flight.
  const inFlightAttack = looseBall && ball.lastTouchSide === side;
  const defending = possessingSide !== side && !inFlightAttack;
  const autoClosers = extras?.autoClosers !== false;
  const forced = (extras?.forceClosers ?? []).filter((p) => p.side === side && !p.isGK && !p.celebrating);
  const playStyle = extras?.playStyle ?? playStyleProfile("balanced");
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
  // Default: ONE hunter. A second man is only drawn to the ball on an intentional
  // double-team (user forced >=2 closers, AI counter-press, or a touchline trap) —
  // that leaves someone exposed, which is what creates the pass / space.
  const touchlineTrap =
    defending && !looseBall && Math.abs(ball.z) > 18 && Math.abs(ball.x - ownGoal) > 28;
  const intentionalDouble =
    forced.length >= 2 ||
    (counterPress && pressAggro >= 1.0) ||
    (touchlineTrap && pressAggro >= 0.9);
  const closerSlots = intentionalDouble ? 2 : 1;
  let closers =
    defending && !extras?.kickOff && !extras?.keeperHold
      ? forced.length > 0
        ? forced.slice(0, closerSlots)
        : autoClosers
          ? selectClosingPlayers(us, ball, closerSlots)
          : []
      : [];
  if (
    forced.length > 0 &&
    intentionalDouble &&
    closers.length < closerSlots &&
    defending &&
    !extras?.kickOff &&
    !extras?.keeperHold
  ) {
    const have = new Set(closers.map((p) => p.id));
    for (const p of selectClosingPlayers(us, ball, closerSlots)) {
      if (!have.has(p.id) && closers.length < closerSlots) closers = [...closers, p];
    }
  }
  // Loose ball: designated pursuers, capped at the closer slots (one unless intentional double).
  // Skip when this is OUR pass in flight — teammates should offer support, not swarm the ball.
  if (looseBall && !inFlightAttack && !extras?.kickOff && !extras?.keeperHold && autoClosers) {
    const pursuers = designatePursuers(us, ball, closerSlots);
    const ids = new Set(closers.map((p) => p.id));
    for (const p of pursuers) {
      if (!ids.has(p.id)) closers = [...closers, p].slice(0, closerSlots);
    }
    if (!closers.length) closers = pursuers;
  }
  if (closers.length > closerSlots) closers = closers.slice(0, closerSlots);
  const primaryPursuer = closers[0] ?? null;
  // Second man only on an intentional double-team. Auto "contain support" was still
  // dragging an extra body into the centre scrum — leave shape intact instead.
  const supportPursuer = intentionalDouble && closers[1] ? closers[1]! : null;
  const closerIds = new Set(closers.map((p) => p.id));
  const presser = primaryPursuer;
  const onBall = players.find((p) => p.hasBall && p.side === side) ?? null;
  const carrier =
    onBall ??
    (inFlightAttack
      ? [...us]
          .filter((p) => !p.isGK && !p.celebrating)
          .sort((a, b) => a.distTo(ball.x, ball.z) - b.distTo(ball.x, ball.z))[0] ?? null
      : null);
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
        // Non-intentional support: contain only, held out of the collect ring.
        const containSupport = isSupport && !intentionalDouble;
        const arch = positionArchetype(p);
        const styleStand = playStyle.standOffBias;
        // Settled midfield possession: jockey / contain instead of crashing the collect ring.
        const settledCarry =
          !loose &&
          !aggressive &&
          !counterPress &&
          !intentionalDouble &&
          (extras?.possessionChangeAge ?? 99) > 0.85 &&
          Math.abs(ball.x) < 22;
        const standOff =
          !loose &&
          !aggressive &&
          !counterPress &&
          (settledCarry ||
            isSupport ||
            arch.standOff + styleStand * 0.55 > 0.68 ||
            (styleStand > 0.58 && !isPrimary) ||
            (aw > 0.55 && ballDist < 9));
        // Contain-first: high standOff / settled midfield never dive into the ring.
        const containPrimary =
          settledCarry &&
          isPrimary &&
          (ballDist < 5.2 || styleStand >= 0.45) &&
          !(aggressive || counterPress);
        if (containSupport || containPrimary) {
          // Hold a jockey gap — creates the lane instead of a permanent 50/50 duel.
          const raw = containTarget(p, ball.x, ball.z, goalX, Math.max(styleStand, 0.55));
          const away = Math.hypot(raw.x - ball.x, raw.z - ball.z) || 1;
          const hold = settledCarry ? 3.55 : 5.2;
          target =
            away < hold
              ? {
                  x: ball.x + ((raw.x - ball.x) / away) * hold,
                  z: ball.z + ((raw.z - ball.z) / away) * hold,
                }
              : raw;
        } else if (standOff && !isSupport) {
          target = containTarget(p, ball.x, ball.z, goalX, styleStand);
        } else if (
          aggressive ||
          counterPress ||
          isSupport ||
          (loose && isPrimary) ||
          (!loose && isPrimary && ballDist > 6.2 && styleStand < 0.42)
        ) {
          // Intentional second man (isSupport here) presses into the collect ring.
          target =
            trap && !loose
              ? pressTrapTarget(p, ball.x, ball.z, goalX)
              : pressTarget(p, ball.x, ball.z, goalX);
        } else if (aw > 0.52 && !aggressive) {
          target = containTarget(p, ball.x, ball.z, goalX, styleStand);
        } else {
          target = closeDownTarget(p, ball.x, ball.z, goalX);
        }
        let dx = target.x - p.x;
        let dz = target.z - p.z;
        // If the waypoint is underfoot but the ball is still away, chase the ball (primary only on loose).
        if (Math.hypot(dx, dz) < 0.35 && ballDist > 1.15 && !containSupport && (!loose || isPrimary)) {
          dx = ball.x - p.x;
          dz = ball.z - p.z;
        }
        const dist = Math.hypot(dx, dz);
        const sprint =
          (loose && isPrimary) || counterPress || (loose && isSupport && intentionalDouble)
            ? ballDist > 1.4
            : loose && containSupport
              ? false
              : dist > (aggressive ? 1.4 : 3.1 - aw * 1.5);
        p.desiredX = target.x;
        p.desiredZ = target.z;
        const huntMul =
          counterPress
            ? 1.05 + aw * 0.2 * pressAggro
            : aggressive || (loose && isPrimary) || (loose && isSupport && intentionalDouble)
              ? 1.05 + aw * 0.2
              : loose && containSupport
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
      // Cover + role block — attackers lean on mid-block shape so they actually drop.
      let shapeW =
        shape.role === "CB" || shape.role === "DM"
          ? 0.55
          : shape.role === "W" || shape.role === "WM"
            ? 0.94
            : shape.role === "CF" || shape.role === "AM"
              ? 0.82
              : 0.4;
      const widthW =
        shape.role === "W" || shape.role === "WM" || shape.role === "FB" ? Math.min(0.96, shapeW + 0.12) : shapeW;
      target = {
        x: cover.x * (1 - shapeW) + shape.x * shapeW,
        z: cover.z * (1 - widthW) + shape.z * widthW,
      };
      // Hard depth ceiling — high cover anchors must not leave W/WM parked upfield.
      if (shape.role === "W" || shape.role === "WM") {
        const maxProg = shape.role === "W" ? 0.34 : 0.36;
        const maxX = p.attackSign * (maxProg * PITCH_LENGTH - HALF_LENGTH);
        if ((target.x - maxX) * p.attackSign > 0) target.x = maxX;
      }
      // Wide defenders of the mid-block must hold the channel while dropping.
      if (shape.role === "W" || shape.role === "WM" || shape.role === "FB") {
        const side = Math.sign(p.anchorZ || 1) || 1;
        const floorZ = side * (shape.role === "FB" ? 22 : 20);
        if (Math.abs(target.z) < Math.abs(floorZ)) target.z = floorZ;
      }
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
      const support = attackingSupport(p, ball.x, ball.z, p.hasBall, carrier, us, them, attackPhase, playStyle);
      const shape = roleShapeTarget(p, ball, possessingSide);
      // Support runs dominate while we have (or just played) the ball — shape holds width.
      // Wide roles lean harder on channel shape so support runs don't collapse the flanks.
      const shapeW =
        shape.role === "FB"
          ? 0.94
          : shape.role === "W" || shape.role === "WM"
            ? 0.8
            : shape.role === "CF"
              ? attackPhase === "attack" || attackPhase === "chance" || attackPhase === "transition"
                ? 0.82
                : attackPhase === "build"
                  ? 0.6
                  : 0.36
              : shape.role === "AM"
                ? attackPhase === "attack" || attackPhase === "chance" || attackPhase === "transition"
                  ? 0.58
                  : 0.36
                : inFlightAttack
                  ? 0.22
                  : 0.3;
      const widthW =
        shape.role === "FB" || shape.role === "W" || shape.role === "WM" ? Math.min(0.97, shapeW + 0.22) : shapeW;
      target = {
        x: support.x * (1 - shapeW) + shape.x * shapeW,
        z: support.z * (1 - widthW) + shape.z * widthW,
      };
      // Pin wide roles to the touchline channel after the support blend.
      if (shape.role === "FB" || shape.role === "W" || shape.role === "WM") {
        const side = Math.sign(p.anchorZ || shape.z || 1) || 1;
        const floorZ = side * (shape.role === "FB" ? 24 : shape.role === "W" ? 23 : 21);
        if (Math.abs(target.z) < Math.abs(floorZ)) target.z = floorZ;
      }
      // CF / overlapping FB / WM / W: never let a deep support pocket erase the attacking height floor.
      if (
        (shape.role === "CF" ||
          shape.role === "FB" ||
          shape.role === "AM" ||
          shape.role === "WM" ||
          shape.role === "W") &&
        (attackPhase === "attack" ||
          attackPhase === "chance" ||
          attackPhase === "transition" ||
          attackPhase === "build")
      ) {
        const dir = p.attackSign;
        const advancedX = dir > 0 ? Math.max(support.x, shape.x) : Math.min(support.x, shape.x);
        const heightW =
          shape.role === "CF"
            ? 0.9
            : shape.role === "FB"
              ? 0.96
              : shape.role === "W"
                ? 0.84
                : shape.role === "WM"
                  ? 0.78
                  : 0.55;
        target.x = target.x * (1 - heightW) + advancedX * heightW;
        if (shape.role === "CF" && attackPhase !== "build") {
          const floor = dir * (0.78 * PITCH_LENGTH - HALF_LENGTH);
          if ((floor - target.x) * dir > 0) target.x = floor;
        }
        if (shape.role === "CF" && attackPhase === "build") {
          const floor = dir * (0.66 * PITCH_LENGTH - HALF_LENGTH);
          if ((floor - target.x) * dir > 0) target.x = target.x * 0.35 + floor * 0.65;
        }
        if (shape.role === "FB") {
          const ballProg = clamp((ball.x * dir + HALF_LENGTH) / PITCH_LENGTH, 0, 1);
          const sameFlank =
            Math.sign(p.anchorZ || 1) === Math.sign(ball.z || 1) || Math.abs(ball.z) < 14;
          // Same-flank overlaps start earlier; weak-side still steps into the final third late.
          const floorProg =
            attackPhase === "chance" || attackPhase === "transition"
              ? sameFlank
                ? 0.88
                : 0.8
              : attackPhase === "attack" || ballProg > 0.5
                ? sameFlank
                  ? 0.86
                  : 0.78
                : ballProg > 0.35
                  ? sameFlank
                    ? 0.8
                    : 0.7
                  : ballProg > 0.25
                    ? sameFlank
                      ? 0.7
                      : 0.58
                    : 0.54;
          const floor = dir * (floorProg * PITCH_LENGTH - HALF_LENGTH);
          if ((floor - target.x) * dir > 0) {
            target.x =
              attackPhase === "build" && ballProg < 0.35 && !sameFlank
                ? target.x * 0.15 + floor * 0.85
                : floor;
          }
        }
        if (
          (shape.role === "WM" || shape.role === "W") &&
          (attackPhase === "attack" || attackPhase === "chance" || attackPhase === "transition")
        ) {
          const floor = dir * ((shape.role === "W" ? 0.72 : 0.7) * PITCH_LENGTH - HALF_LENGTH);
          if ((floor - target.x) * dir > 0) target.x = target.x * 0.2 + floor * 0.8;
        }
        if ((shape.role === "WM" || shape.role === "W") && attackPhase === "build") {
          const floor = dir * (0.58 * PITCH_LENGTH - HALF_LENGTH);
          if ((floor - target.x) * dir > 0) target.x = target.x * 0.35 + floor * 0.65;
        }
      }
      // Blend toward the live support-spot grid (Buckland FindSupport).
      // Skip CF depth pull — the grid parks strikers too deep for a high line.
      // Wide roles: only take lateral pull if it stays/goes wider.
      if (supportSpot && (shape.role === "CM" || shape.role === "AM")) {
        const sameSide = Math.sign(p.anchorZ || 1) === Math.sign(supportSpot.z || 1) || Math.abs(supportSpot.z) < 7;
        const pull = sameSide ? (inFlightAttack ? 0.4 : 0.34) : 0.16;
        target = {
          x: target.x * (1 - pull) + supportSpot.x * pull,
          z: target.z * (1 - pull) + supportSpot.z * pull,
        };
      } else if (supportSpot && (shape.role === "WM" || shape.role === "W")) {
        const side = Math.sign(p.anchorZ || 1) || 1;
        if (Math.abs(supportSpot.z) >= Math.abs(target.z) - 1) {
          target.z = target.z * 0.55 + supportSpot.z * 0.45;
        }
        if (Math.abs(target.z) < 20) target.z = side * 22;
      } else if (supportSpot && shape.role === "CF") {
        const sameSide = Math.sign(p.anchorZ || 1) === Math.sign(supportSpot.z || 1) || Math.abs(supportSpot.z) < 7;
        const pull = sameSide ? 0.14 : 0.06;
        target = {
          x: target.x,
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
    // Sprint when covering real ground — attackers burst onto progressive / tracked runs.
    // Wide / front players must race back into the mid-block after turnover.
    const dropRole = classifyFootballRole(p);
    const wideDrop =
      defending &&
      (dropRole === "W" || dropRole === "WM" || dropRole === "CF") &&
      (p.x - target.x) * p.attackSign > 3.5;
    const fbOverlap =
      !defending &&
      (dropRole === "FB" || dropRole === "W" || dropRole === "WM") &&
      (target.x - p.x) * p.attackSign > 3.2 &&
      Math.abs(target.z) > 12;
    const far = dist > (wideDrop || fbOverlap ? 3.8 : 12);
    const runMul = extras?.tuning?.attackingRunMultiplier ?? 1;
    const progressive =
      !defending &&
      !p.hasBall &&
      dist > 8.5 &&
      (Math.abs(target.x - p.anchorX) > 4.5 || Math.abs(target.z - p.anchorZ) > 5.5);
    const energyOk = p.energy.value > 0.26;
    // Overlaps keep sprinting on fumes — arriving late is why final-third share stayed low.
    const overlapEnergyOk = dropRole === "FB" ? p.energy.value > 0.06 : p.energy.value > 0.12;
    const wantSprint =
      (energyOk &&
        ((far && defending) ||
          wideDrop ||
          (p.hasBall && dist > 14) ||
          (progressive && dist > 9.5 / Math.max(0.85, runMul)) ||
          (inFlightAttack && progressive && dist > 8))) ||
      (fbOverlap && overlapEnergyOk);
    const fbLag =
      !defending && dropRole === "FB" ? Math.max(0, (target.x - p.x) * p.attackSign) : 0;
    // Distance-scaled catch-up: overlaps were aiming high but never arriving (drift ~25m).
    const fbCatch =
      fbLag > 8 ? 1 + clamp(fbLag / 22, 0, 0.95) : fbOverlap && dropRole === "FB" ? 1.55 : 1;
    movePlayer(p, dt, dx, dz, wantSprint || fbLag > 10, false, {
      hasBall: p.hasBall,
      pressure: 0,
      ...moveEx,
      accelMul: (moveEx.accelMul ?? 1) * (fbLag > 8 ? 1.65 : fbOverlap ? 1.35 : 1),
      speedMul:
        (moveEx.speedMul ?? 1) *
        (fbCatch > 1
          ? fbCatch
          : fbOverlap
            ? 1.4
            : wideDrop
              ? 1.22
              : !defending && progressive
                ? clamp(0.95 + runMul * 0.08, 0.95, 1.12)
                : 1),
    });
  }
  return {
    pressingId: presser?.id ?? null,
    primaryPursuerId: looseBall ? primaryPursuer?.id ?? null : null,
    supportPursuerId: looseBall ? supportPursuer?.id ?? null : null,
  };
}

