import type { Player } from "../players/Player";
import { HALF_LENGTH, HALF_WIDTH, PITCH_LENGTH } from "../constants";
import { offsideLineX } from "../rules/Offside";
import { bestAvailableSpace } from "./SpaceField";
import { classifyFootballRole, type MatchPhase } from "./MatchBrain";
import { clamp, stat01 } from "../../core/math";

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
): { x: number; z: number; role: SupportRole } {
  const dir = player.attackSign;
  const awareness = stat01(player.attrs.attackingAwareness ?? player.attrs.vision);
  if (player.giveAndGoTimer > 0 && carrier) {
    const space = bestAvailableSpace(player, opponents, teammates, [8]);
    const x = dir > 0 ? Math.max(space.x, carrier.x + dir * 7) : Math.min(space.x, carrier.x + dir * 7);
    return keepOnside({ x, z: space.z, role: "FORWARD_RUN" }, player, carrier, opponents);
  }
  const foot = classifyFootballRole(player);
  const wide = foot === "W" || foot === "WM";
  const st = foot === "CF";
  const cm = foot === "CM" || foot === "AM";
  const def = foot === "CB" || foot === "DM" || foot === "GK";
  const fb = foot === "FB";

  const progress = Math.max(0, Math.min(1, (ballX * dir + HALF_LENGTH) / PITCH_LENGTH));
  if (def || (foot === "CM" && progress < 0.42)) {
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
    phase === "transition" || phase === "attack" || phase === "chance";
  let role: SupportRole = "SUPPORT_SIDE";
  if (st) {
    // True build: check to feet. Transition / attack / chance: stretch into a legal through channel.
    if (progressivePhase) {
      if (phase === "chance" || progress > 0.7) role = idx % 2 === 0 ? "PENALTY_AREA_RUN" : "FORWARD_RUN";
      else if (ballWide && deep) role = "CHECK_TO_BALL";
      else role = idx % 2 === 0 ? "FORWARD_RUN" : "SUPPORT_SIDE";
    } else if (deep || (ballWide && progress < 0.45) || phase === "build") {
      role = "CHECK_TO_BALL";
    } else if (progress > 0.68) {
      role = idx % 2 === 0 ? "PENALTY_AREA_RUN" : "EDGE_OF_BOX";
    } else {
      role = idx % 2 === 0 ? "FORWARD_RUN" : "SUPPORT_SIDE";
    }
  } else if (wide || fb) {
    if (progress > 0.55) role = ballWide ? "OVERLAP" : idx % 2 === 0 ? "UNDERLAP" : "OVERLAP";
    else role = idx % 3 === 0 ? "OVERLAP" : idx % 3 === 1 ? "WIDE_OUTLET" : "UNDERLAP";
  } else if (cm) {
    role =
      foot === "AM"
        ? progress > 0.5
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
    return keepOnside({ x, z, role }, player, null, opponents);
  }

  const aheadMul = 0.7 + awareness * 0.55;
  if (role === "SUPPORT_SIDE") {
    x = carrier.x + dir * 1.5 * aheadMul;
    z = carrier.z + (player.anchorZ >= 0 ? 7.5 : -7.5);
  } else if (role === "OVERLAP") {
    x = carrier.x + dir * (progress > 0.5 ? 8 : 6) * aheadMul;
    // Stay high and available — not pinned to the corner flag.
    z = Math.sign(player.anchorZ || 1) * (progress > 0.55 ? 13 : 15);
  } else if (role === "UNDERLAP") {
    x = carrier.x + dir * (progress > 0.5 ? 8 : 6) * aheadMul;
    z = carrier.z * 0.5 + Math.sign(player.anchorZ || 1) * 8;
  } else if (role === "WIDE_OUTLET") {
    const outletX = ballX * 0.15 + player.anchorX * 0.55 + dir * 6 * aheadMul;
    const minAhead = carrier.x + dir * 4;
    x = dir > 0 ? Math.max(outletX, minAhead) : Math.min(outletX, minAhead);
    z = Math.sign(player.anchorZ || 1) * 16;
  } else if (role === "FORWARD_RUN") {
    // Sit near the line for a through-ball runway (keepOnside clamps legality).
    x = carrier.x + dir * (st ? 7.5 : 9) * aheadMul;
    z = player.anchorZ + (ballZ - player.anchorZ) * 0.2;
  } else if (role === "CHECK_TO_BALL") {
    // Between ball and goal line but short of the last defender — ready to receive and lay off.
    x = carrier.x + dir * (st ? 3.4 : 2.8);
    z = carrier.z + Math.sign(player.anchorZ - carrier.z || 1) * (st ? 5.5 : 4.5);
  } else if (role === "PENALTY_AREA_RUN") {
    x = carrier.x + dir * (st ? 8 : 9) * aheadMul;
    z = player.anchorZ * 0.7 + carrier.z * 0.15;
  } else if (role === "EDGE_OF_BOX") {
    x = carrier.x + dir * (st ? 6.5 : 10) * aheadMul;
    z = carrier.z * 0.35 + player.anchorZ * 0.4;
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
  return keepOnside({ x: clamp(x, -HALF_LENGTH + 2.5, HALF_LENGTH - 2.5), z, role }, player, carrier, opponents);
}

function keepOnside(
  spot: { x: number; z: number; role: SupportRole },
  player: Player,
  carrier: Player | null,
  opponents: Player[],
): { x: number; z: number; role: SupportRole } {
  let { x, z, role } = spot;
  const dir = player.attackSign;
  const isSt = player.slot.includes("ST") || player.position === "ST";
  if (opponents.length > 0) {
    const line = offsideLineX(opponents, player.attackSign);
    // Thin onside buffer so strikers can occupy a legal channel ahead of midfield.
    const margin = isSt ? 1.05 : 0.85;
    const onsideX = line - dir * margin;
    if ((x - onsideX) * dir > 0) x = onsideX;
  }
  if (carrier && isSt) {
    const stretch =
      role === "FORWARD_RUN" || role === "PENALTY_AREA_RUN"
        ? 9.5 + (player.attrs.pace / 100) * 2.4
        : role === "CHECK_TO_BALL"
          ? 4.2
          : 7.2;
    const maxAhead = carrier.x + dir * stretch;
    if ((x - maxAhead) * dir > 0) x = maxAhead;
    // Only hard-hold deep in true build-up — mid-third must allow breaking runs.
    const ballProg = (carrier.x * dir + HALF_LENGTH) / PITCH_LENGTH;
    if (ballProg < 0.42 && role === "CHECK_TO_BALL") {
      const hold = carrier.x + dir * 5.5;
      if ((x - hold) * dir > 0) x = hold;
    }
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
