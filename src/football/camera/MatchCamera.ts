import * as THREE from "three";
import { lerp } from "../../core/math";
import type { Ball } from "../ball/Ball";
import type { Player } from "../players/Player";
import { FootballState } from "../FootballState";
import { predictLanding } from "../ball/StuckBall";
import { PITCH_LENGTH, PITCH_WIDTH } from "../constants";

export type ViewMode = "CLOSE" | "MEDIUM" | "WIDE" | "PLAYER" | "BIRD" | "BIRD_FAR";
export type TrackMode = "BALL" | "PLAYER" | "DYNAMIC";

const VIEW: Record<ViewMode, { y: number; z: number; fov: number }> = {
  CLOSE: { y: 17, z: 26, fov: 52 },
  MEDIUM: { y: 24, z: 40, fov: 44 },
  WIDE: { y: 34, z: 52, fov: 38 },
  PLAYER: { y: 1.72, z: 0.28, fov: 70 },
  BIRD: { y: 46, z: 0, fov: 48 },
  BIRD_FAR: { y: 118, z: 0, fov: 42 },
};

/** Player view sits after the two bird's-eye framings in the cycle. */
export const VIEW_ORDER: ViewMode[] = ["CLOSE", "MEDIUM", "WIDE", "BIRD", "BIRD_FAR", "PLAYER"];
export const TRACK_ORDER: TrackMode[] = ["BALL", "PLAYER", "DYNAMIC"];

/** Sideline views that support +/- zoom (the first three broadcast framings). */
export const ZOOMABLE_VIEWS: ViewMode[] = ["CLOSE", "MEDIUM", "WIDE"];

