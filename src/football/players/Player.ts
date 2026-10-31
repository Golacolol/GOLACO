import * as THREE from "three";
import type { PlayerAttributes, PositionCode } from "../../data/schema";
import { PLAYER_HEIGHT, PLAYER_RADIUS, HALF_LENGTH } from "../constants";
import { PlayerEnergy } from "./PlayerEnergy";
import type { Gait } from "./PlayerAnimation";

export type Side = "home" | "away";

export class Player {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly shirtNumber: number;
  readonly position: PositionCode;
  slot: string;
  readonly side: Side;
  /** World +X attack sign for this player (negated after half-time end swap). */
  attackSign: number;
  readonly isGK: boolean;
  readonly attrs: PlayerAttributes;
  readonly overall: number;
  readonly energy: PlayerEnergy;
  readonly appearance: {
    skinTone: number;
    hairStyle: string;
    hairColor: string;
    heightScale: number;
    bodyType: string;
    /** Continuous XZ girth from weight/BMI when available. */
    bodyWidth?: number;
    portraitAsset: string | null;
    fullBodyAsset: string | null;
    modelId: string | null;
    sleeveStyle: "short" | "long";
    bootStyle: string;
  };

  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  facing = 0;
  prevX = 0;
  prevY = 0;
  prevZ = 0;
  prevFacing = 0;
  anchorX = 0;
  anchorZ = 0;
  desiredX = 0;
  desiredZ = 0;
  sprinting = false;
  boosting = false;
  jockeying = false;
  hasBall = false;
  celebrating = false;
  celebrationKind: "arms" | "slide" | "jump" | "team" | "none" = "none";
  kickTimer = 0;
  /** Which foot swings on the current kick pose (true = right). */
  kickSwingRight = true;
  firstTouchTimer = 0;
  /** Brief window where dribble magnet is off after a poke / heavy touch. */
  ballControlLockout = 0;
  touchTimer = 0.3;
  tackleCooldown = 0;
  /** After a header — blocks chain-heading the same flight / immediate re-headers. */
  headerCooldown = 0;
  /** Active slide challenge toward the ball. */
  sliding = false;
  slideTimer = 0;
  /** Duration when the current slide started (for pose progress). */
  slideDuration = 0;
  /** Grounded recovery after a mistimed / missed slide. */
  slideRecoverTimer = 0;
  /** Max recover time when recovery started (for get-up pose). */
  slideRecoverMax = 0;
  slideDirX = 0;
  slideDirZ = 1;
  /** Bookings this match (2 → red / second yellow). */
  yellowCards = 0;
  /** Sent off (red card) — out of the match. */
  sentOff = false;
  /** Overhead throw-in release pose. */
  throwTimer = 0;
  /** Goalkeeper dive / stretch save pose. */
  diveTimer = 0;
  /** Duration when the current dive started. */
  diveDuration = 0;
  /** Aerial challenge / header jump pose. */
  jumpTimer = 0;
  /** Duration when the current jump started. */
  jumpDuration = 0;
  /** Lateral dive lean: -1 toward -Z, +1 toward +Z. */
  diveDirZ = 0;
  /** GK releasing the ball from the hands (throw / roll), not a foot kick. */
  handRelease = false;
  giveAndGoTimer = 0;
  runTargetX = 0;
  runTargetZ = 0;
  gait: Gait = "IDLE";
  stridePhase = 0;
  mesh: THREE.Group | null = null;

  constructor(init: {
    id: string;
    name: string;
    displayName: string;
    shirtNumber: number;
    position: PositionCode;
    slot: string;
    side: Side;
    attrs: PlayerAttributes;
    overall: number;
    appearance?: {
      skinTone?: number;
      hairStyle?: string;
      hairColor?: string;
      heightScale?: number;
      bodyType?: string;
      bodyWidth?: number;
      portraitAsset?: string | null;
      fullBodyAsset?: string | null;
      modelId?: string | null;
      sleeveStyle?: "short" | "long";
      bootStyle?: string;
    };
  }) {
    this.id = init.id;
    this.name = init.name;
    this.displayName = init.displayName;
    this.shirtNumber = init.shirtNumber;
    this.position = init.position;
    this.slot = init.slot;
    this.side = init.side;
    this.attackSign = init.side === "home" ? 1 : -1;
    this.isGK = init.slot === "GK" || init.position === "GK";
    this.attrs = init.attrs;
    this.overall = init.overall;
    this.energy = new PlayerEnergy(init.attrs.stamina);
    this.appearance = {
      skinTone: init.appearance?.skinTone ?? 0.55,
      hairStyle: init.appearance?.hairStyle ?? "short",
      hairColor: init.appearance?.hairColor ?? "#1a140f",
      heightScale: init.appearance?.heightScale ?? 1,
      bodyType: init.appearance?.bodyType ?? "standard",
      bodyWidth: init.appearance?.bodyWidth,
      portraitAsset: init.appearance?.portraitAsset ?? null,
      fullBodyAsset: init.appearance?.fullBodyAsset ?? null,
      modelId: init.appearance?.modelId ?? null,
      sleeveStyle: init.appearance?.sleeveStyle ?? "short",
      bootStyle: init.appearance?.bootStyle ?? "",
    };
  }

  get radius(): number {
    return PLAYER_RADIUS;
  }

  get height(): number {
    return PLAYER_HEIGHT * this.appearance.heightScale;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  distTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z);
  }

  /** Own goal line X for the current half. */
  ownGoalX(): number {
    return -this.attackSign * HALF_LENGTH;
  }

  /** Opponent goal line X for the current half. */
  oppGoalX(): number {
    return this.attackSign * HALF_LENGTH;
  }
}
