import * as THREE from "three";
import type { FlickFigureState } from "./FlickFigure";

export interface FlickAimState {
  figureId: string | null;
  /** World XZ under pointer while dragging. */
  dragX: number;
  dragZ: number;
  active: boolean;
  cancelled: boolean;
  pause: boolean;
  cycleView: boolean;
}

export function createFlickAimState(): FlickAimState {
  return {
    figureId: null,
    dragX: 0,
    dragZ: 0,
    active: false,
    cancelled: false,
    pause: false,
    cycleView: false,
  };
}

export interface FlickPointerHit {
  x: number;
  z: number;
}

/** Raycast onto y = playY plane. */
export function hitPitchPlane(
  ndcX: number,
  ndcY: number,
  camera: THREE.Camera,
  playY: number,
): FlickPointerHit | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -playY);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  return { x: hit.x, z: hit.z };
}

export function pickFigureAt(
  figures: FlickFigureState[],
  x: number,
  z: number,
  allowed: (f: FlickFigureState) => boolean,
  pad = 0.12,
): FlickFigureState | null {
  let best: FlickFigureState | null = null;
  let bestD = Infinity;
  for (const f of figures) {
    if (!allowed(f)) continue;
    const d = Math.hypot(f.x - x, f.z - z);
    if (d <= f.radius + pad && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

export class FlickInput {
  private canvas: HTMLElement | null = null;
  private camera: THREE.Camera | null = null;
  private playY = 0.32;
  private aim: FlickAimState = createFlickAimState();
  private keys = new Set<string>();
  private bound = false;

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (e.code === "Escape") this.aim.pause = true;
    if (e.code === "KeyV") this.aim.cycleView = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private ndc(ev: PointerEvent): { x: number; y: number } | null {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return {
      x: ((ev.clientX - r.left) / r.width) * 2 - 1,
      y: -(((ev.clientY - r.top) / r.height) * 2 - 1),
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      this.aim.cancelled = true;
      this.aim.active = false;
      this.aim.figureId = null;
      return;
    }
    if (e.button !== 0 || !this.camera) return;
    const ndc = this.ndc(e);
    if (!ndc) return;
    const hit = hitPitchPlane(ndc.x, ndc.y, this.camera, this.playY);
    if (!hit) return;
    this.aim.dragX = hit.x;
    this.aim.dragZ = hit.z;
    this.aim.active = true;
    this.aim.cancelled = false;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.aim.active || !this.camera) return;
    const ndc = this.ndc(e);
    if (!ndc) return;
    const hit = hitPitchPlane(ndc.x, ndc.y, this.camera, this.playY);
    if (!hit) return;
    this.aim.dragX = hit.x;
    this.aim.dragZ = hit.z;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (!this.aim.active) return;
    // Keep active until match consumes release via consumeRelease().
    this.aim.active = false;
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  attach(canvas: HTMLElement, camera: THREE.Camera, playY: number): void {
    this.detach();
    this.canvas = canvas;
    this.camera = camera;
    this.playY = playY;
    this.bound = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  detach(): void {
    if (!this.bound) return;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas?.removeEventListener("pointermove", this.onPointerMove);
    this.canvas?.removeEventListener("pointerup", this.onPointerUp);
    this.canvas?.removeEventListener("contextmenu", this.onContextMenu);
    this.bound = false;
    this.canvas = null;
  }

  /** Snapshot for this frame; clears one-shot flags. */
  poll(): FlickAimState {
    const out = { ...this.aim };
    this.aim.pause = false;
    this.aim.cycleView = false;
    this.aim.cancelled = false;
    return out;
  }

  /** Current drag world pos while pointer held (or last). */
  getAim(): FlickAimState {
    return this.aim;
  }

  /**
   * Keyboard axes for GK positioning (−1..1).
   * +X toward attack for home (= pitch +X); +Z = screen/pitch +Z.
   */
  gkMoveAxes(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) x += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) x -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) z -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) z += 1;
    return { x, z };
  }

  /** Mark which figure is being flicked while pointer is down. */
  setSelectedFigure(id: string | null): void {
    this.aim.figureId = id;
  }

  wasPointerReleased(): boolean {
    return !this.aim.active && this.aim.figureId !== null;
  }

  clearSelection(): void {
    this.aim.figureId = null;
    this.aim.active = false;
  }

  dispose(): void {
    this.detach();
  }
}
