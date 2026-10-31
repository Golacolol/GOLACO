import * as THREE from "three";
import { clamp, lerp, normalize2 } from "../../core/math";
import type { PlayerAttributes, TeamKit } from "../../data/schema";
import { HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_LENGTH } from "../constants";
import { Player } from "../players/Player";
import { createPlayerVisual, updatePlayerAnimation } from "../players/PlayerVisual";

const ATTRS: PlayerAttributes = {
  pace: 72,
  passing: 55,
  longPassing: 50,
  vision: 70,
  control: 60,
  dribbling: 50,
  shooting: 30,
  finishing: 28,
  shotPower: 40,
  longShots: 30,
  defending: 40,
  strength: 62,
  stamina: 90,
  composure: 80,
};

/** Just outside each touchline so officials read as on the line, not among outfielders. */
export const AR_TOUCHLINE_OFFSET = 0.95;
export const AR_FAR_Z = -(HALF_WIDTH + AR_TOUCHLINE_OFFSET);
export const AR_NEAR_Z = HALF_WIDTH + AR_TOUCHLINE_OFFSET;

/** Referee top chase speed (m/s) — fit but not player-sprint. */
export const REF_MAX_SPEED = 6.4;
/** Assistant touchline chase speed (m/s). */
export const AR_MAX_SPEED = 7.2;
const REF_ACCEL = 14;
const AR_ACCEL = 16;
const ARRIVE_EPS = 0.35;
/** Once inside this ring on a set-piece, the referee stands still. */
const SET_PIECE_HOLD_EPS = 1.15;

/** Match referee — solid black kit with gold trim. */
const REF_KIT: TeamKit = {
  shirt: "#0a0a0a",
  shorts: "#0a0a0a",
  socks: "#0a0a0a",
  trim: "#f0d060",
  numberColor: "#f0d060",
};

/** Assistant referees — black kit, light trim (distinct from centre ref gold). */
const AR_KIT: TeamKit = {
  shirt: "#0c0c0c",
  shorts: "#0c0c0c",
  socks: "#0c0c0c",
  trim: "#f5f5f5",
  numberColor: "#ffffff",
};

export type OfficialRole = "ref" | "arFar" | "arNear";

/** Match phase that steers officials — set pieces keep them passive. */
export type OfficialsPhase =
  | "open"
  | "penalty"
  | "free_kick"
  | "goal_kick"
  | "corner"
  | "throw_in"
  | "spot"
  | "kick_off";

interface OfficialActor {
  player: Player;
  role: OfficialRole;
}

/** Far AR (−Z) covers the +X half; near AR (+Z) covers the −X half. */
export function assistantTargetX(ballX: number, coversPositiveHalf: boolean): number {
  let targetX: number;
  if (coversPositiveHalf) {
    targetX = ballX >= -6 ? ballX : -2;
  } else {
    targetX = ballX <= 6 ? ballX : 2;
  }
  return clamp(targetX, -HALF_LENGTH + 3.5, HALF_LENGTH - 3.5);
}

/** Diagonal referee spot: behind play, clear of the ball corridor. */
export function refereeTarget(ballX: number, ballZ: number): { x: number; z: number } {
  const sideBias = ballZ >= 0 ? -1 : 1;
  return {
    x: clamp(ballX - Math.sign(ballX || 1) * 5.5, -HALF_LENGTH + 10, HALF_LENGTH - 10),
    z: clamp(ballZ * 0.42 + sideBias * 7.5, -HALF_WIDTH + 8, HALF_WIDTH - 8),
  };
}

/**
 * Passive set-piece mark — well clear of the ball so the ref is not dancing on the spot.
 * Penalty: lateral of the box. Spot/FK: wide angle. Goal kick: toward the D / halfway.
 */
