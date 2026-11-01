import type { Player } from "../players/Player";
import { HALF_LENGTH, HALF_WIDTH, PITCH_LENGTH } from "../constants";
import { offsideLineX } from "../rules/Offside";
import { bestAvailableSpace } from "./SpaceField";
import { classifyFootballRole, type MatchPhase } from "./MatchBrain";
import { clamp, stat01 } from "../../core/math";
import type { PlayStyleProfile } from "./PlayStyle";

export type SupportRole =
  | "SUPPORT_BEHIND"
  | "SUPPORT_SIDE"
  | "OVERLAP"
  | "UNDERLAP"
  | "WIDE_OUTLET"
  | "FORWARD_RUN"
  | "CHECK_TO_BALL"
  | "PENALTY_AREA_RUN"
  | "EDGE_OF_BOX";

export function supportTarget(
  player: Player,
  ballX: number,
  ballZ: number,
  carrier: Player | null,
  teammates: Player[],
  opponents: Player[],
  phase?: MatchPhase,
  playStyle?: PlayStyleProfile,
): { x: number; z: number; role: SupportRole } {
  const dir = player.attackSign;
  const awareness = stat01(player.attrs.attackingAwareness ?? player.attrs.vision);
  const stretch = playStyle?.stretchBias ?? 0.55;
  const direct = playStyle?.id === "direct" || playStyle?.id === "routeOne";
  const counter = playStyle?.id === "counter";
  if (player.giveAndGoTimer > 0 && carrier) {
    const space = bestAvailableSpace(player, opponents, teammates, [8]);
    const x = dir > 0 ? Math.max(space.x, carrier.x + dir * 7) : Math.min(space.x, carrier.x + dir * 7);
    return keepOnside({ x, z: space.z, role: "FORWARD_RUN" }, player, carrier, opponents, playStyle);
  }
  const foot = classifyFootballRole(player);
  const wide = foot === "W" || foot === "WM";
  const st = foot === "CF";
  const cm = foot === "CM" || foot === "AM";
  const def = foot === "CB" || foot === "DM" || foot === "GK";
  const fb = foot === "FB";

  const progress = Math.max(0, Math.min(1, (ballX * dir + HALF_LENGTH) / PITCH_LENGTH));
  if (def || (foot === "CM" && progress < 0.42 && !direct && !(counter && phase === "transition"))) {
    return {
      x: player.anchorX + (ballX - player.anchorX) * (foot === "DM" ? 0.22 : 0.12),
      z: player.anchorZ + (ballZ - player.anchorZ) * (foot === "DM" ? 0.14 : 0.08),
      role: "SUPPORT_BEHIND",
    };
  }

  const idx = hashRole(player.id);
  const ballWide = Math.abs(ballZ) > 12;
  const deep = progress < 0.4;
  const progressivePhase =
    phase === "transition" || phase === "attack" || phase === "chance" || (direct && progress > 0.32);
  let role: SupportRole = "SUPPORT_SIDE";
  if (st) {
    // Prefer stretch height; check-to-feet only when the ball is still deep in true build-up.
    if (counter && phase !== "transition" && phase !== "chance" && progress < 0.5) {
      role = idx % 2 === 0 ? "CHECK_TO_BALL" : "FORWARD_RUN";
    } else if (counter && (phase === "transition" || progress > 0.5)) {
      role = idx % 2 === 0 ? "FORWARD_RUN" : "PENALTY_AREA_RUN";
    } else if (phase === "chance" || progress > 0.72) {
      role = idx % 2 === 0 ? "PENALTY_AREA_RUN" : "FORWARD_RUN";
    } else if (direct && stretch > 0.7 && progress > 0.35) {
      role = idx % 2 === 0 ? "FORWARD_RUN" : progress > 0.55 ? "PENALTY_AREA_RUN" : "EDGE_OF_BOX";
    } else if (progressivePhase) {
      // Advanced attack: stretch the line; mid-third still holds an edge-of-box floor.
      if (progress > 0.55) role = idx % 2 === 0 ? "PENALTY_AREA_RUN" : "FORWARD_RUN";
      else if (progress > 0.42) role = idx % 2 === 0 ? "FORWARD_RUN" : "EDGE_OF_BOX";
      else if (ballWide) role = idx % 2 === 0 ? "EDGE_OF_BOX" : "CHECK_TO_BALL";
      else role = idx % 2 === 0 ? "FORWARD_RUN" : "EDGE_OF_BOX";
    } else if (deep || (ballWide && progress < 0.42) || phase === "build") {
      role = progress > 0.4 ? (idx % 2 === 0 ? "FORWARD_RUN" : "EDGE_OF_BOX") : "CHECK_TO_BALL";
    } else if (progress > 0.55) {
      role = idx % 2 === 0 ? "PENALTY_AREA_RUN" : "EDGE_OF_BOX";
    } else {
      role = idx % 2 === 0 ? "FORWARD_RUN" : "EDGE_OF_BOX";
    }
  } else if (wide || fb) {
    // Full-backs / wingers stretch the channel first — overlap when space opens upfield.
    const sameFlank = Math.sign(player.anchorZ || 1) === Math.sign(ballZ || 1) || Math.abs(ballZ) < 10;
    if (fb) {
      // Deep build / ball behind the FB: show to feet instead of forced overlap.
      const ballBehind = (ballX - player.x) * dir < -1.5;
      const deepBuild = phase === "build" || progress < 0.28;
      if (deepBuild && (ballBehind || progress < 0.2 || !sameFlank)) {
        role = "CHECK_TO_BALL";
      } else if (progress > 0.18 && sameFlank) {
        role = progress > 0.28 || ballWide ? "OVERLAP" : "WIDE_OUTLET";
      } else if (progress > 0.32) role = sameFlank ? "OVERLAP" : "WIDE_OUTLET";
      else role = idx % 2 === 0 ? "WIDE_OUTLET" : "OVERLAP";
    } else if (progress > 0.55) {
      role = ballWide ? "OVERLAP" : idx % 2 === 0 ? "UNDERLAP" : "OVERLAP";
    } else {
      role = idx % 3 === 0 ? "OVERLAP" : idx % 3 === 1 ? "WIDE_OUTLET" : "UNDERLAP";
    }
  } else if (cm) {
    role =
      foot === "AM"
        ? progress > 0.42
          ? idx % 2 === 0
            ? "EDGE_OF_BOX"
            : "FORWARD_RUN"
          : "SUPPORT_SIDE"
        : progress > 0.58
          ? idx % 2 === 0
            ? "EDGE_OF_BOX"
            : "SUPPORT_SIDE"
          : "SUPPORT_SIDE";
  }

  const pushScale = 0.65 + awareness * 0.55;
  const push =
    (2 +
      progress *
        (st ? 12 : wide || fb ? 10 : foot === "AM" ? 11 : cm ? (progress < 0.5 ? 4 : 9) : 7)) *
    pushScale;
  let x = player.anchorX + dir * push;
  let z = player.anchorZ;
  if (!carrier) {
    return keepOnside({ x, z, role }, player, null, opponents, playStyle);
  }

  const aheadMul = 0.7 + awareness * 0.55;
  if (role === "SUPPORT_SIDE") {
    // Pocket beside the carrier, but keep the player's formation lane —
    // both CMs parking at carrier.z ± 8.5 collapses the whole midfield.
    x = carrier.x + dir * (2.2 + awareness * 1.2) * aheadMul;
    const lane = Math.sign(player.anchorZ || 1) || 1;
    const pocket = 8.5 + awareness * 1.2;
    z = player.anchorZ * 0.64 + (carrier.z + lane * pocket) * 0.36;
    if (Math.abs(player.anchorZ) > 9) {
      const floor = lane * Math.max(10, Math.abs(player.anchorZ) * 0.7);
      if (Math.abs(z) < Math.abs(floor)) z = z * 0.35 + floor * 0.65;
    }
  } else if (role === "OVERLAP") {
    // Track the furthest of carrier/ball so overlaps reach the final third.
    const refX = dir > 0 ? Math.max(carrier.x, ballX) : Math.min(carrier.x, ballX);
    const spacePush = progress > 0.55 ? 14 : progress > 0.4 ? 11.5 : progress > 0.28 ? 9 : 7;
    x = refX + dir * spacePush * aheadMul;
    if (fb) {
      const minProg = progress > 0.5 ? 0.84 : progress > 0.35 ? 0.72 : 0.58;
      const minX = dir * (minProg * PITCH_LENGTH - HALF_LENGTH);
      if ((minX - x) * dir > 0) x = minX;
      if (progress > 0.22) {
        const boxApproach = dir * (HALF_LENGTH - 7);
        x = x * 0.22 + (refX + dir * 24) * 0.38 + boxApproach * 0.4;
      }
    }
    z = Math.sign(player.anchorZ || 1) * (fb ? (progress > 0.5 ? 26 : 28) : progress > 0.55 ? 25 : 27);
    if (wide && !fb) {
      const minProg = progress > 0.5 ? 0.7 : 0.55;
      const minX = dir * (minProg * PITCH_LENGTH - HALF_LENGTH);
      if ((minX - x) * dir > 0) x = x * 0.35 + minX * 0.65;
    }
  } else if (role === "UNDERLAP") {
    x = carrier.x + dir * (progress > 0.5 ? 9 : 7) * aheadMul;
    z = carrier.z * 0.35 + Math.sign(player.anchorZ || 1) * (fb ? 16 : 12);
  } else if (role === "WIDE_OUTLET") {
    // Create the stretch pass: sit high and wide so the carrier has a lane out.
    const outletX = ballX * 0.18 + player.anchorX * 0.28 + dir * (fb ? 12 : 9) * aheadMul;
    const minAhead = carrier.x + dir * (fb ? 6.5 : 5.5);
    x = dir > 0 ? Math.max(outletX, minAhead) : Math.min(outletX, minAhead);
    // Level with / ahead of the ball — never sit behind the play as an "outlet".
    if (fb) {
      const level = ballX + dir * 2.5;
      x = dir > 0 ? Math.max(x, level) : Math.min(x, level);
      const minProg = progress > 0.35 ? 0.62 : progress > 0.22 ? 0.52 : 0.46;
      const minX = dir * (minProg * PITCH_LENGTH - HALF_LENGTH);
      if ((minX - x) * dir > 0) x = x * 0.2 + minX * 0.8;
    }
    z = Math.sign(player.anchorZ || 1) * (fb ? 28.5 : 26.5);
  } else if (role === "FORWARD_RUN") {
    // Sit near the line for a through-ball runway (keepOnside clamps legality).
    x = carrier.x + dir * (st ? 12 : foot === "AM" ? 11.5 : 10.5) * aheadMul;
    if (st) {
      const minProg = Math.max(0.68, progress + 0.06);
      const minX = dir * (minProg * PITCH_LENGTH - HALF_LENGTH);
      if ((minX - x) * dir > 0) x = minX;
    }
    z = player.anchorZ + (ballZ - player.anchorZ) * 0.18;
  } else if (role === "CHECK_TO_BALL") {
    if (fb) {
      // Pocket beside the ball on the FB's flank — receive and recycle, don't ghost upfield.
      x = ballX + dir * 2.2;
      z = Math.sign(player.anchorZ || 1) * Math.max(18, Math.min(26, Math.abs(player.anchorZ) * 0.88 + 2));
    } else {
      // Between ball and goal line but short of the last defender — ready to receive and lay off.
      x = carrier.x + dir * (st ? 3.6 : 3.5);
      if (st) {
        // Meet high — stay an attacking outlet, not a midfield drop.
        const meetProg = Math.max(0.64, Math.min(0.82, progress + 0.22));
        const meetX = dir * (meetProg * PITCH_LENGTH - HALF_LENGTH);
        x = x * 0.22 + meetX * 0.78;
      }
      z = carrier.z + Math.sign(player.anchorZ - carrier.z || 1) * (st ? 5.4 : 5.2);
    }
  } else if (role === "PENALTY_AREA_RUN") {
    x = carrier.x + dir * (st ? 12.5 : 11.5) * aheadMul;
    if (st) {
      const minProg = Math.max(0.7, progress + 0.08);
      const minX = dir * (minProg * PITCH_LENGTH - HALF_LENGTH);
      if ((minX - x) * dir > 0) x = minX;
    }
    z = player.anchorZ * 0.55 + carrier.z * 0.25;
  } else if (role === "EDGE_OF_BOX") {
    x = carrier.x + dir * (st ? 10 : foot === "AM" ? 12 : 11) * aheadMul;
    if (st) {
      const minProg = Math.max(0.66, progress + 0.05);
      const minX = dir * (minProg * PITCH_LENGTH - HALF_LENGTH);
      if ((minX - x) * dir > 0) x = minX;
    }
    z = carrier.z * 0.3 + player.anchorZ * 0.45;
  }

  if (awareness < 0.45) {
    x = x * 0.55 + player.anchorX * 0.45;
    z = z * 0.65 + player.anchorZ * 0.35;
  }

  // Keep shape: peel away from teammates already parking on this spot.
  const clustered = teammates.filter(
    (t) => t.id !== player.id && Math.hypot((t.desiredX || t.x) - x, (t.desiredZ || t.z) - z) < 5.5,
  ).length;
  if (clustered > 0) {
    z += Math.sign(player.anchorZ || 1) * (4.5 + clustered * 2.2);
    if (role === "CHECK_TO_BALL" || role === "SUPPORT_SIDE") x -= dir * clustered * 1.2;
  }
  // Don't crowd the carrier — leave a pocket.
  if (carrier && Math.hypot(x - carrier.x, z - carrier.z) < 4.2) {
    z += Math.sign(player.anchorZ - carrier.z || player.anchorZ || 1) * 5.5;
  }
  return keepOnside({ x: clamp(x, -HALF_LENGTH + 2.5, HALF_LENGTH - 2.5), z, role }, player, carrier, opponents, playStyle);
}