const BIRD_UP = new THREE.Vector3(0, 0, -1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PLAYER_DIVE_SECONDS = 1.15;

export function isBirdView(mode: ViewMode): boolean {
  return mode === "BIRD" || mode === "BIRD_FAR";
}

export function isPlayerView(mode: ViewMode): boolean {
  return mode === "PLAYER";
}

export function supportsViewZoom(mode: ViewMode): boolean {
  return ZOOMABLE_VIEWS.includes(mode) || mode === "BIRD";
}

export function viewLabel(mode: ViewMode): string {
  if (mode === "BIRD") return "BIRD'S EYE";
  if (mode === "BIRD_FAR") return "BIRD'S EYE FAR";
  if (mode === "PLAYER") return "PLAYER";
  return mode;
}

export function trackLabel(mode: TrackMode): string {
  if (mode === "BALL") return "BALL";
  if (mode === "PLAYER") return "PLAYER";
  return "DYNAMIC";
}

export function nextView(current: ViewMode): ViewMode {
  const i = VIEW_ORDER.indexOf(current);
  return VIEW_ORDER[(i < 0 ? 0 : i + 1) % VIEW_ORDER.length];
}

export function nextTrack(current: TrackMode): TrackMode {
  return TRACK_ORDER[(TRACK_ORDER.indexOf(current) + 1) % TRACK_ORDER.length];
}

export function overheadHeight(coverX: number, coverZ: number, fovDeg: number, aspect: number): number {
  const halfV = Math.tan((fovDeg * Math.PI) / 360);
  const halfH = halfV * Math.max(0.55, aspect);
  return Math.max(coverZ / (2 * halfV), coverX / (2 * halfH));
}

export interface CameraFocus {
  x: number;
  z: number;
  hasBall?: boolean;
  facing?: number;
}

export interface CameraTarget {
  targetX: number;
  targetY: number;
  targetZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

export function computeCameraTarget(
  viewMode: ViewMode,
  trackMode: TrackMode,
  ball: { x: number; z: number; vx?: number },
  focus: CameraFocus | null,
  state: FootballState,
  extras?: {
    landing?: { x: number; z: number } | null;
    aerial?: { x: number; z: number } | null;
    aspect?: number;
    birdZoom?: number;
    viewZoom?: number;
  },
): CameraTarget {
  const framing = VIEW[viewMode] ?? VIEW.MEDIUM;
  const aspect = extras?.aspect ?? 16 / 9;

  if (viewMode === "BIRD_FAR") {
    const y = overheadHeight(PITCH_LENGTH + 10, PITCH_WIDTH + 10, framing.fov, aspect);
    return { targetX: 0, targetY: y, targetZ: 0, lookX: 0, lookY: 0, lookZ: 0 };
  }
  if (viewMode === "BIRD") {
    const zoom = clampBirdZoom(extras?.birdZoom ?? 1);
    const coverX = 48 / zoom;
    const coverZ = 32 / zoom;
    const y = overheadHeight(coverX, coverZ, framing.fov, aspect);
    return {
      targetX: ball.x,
      targetY: y,
      targetZ: ball.z,
      lookX: ball.x,
      lookY: 0,
      lookZ: ball.z,
    };
  }

  if (viewMode === "PLAYER" && focus) {
    return playerHeadTarget(framing, trackMode, ball, focus);
  }

  const zoom = ZOOMABLE_VIEWS.includes(viewMode) ? clampViewZoom(extras?.viewZoom ?? 1) : 1;
  const ballX = extras?.landing?.x ?? extras?.aerial?.x ?? ball.x + (ball.vx ?? 0) * 0.28;
  const px = focus?.x ?? ball.x;
  const pz = focus?.z ?? ball.z;

  let lookX = ball.x;
  let lookZ = ball.z;
  if (trackMode === "PLAYER" && focus) {
    const pull = Math.min(1, Math.hypot(focus.x - ball.x, focus.z - ball.z) / 28) * 0.28;
    lookX = px * (1 - pull) + ball.x * pull;
    lookZ = pz * (1 - pull) + ball.z * pull;
  } else if (trackMode === "DYNAMIC") {
    const w = focus?.hasBall ? 0.55 : 0.32;
    lookX = px * w + ball.x * (1 - w);
    lookZ = pz * w + ball.z * (1 - w);
  }

  let targetX = lookX;
  let targetY = framing.y / zoom;
  let targetZ = lookZ + framing.z / zoom;
  let lookY = 0.85;
  if (viewMode === "CLOSE" && focus) {
    targetX = trackMode === "BALL" ? ballX : px * 0.72 + ballX * 0.28;
    lookX = trackMode === "BALL" ? ball.x : lookX;
  }
  if (state === FootballState.GOAL_CELEBRATION && focus) {
    const fx = Math.sin(focus.facing ?? Math.PI / 2);
    const fz = Math.cos(focus.facing ?? Math.PI / 2);
    targetX = focus.x - fx * 9;
    targetY = 8.2;
    targetZ = focus.z - fz * 9;
    lookX = focus.x + fx * 3.5;
    lookZ = focus.z + fz * 3.5;
    lookY = 1.05;
  }
  if (state === FootballState.HALF_TIME) {
    targetX = 0;
    targetY = 26;
    targetZ = 52;
    lookX = 0;
    lookZ = 0;
    lookY = 0.85;
  }

  return { targetX, targetY, targetZ, lookX, lookY, lookZ };
}

/** Eye-level forward look — pitch stays level even when tracking the ball horizontally. */
export function playerHeadTarget(
  framing: { y: number; z: number },
  trackMode: TrackMode,
  ball: { x: number; z: number },
  focus: CameraFocus,
): CameraTarget {
  const eyeY = framing.y;
  const fx = Math.sin(focus.facing ?? Math.PI / 2);
  const fz = Math.cos(focus.facing ?? Math.PI / 2);
  const targetX = focus.x - fx * framing.z;
  const targetY = eyeY;
  const targetZ = focus.z - fz * framing.z;

  let dirX = fx;
  let dirZ = fz;
  if (trackMode === "BALL" || trackMode === "DYNAMIC") {
    const bx = ball.x - focus.x;
    const bz = ball.z - focus.z;
    const len = Math.hypot(bx, bz);
    if (len > 0.35) {
      const mix = trackMode === "BALL" ? 0.9 : 0.4;
      dirX = fx * (1 - mix) + (bx / len) * mix;
      dirZ = fz * (1 - mix) + (bz / len) * mix;
      const n = Math.hypot(dirX, dirZ) || 1;
      dirX /= n;
      dirZ /= n;
    }
  }

  const lookDist = 14;
  return {
    targetX,
    targetY,
    targetZ,
    lookX: focus.x + dirX * lookDist,
    lookY: eyeY,
    lookZ: focus.z + dirZ * lookDist,
  };
}

export class MatchCamera {
  readonly camera: THREE.PerspectiveCamera;
  viewMode: ViewMode = "MEDIUM";
  trackMode: TrackMode = "DYNAMIC";
  mode: "BROADCAST" | "TACTICAL" | "CLOSE" = "BROADCAST";
  /** Closer bird's-eye only: 1 = default framing; higher = zoomed in. */
  birdZoom = 1;
  /** Sideline CLOSE/MEDIUM/WIDE zoom: 1 = default; higher = closer. */
  viewZoom = 1;
  private look = new THREE.Vector3();
  private pos = new THREE.Vector3(0, 28, 42);
  private prevPos = new THREE.Vector3(0, 28, 42);
  private prevLook = new THREE.Vector3();
  private posePos = new THREE.Vector3();
  private poseLook = new THREE.Vector3();
  private softBallX = 0;
  private softBallZ = 0;
  private softBallVx = 0;
  private softFocusX = 0;
  private softFocusZ = 0;
  private softReady = false;
  private aerialLatch = false;
  private diveActive = false;
  private diveT = 0;
  private diveFromPos = new THREE.Vector3();
  private diveFromLook = new THREE.Vector3();
  private diveFromBird = false;
  private diveUp = new THREE.Vector3();
  private diveTargetPos = new THREE.Vector3();
  private diveTargetLook = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 420);
    this.camera.position.copy(this.pos);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Change view; diving in from bird's-eye when entering player perspective. */
  setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    const from = this.viewMode;
    if (mode === "PLAYER" && (isBirdView(from) || from !== "PLAYER")) {
      this.diveActive = true;
      this.diveT = 0;
      this.diveFromPos.copy(this.pos);
      this.diveFromLook.copy(this.look);
      if (this.diveFromLook.lengthSq() < 0.01) {
        this.diveFromLook.set(this.pos.x, 0, this.pos.z);
      }
      this.diveFromBird = isBirdView(from);
    } else {
      this.diveActive = false;
    }
    this.viewMode = mode;
  }

  adjustBirdZoom(delta: number): void {
    this.birdZoom = clampBirdZoom(this.birdZoom + delta);
  }

  adjustViewZoom(delta: number): void {
    this.viewZoom = clampViewZoom(this.viewZoom + delta);
  }

  /** Apply a shared zoom factor to both sideline and bird framings (settings). */
  setCameraZoom(zoom: number): void {
    const z = clampCameraZoom(zoom);
    this.viewZoom = clampViewZoom(z);
    this.birdZoom = clampBirdZoom(z);
  }

  getCameraZoom(): number {
    if (this.viewMode === "BIRD") return this.birdZoom;
    if (ZOOMABLE_VIEWS.includes(this.viewMode)) return this.viewZoom;
    return this.viewZoom;
  }

  /** Apply +/- zoom for the active zoomable view. */
  adjustZoom(delta: number): void {
    if (this.viewMode === "BIRD") this.adjustBirdZoom(delta);
    else if (ZOOMABLE_VIEWS.includes(this.viewMode)) this.adjustViewZoom(delta);
  }

  update(
    dt: number,
    ball: Ball,
    focus: Player | null,
    state: FootballState,
    extras?: { landing?: { x: number; z: number } | null },
  ): void {
    const framing = VIEW[this.viewMode] ?? VIEW.MEDIUM;
    const nextFov = lerp(this.camera.fov, framing.fov, Math.min(1, dt * (this.diveActive ? 2.2 : 3)));
    if (Math.abs(nextFov - this.camera.fov) > 0.04) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    } else if (Math.abs(this.camera.fov - framing.fov) > 0.001) {
      this.camera.fov = framing.fov;
      this.camera.updateProjectionMatrix();
    }

    const bird = isBirdView(this.viewMode);
    const playerView = isPlayerView(this.viewMode);
    const aerialLive = ball.y > (this.aerialLatch ? 0.9 : 1.25);
    const aerial = aerialLive ? predictLanding(ball) : null;
    this.aerialLatch = !!(aerial && aerial.t > 0.12);

    const focusIn = this.smoothFocus(dt, ball, focus, bird || playerView);
    const framed = computeCameraTarget(this.viewMode, this.trackMode, focusIn.ball, focusIn.focus, state, {
      landing: bird ? extras?.landing : extras?.landing ?? null,
      aerial: bird ? aerial : aerial && aerial.t > 0.2 ? aerial : null,
      aspect: this.camera.aspect,
      birdZoom: this.birdZoom,
      viewZoom: this.viewZoom,
    });

    if (bird) {
      const snap = this.viewMode === "BIRD_FAR" ? 4.2 : 5.5;
      this.pos.x = lerp(this.pos.x, framed.targetX, Math.min(1, dt * snap));
      this.pos.y = lerp(this.pos.y, framed.targetY, Math.min(1, dt * 3.4));
      this.pos.z = lerp(this.pos.z, framed.targetZ, Math.min(1, dt * snap));
      this.camera.position.copy(this.pos);
      this.look.set(this.pos.x, 0, this.pos.z);
      this.camera.up.copy(BIRD_UP);
      this.camera.lookAt(this.look);
      return;
    }

    if (playerView) {
      const jump = Math.hypot(framed.targetX - this.pos.x, framed.targetZ - this.pos.z);
      const posSnap = jump > 22 ? 11 : jump > 10 ? 6.5 : 3.8;
      const lookSnap = jump > 22 ? 10 : jump > 10 ? 6.2 : 4.2;

      if (this.diveActive) {
        this.diveT += dt;
        const u = Math.min(1, this.diveT / PLAYER_DIVE_SECONDS);
        const e = u * u * (3 - 2 * u);
        this.diveTargetPos.set(framed.targetX, framed.targetY, framed.targetZ);
        this.diveTargetLook.set(framed.lookX, framed.lookY, framed.lookZ);
        this.pos.lerpVectors(this.diveFromPos, this.diveTargetPos, e);
        this.look.lerpVectors(this.diveFromLook, this.diveTargetLook, e);
        this.look.y = lerp(this.diveFromLook.y, framed.lookY, e);
        this.camera.position.copy(this.pos);
        if (this.diveFromBird) {
          this.diveUp.lerpVectors(BIRD_UP, WORLD_UP, e);
          this.diveUp.normalize();
          this.camera.up.copy(this.diveUp);
        } else {
          this.camera.up.copy(WORLD_UP);
        }
        this.camera.lookAt(this.look);
        if (u >= 1) this.diveActive = false;
        return;
      }

      this.pos.x = lerp(this.pos.x, framed.targetX, Math.min(1, dt * posSnap));
      this.pos.y = lerp(this.pos.y, framed.targetY, Math.min(1, dt * 5.5));
      this.pos.z = lerp(this.pos.z, framed.targetZ, Math.min(1, dt * posSnap));
      this.look.x = lerp(this.look.x, framed.lookX, Math.min(1, dt * lookSnap));
      this.look.y = lerp(this.look.y, framed.lookY, Math.min(1, dt * lookSnap));
      this.look.z = lerp(this.look.z, framed.lookZ, Math.min(1, dt * lookSnap));
      // Hard-clamp pitch level so head bob / ball height cannot tip the lens down.
      this.look.y = framed.lookY;
      this.pos.y = framed.targetY;
      this.camera.position.copy(this.pos);
      this.camera.up.copy(WORLD_UP);
      this.camera.lookAt(this.look);
      return;
    }

    // Side / broadcast views: damp both rig and look so stride/track noise cannot yaw the lens.
    const airFollow = !!(aerial && aerial.t > 0.5);
    const posSnap = airFollow ? 1.55 : 1.85;
    const lookSnap = airFollow ? 2.05 : 2.35;
    this.pos.x = lerp(this.pos.x, framed.targetX, Math.min(1, dt * posSnap));
    this.pos.y = lerp(this.pos.y, framed.targetY, Math.min(1, dt * 1.65));
    this.pos.z = lerp(this.pos.z, framed.targetZ, Math.min(1, dt * posSnap));
    this.look.x = lerp(this.look.x, framed.lookX, Math.min(1, dt * lookSnap));
    this.look.y = lerp(this.look.y, framed.lookY, Math.min(1, dt * lookSnap));
    this.look.z = lerp(this.look.z, framed.lookZ, Math.min(1, dt * lookSnap));
    this.camera.position.copy(this.pos);
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(this.look);
  }

  /** Low-pass ball/player follow points so running gait and tiny track flips do not jitter framing. */
  private smoothFocus(
    dt: number,
    ball: Ball,
    focus: Player | null,
    raw: boolean,
  ): { ball: { x: number; z: number; vx?: number }; focus: CameraFocus | null } {
    if (raw) {
      return {
        ball: { x: ball.x, z: ball.z, vx: ball.vx },
        focus: focus ? { x: focus.x, z: focus.z, hasBall: focus.hasBall, facing: focus.facing } : null,
      };
    }
    if (!this.softReady) {
      this.softBallX = ball.x;
      this.softBallZ = ball.z;
      this.softBallVx = ball.vx;
      this.softFocusX = focus?.x ?? ball.x;
      this.softFocusZ = focus?.z ?? ball.z;
      this.softReady = true;
    }
    const ballJump = Math.hypot(ball.x - this.softBallX, ball.z - this.softBallZ);
    const ballRate = Math.min(1, dt * (ballJump > 14 ? 7.5 : 4.2));
    this.softBallX = lerp(this.softBallX, ball.x, ballRate);
    this.softBallZ = lerp(this.softBallZ, ball.z, ballRate);
    this.softBallVx = lerp(this.softBallVx, ball.vx, Math.min(1, dt * 3.5));

    let softFocus: CameraFocus | null = null;
    if (focus) {
      const focusJump = Math.hypot(focus.x - this.softFocusX, focus.z - this.softFocusZ);
      const focusRate = Math.min(1, dt * (focusJump > 10 ? 8.5 : 3.6));
      this.softFocusX = lerp(this.softFocusX, focus.x, focusRate);
      this.softFocusZ = lerp(this.softFocusZ, focus.z, focusRate);
      softFocus = {
        x: this.softFocusX,
        z: this.softFocusZ,
        hasBall: focus.hasBall,
        facing: focus.facing,
      };
    }
    return {
      ball: { x: this.softBallX, z: this.softBallZ, vx: this.softBallVx },
      focus: softFocus,
    };
  }

  preMatch(t: number): void {
    this.camera.up.copy(WORLD_UP);
    this.camera.position.set(Math.sin(t * 0.18) * 16, 26, 56);
    this.camera.lookAt(0, 3.5, -6);
  }

  snapshot(): void {
    this.prevPos.copy(this.pos);
    this.prevLook.copy(this.look);
  }

  pose(alpha: number): void {
    const t = Math.min(1, Math.max(0, alpha));
    this.posePos.lerpVectors(this.prevPos, this.pos, t);
    this.poseLook.lerpVectors(this.prevLook, this.look, t);
    this.camera.position.copy(this.posePos);
    const bird = isBirdView(this.viewMode);
    if (bird) {
      this.camera.up.copy(BIRD_UP);
      this.camera.lookAt(this.posePos.x, 0, this.posePos.z);
    } else if (this.diveActive && this.diveFromBird) {
      const u = Math.min(1, this.diveT / PLAYER_DIVE_SECONDS);
      const e = u * u * (3 - 2 * u);
      this.diveUp.lerpVectors(BIRD_UP, WORLD_UP, e);
      this.diveUp.normalize();
      this.camera.up.copy(this.diveUp);
      this.camera.lookAt(this.poseLook);
    } else {
      this.camera.up.copy(WORLD_UP);
      this.camera.lookAt(this.poseLook);
    }
  }

  establish(): void {
    this.camera.up.copy(WORLD_UP);
    this.camera.position.set(0, 26, 56);
    this.camera.lookAt(0, 3.5, -6);
    this.pos.copy(this.camera.position);
    this.prevPos.copy(this.pos);
    this.look.set(0, 3.5, -6);
    this.prevLook.copy(this.look);
    this.softReady = false;
    this.aerialLatch = false;
    this.diveActive = false;
  }
}

const BIRD_ZOOM_MIN = 0.55;
const BIRD_ZOOM_MAX = 2.4;
const VIEW_ZOOM_MIN = 0.7;
const VIEW_ZOOM_MAX = 1.85;
const CAMERA_ZOOM_MIN = 0.7;
const CAMERA_ZOOM_MAX = 1.85;

export function clampBirdZoom(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(BIRD_ZOOM_MAX, Math.max(BIRD_ZOOM_MIN, n));
}

export function clampViewZoom(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, n));
}

export function clampCameraZoom(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, n));
}