export function refereeSetPieceTarget(
  phase: OfficialsPhase,
  ballX: number,
  ballZ: number,
): { x: number; z: number } {
  const side = ballZ >= 0 ? -1 : 1;
  if (phase === "penalty" || phase === "spot") {
    const goalDir = Math.sign(ballX) || 1;
    const boxEdge = goalDir > 0 ? HALF_LENGTH - PENALTY_AREA_LENGTH : -HALF_LENGTH + PENALTY_AREA_LENGTH;
    return {
      x: clamp(boxEdge - goalDir * 3.5, -HALF_LENGTH + 12, HALF_LENGTH - 12),
      z: clamp(side * 11.5, -HALF_WIDTH + 6, HALF_WIDTH - 6),
    };
  }
  if (phase === "free_kick") {
    return {
      x: clamp(ballX - Math.sign(ballX || 1) * 9, -HALF_LENGTH + 12, HALF_LENGTH - 12),
      z: clamp(ballZ * 0.2 + side * 10, -HALF_WIDTH + 7, HALF_WIDTH - 7),
    };
  }
  if (phase === "goal_kick") {
    return {
      x: clamp(ballX * 0.15 + Math.sign(ballX || 1) * 8, -HALF_LENGTH + 14, HALF_LENGTH - 14),
      z: clamp(side * 9, -HALF_WIDTH + 8, HALF_WIDTH - 8),
    };
  }
  if (phase === "corner") {
    return {
      x: clamp(ballX * 0.55, -HALF_LENGTH + 14, HALF_LENGTH - 14),
      z: clamp(-Math.sign(ballZ || 1) * 8, -HALF_WIDTH + 8, HALF_WIDTH - 8),
    };
  }
  if (phase === "throw_in" || phase === "kick_off") {
    return {
      x: clamp(ballX - Math.sign(ballX || 1) * 4, -HALF_LENGTH + 12, HALF_LENGTH - 12),
      z: clamp(ballZ * 0.25 + side * 8, -HALF_WIDTH + 8, HALF_WIDTH - 8),
    };
  }
  return refereeTarget(ballX, ballZ);
}

export function isPassiveOfficialsPhase(phase: OfficialsPhase): boolean {
  return phase !== "open";
}

/** Move toward a point with capped speed (no exponential stick-to-target). */
export function chaseToward(
  x: number,
  z: number,
  vx: number,
  vz: number,
  targetX: number,
  targetZ: number,
  dt: number,
  maxSpeed: number,
  accel: number,
): { x: number; z: number; vx: number; vz: number; facing: number } {
  const dx = targetX - x;
  const dz = targetZ - z;
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVE_EPS) {
    return { x: targetX, z: targetZ, vx: 0, vz: 0, facing: Math.atan2(dx || 0, dz || 1) };
  }
  const dir = normalize2(dx, dz);
  // Ease down when close so he doesn't overshoot.
  const wantSpeed = Math.min(maxSpeed, dist * 2.4);
  let nvx = vx + dir.x * accel * dt;
  let nvz = vz + dir.z * accel * dt;
  const speed = Math.hypot(nvx, nvz);
  if (speed > wantSpeed && speed > 1e-6) {
    const s = wantSpeed / speed;
    nvx *= s;
    nvz *= s;
  }
  // Prefer heading along desired chase direction once moving.
  const blend = Math.min(1, dt * 8);
  nvx = lerp(nvx, dir.x * wantSpeed, blend * 0.55);
  nvz = lerp(nvz, dir.z * wantSpeed, blend * 0.55);
  return {
    x: x + nvx * dt,
    z: z + nvz * dt,
    vx: nvx,
    vz: nvz,
    facing: Math.atan2(dir.x, dir.z),
  };
}

/**
 * Match referee + two assistant referees.
 * - Referee: diagonal system in open play; holds a passive mark on set pieces / spot kicks.
 * - Assistants: one on each touchline; each covers one half and holds near halfway when play is away.
 */
export class MatchOfficials {
  readonly group = new THREE.Group();
  private actors: OfficialActor[] = [];
  private time = 0;

  constructor() {
    this.group.name = "matchOfficials";
    this.spawn("ref", "match_ref", 1, REF_KIT, 0, 0);
    this.spawn("arFar", "match_ar_far", 2, AR_KIT, -12, AR_FAR_Z);
    this.spawn("arNear", "match_ar_near", 3, AR_KIT, 12, AR_NEAR_Z);
    for (const a of this.actors) {
      if (a.role !== "ref" && a.player.mesh) addFlag(a.player.mesh);
    }
  }

  /** All official actors (for pose interpolation). */
  players(): Player[] {
    return this.actors.map((a) => a.player);
  }

  private spawn(role: OfficialRole, id: string, number: number, kit: TeamKit, x: number, z: number): void {
    const player = dummyOfficial(id, number);
    player.x = x;
    player.z = z;
    player.prevX = x;
    player.prevZ = z;
    player.facing = role === "ref" ? Math.PI / 2 : role === "arFar" ? 0 : Math.PI;
    player.prevFacing = player.facing;
    const vis = createPlayerVisual(player, kit, false);
    player.mesh = vis.group;
    this.group.add(vis.group);
    this.actors.push({ player, role });
  }

