import * as THREE from "three";
import { FLICK_PITCH, type FlickPitchDims } from "./FlickPitch";

export type FlickViewMode = "BIRD" | "BIRD_TILT" | "SIDE";

const VIEW_ORDER: FlickViewMode[] = ["BIRD", "BIRD_TILT", "SIDE"];

export class FlickCamera {
  readonly camera: THREE.PerspectiveCamera;
  view: FlickViewMode = "BIRD_TILT";
  zoom = 1;
  private look = new THREE.Vector3(0, 0, 0);
  private upBird = new THREE.Vector3(0, 0, -1);

  constructor(aspect: number) {
    // Far clip covers a full stadium bowl around the REAL pitch.
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 800);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  cycleView(): FlickViewMode {
    const i = VIEW_ORDER.indexOf(this.view);
    this.view = VIEW_ORDER[(i + 1) % VIEW_ORDER.length]!;
    return this.view;
  }

  adjustZoom(delta: number): void {
    this.zoom = Math.max(0.7, Math.min(2.2, this.zoom + delta));
  }

  update(dims: FlickPitchDims = FLICK_PITCH, ballX = 0, ballZ = 0): void {
    const cover = Math.max(dims.length, dims.width) * 1.15;
    const halfV = Math.tan((this.camera.fov * Math.PI) / 360);
    const baseH = cover / (2 * halfV);
    const h = baseH / this.zoom;
    const y0 = dims.playY;

    if (this.view === "BIRD") {
      this.camera.up.copy(this.upBird);
      this.camera.position.set(ballX * 0.04, h, ballZ * 0.04);
      this.look.set(ballX * 0.08, y0, ballZ * 0.08);
      this.camera.lookAt(this.look);
    } else if (this.view === "BIRD_TILT") {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(ballX * 0.05, h * 0.82, h * 0.42 + ballZ * 0.03);
      this.look.set(ballX * 0.1, y0, ballZ * 0.06);
      this.camera.lookAt(this.look);
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(0, h * 0.38, dims.width * 0.72 + h * 0.08);
      this.look.set(ballX * 0.12, y0, 0);
      this.camera.lookAt(this.look);
    }
  }
}