function keepOnside(
  spot: { x: number; z: number; role: SupportRole },
  player: Player,
  carrier: Player | null,
  opponents: Player[],
  playStyle?: PlayStyleProfile,
): { x: number; z: number; role: SupportRole } {
  let { x, z, role } = spot;
  const dir = player.attackSign;
  const isSt = player.slot.includes("ST") || player.position === "ST";
  const stretchBias = playStyle?.stretchBias ?? 0.55;
  if (opponents.length > 0) {
    const line = offsideLineX(opponents, player.attackSign);
    const isFb = player.slot === "LB" || player.slot === "RB" || player.slot === "LWB" || player.slot === "RWB";
    const fbChannelRun = isFb && (role === "OVERLAP" || role === "WIDE_OUTLET" || role === "UNDERLAP");
    // Stretch runs: pin just beyond the line so mistimed throughs can flag.
    // Other roles: soft onside buffer.
    const stretchRole = role === "FORWARD_RUN" || role === "PENALTY_AREA_RUN";
    if (fbChannelRun) {
      // Overlapping FBs must be allowed ahead of a deep defensive line — keepOnside
      // was parking them in midfield and killing final-third occupancy.
      const maxX = line + dir * (10 + stretchBias * 4);
      if ((x - maxX) * dir > 0) x = maxX;
    } else if (stretchRole && stretchBias > 0.4) {
      const beyond = (isSt ? 0.55 : 0.35) + stretchBias * 0.85;
      const stretchX = line + dir * beyond;
      // Pull onto the offside pocket when the natural spot is short of it.
      if ((stretchX - x) * dir > 0) x = stretchX;
      // Cap how far beyond so it's "barely" offside, not a free run.
      const maxOff = line + dir * (1.6 + stretchBias * 0.8);
      if ((x - maxOff) * dir > 0) x = maxOff;
    } else {
      const margin = isSt ? 0.12 : 0.08;
      const onsideX = line - dir * margin;
      if ((x - onsideX) * dir > 0) x = onsideX;
    }
  }
  if (carrier && isSt) {
    const stretch =
      role === "FORWARD_RUN" || role === "PENALTY_AREA_RUN"
        ? 8.5 + stretchBias * 4.0 + (player.attrs.pace / 100) * 2.8
        : role === "CHECK_TO_BALL"
          ? 5.5
          : 7.0 + stretchBias * 2.0;
    const maxAhead = carrier.x + dir * stretch;
    // Never drag the striker behind the defensive line just because the ball is deep —
    // a high CF line is the point; carrier-relative caps only curb overruns past the line.
    let cap = maxAhead;
    if (opponents.length > 0) {
      const line = offsideLineX(opponents, dir);
      const lineHold = line - dir * (role === "CHECK_TO_BALL" ? 0.8 : 0.25);
      cap = dir > 0 ? Math.max(maxAhead, lineHold) : Math.min(maxAhead, lineHold);
    } else {
      // No defenders: hold a mid/high floor so build-up still stretches.
      const floor = dir * (0.62 * PITCH_LENGTH - HALF_LENGTH);
      cap = dir > 0 ? Math.max(maxAhead, floor) : Math.min(maxAhead, floor);
    }
    if ((x - cap) * dir > 0) x = cap;
  }
  x = Math.max(-HALF_LENGTH + 2.5, Math.min(HALF_LENGTH - 2.5, x));
  z = Math.max(-HALF_WIDTH + 2.8, Math.min(HALF_WIDTH - 2.8, z));
  return { x, z, role };
}

export function triangleOptions(
  carrier: Player,
  teammates: Player[],
): { forward: number; lateral: number; recycle: number } {
  const dir = carrier.attackSign;
  let forward = 0;
  let lateral = 0;
  let recycle = 0;
  for (const t of teammates) {
    if (t.id === carrier.id) continue;
    const fx = (t.x - carrier.x) * dir;
    const lz = Math.abs(t.z - carrier.z);
    const d = Math.hypot(t.x - carrier.x, t.z - carrier.z);
    if (d < 4 || d > 28) continue;
    if (fx > 4) forward += 1;
    else if (fx < -2) recycle += 1;
    else if (lz > 4) lateral += 1;
  }
  return { forward, lateral, recycle };
}

function hashRole(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 3)) % 97;
  return n;
}