  update(dt: number, ballX: number, ballZ: number, phase: OfficialsPhase = "open"): void {
    this.time += dt;
    for (const a of this.actors) {
      const p = a.player;
      if (a.role === "ref") {
        this.updateReferee(p, dt, ballX, ballZ, phase);
      } else {
        this.updateAssistant(p, dt, ballX, a.role === "arFar", phase);
      }
      updatePlayerAnimation(p, dt, this.time);
    }
  }

  private updateReferee(p: Player, dt: number, ballX: number, ballZ: number, phase: OfficialsPhase): void {
    const aim = isPassiveOfficialsPhase(phase)
      ? refereeSetPieceTarget(phase, ballX, ballZ)
      : refereeTarget(ballX, ballZ);
    const dist = Math.hypot(aim.x - p.x, aim.z - p.z);
    // Spot-kicks / penalties: once near the mark, stand still and watch.
    if (isPassiveOfficialsPhase(phase) && dist < SET_PIECE_HOLD_EPS) {
      p.x = aim.x;
      p.z = aim.z;
      p.vx = 0;
      p.vz = 0;
      p.facing = Math.atan2(ballX - p.x, ballZ - p.z);
      return;
    }
    const maxSpeed = isPassiveOfficialsPhase(phase) ? REF_MAX_SPEED * 0.55 : REF_MAX_SPEED;
    const next = chaseToward(p.x, p.z, p.vx, p.vz, aim.x, aim.z, dt, maxSpeed, REF_ACCEL * 0.85);
    p.x = next.x;
    p.z = next.z;
    p.vx = next.vx;
    p.vz = next.vz;
    const toBall = Math.hypot(ballX - p.x, ballZ - p.z);
    p.facing = toBall < 16 || isPassiveOfficialsPhase(phase) ? Math.atan2(ballX - p.x, ballZ - p.z) : next.facing;
  }

  private updateAssistant(
    p: Player,
    dt: number,
    ballX: number,
    coversPositiveHalf: boolean,
    phase: OfficialsPhase,
  ): void {
    let targetX = assistantTargetX(ballX, coversPositiveHalf);
    if (phase === "penalty" || phase === "spot") {
      // Goal-line AR on the end being attacked; the other holds halfway.
      const atPositiveGoal = ballX >= 0;
      if (atPositiveGoal) {
        targetX = coversPositiveHalf ? HALF_LENGTH - 1.4 : 0;
      } else {
        targetX = coversPositiveHalf ? 0 : -HALF_LENGTH + 1.4;
      }
    } else if (phase === "goal_kick" || phase === "kick_off") {
      targetX = coversPositiveHalf ? 8 : -8;
    }
    const targetZ = coversPositiveHalf ? AR_FAR_Z : AR_NEAR_Z;
    const dist = Math.abs(targetX - p.x);
    if (isPassiveOfficialsPhase(phase) && dist < SET_PIECE_HOLD_EPS) {
      p.x = targetX;
      p.z = targetZ;
      p.vx = 0;
      p.vz = 0;
      p.facing = coversPositiveHalf ? 0 : Math.PI;
      return;
    }
    const maxSpeed = isPassiveOfficialsPhase(phase) ? AR_MAX_SPEED * 0.5 : AR_MAX_SPEED;
    const next = chaseToward(p.x, p.z, p.vx, p.vz, targetX, targetZ, dt, maxSpeed, AR_ACCEL);
    p.x = next.x;
    p.z = targetZ;
    p.vx = next.vx;
    p.vz = 0;
    p.facing = coversPositiveHalf ? 0 : Math.PI;
  }
}

function dummyOfficial(id: string, number: number): Player {
  return new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: number,
    position: "CM",
    slot: "CM",
    side: "home",
    attrs: ATTRS,
    overall: 70,
    appearance: {
      skinTone: 0.4 + Math.random() * 0.35,
      hairStyle: Math.random() > 0.5 ? "short" : "fade",
      hairColor: "#1a1410",
      heightScale: 0.98 + Math.random() * 0.04,
      bodyType: "standard",
      bodyWidth: 1,
      sleeveStyle: "long",
    },
  });
}

function addFlag(group: THREE.Group): void {
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.55, 6),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.45 }),
  );
  stick.position.set(0.22, 1.15, 0.02);
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.11, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.55, emissive: 0x4a3800, emissiveIntensity: 0.15 }),
  );
  flag.position.set(0.3, 1.38, 0.02);
  group.add(stick, flag);
}
