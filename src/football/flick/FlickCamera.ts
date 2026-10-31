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
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.08, 120);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  cycleView(): FlickViewMode {
    const i = VIEW_ORDER.indexOf(this.view);
    this.view = VIEW_ORDER[(i + 1) % VIEW_ORDER.length];
    return this.view;
  }

  adjustZoom(delta: number): void {
    this.zoom = Math.max(0.7, Math.min(2.2, this.zoom + delta));
  }

  update(dims: FlickPitchDims = FLICK_PITCH, ballX = 0, ballZ = 0): void {
    const cover = Math.max(dims.length, dims.width) * 1.2;
    const halfV = Math.tan((this.camera.fov * Math.PI) / 360);
    const baseH = cover / (2 * halfV);
    const h = baseH / this.zoom;

    if (this.view === "BIRD") {
      this.camera.up.copy(this.upBird);
      this.camera.position.set(ballX * 0.06, h, ballZ * 0.06);
      this.look.set(ballX * 0.1, dims.playY, ballZ * 0.1);
      this.camera.lookAt(this.look);
    } else if (this.view === "BIRD_TILT") {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(ballX * 0.08, h * 0.78, h * 0.38 + ballZ * 0.04);
      this.look.set(ballX * 0.12, dims.playY, ballZ * 0.08);
      this.camera.lookAt(this.look);
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(0, h * 0.42, dims.width * 0.9 + h * 0.12);
      this.look.set(ballX * 0.18, dims.playY, 0);
      this.camera.lookAt(this.look);
    }
  }
}
