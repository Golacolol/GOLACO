import * as THREE from "three";
import type { TableDims } from "./TableLayouts";

export type TableViewMode = "BIRD" | "BIRD_TILT" | "SIDE";

const VIEW_ORDER: TableViewMode[] = ["BIRD", "BIRD_TILT", "SIDE"];

export class TableCamera {
  readonly camera: THREE.PerspectiveCamera;
  view: TableViewMode = "BIRD";
  /** 1 = default fit; higher = closer. */
  zoom = 1;
  private look = new THREE.Vector3(0, 0, 0);
  private upBird = new THREE.Vector3(0, 0, -1);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  cycleView(): TableViewMode {
    const i = VIEW_ORDER.indexOf(this.view);
    this.view = VIEW_ORDER[(i + 1) % VIEW_ORDER.length];
    return this.view;
  }

  adjustZoom(delta: number): void {
    this.zoom = Math.max(0.65, Math.min(2.4, this.zoom + delta));
  }

  update(dims: TableDims, ballX = 0, ballZ = 0): void {
    const cover = Math.max(dims.length, dims.width) * 1.15;
    const halfV = Math.tan((this.camera.fov * Math.PI) / 360);
    const baseH = cover / (2 * halfV);
    const h = baseH / this.zoom;

    if (this.view === "BIRD") {
      this.camera.up.copy(this.upBird);
      this.camera.position.set(ballX * 0.08, h, ballZ * 0.08);
      this.look.set(ballX * 0.12, 0, ballZ * 0.12);
      this.camera.lookAt(this.look);
    } else if (this.view === "BIRD_TILT") {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(ballX * 0.1, h * 0.85, h * 0.35 + ballZ * 0.05);
      this.look.set(ballX * 0.15, 0, ballZ * 0.1);
      this.camera.lookAt(this.look);
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(0, h * 0.45, dims.width * 0.95 + h * 0.15);
      this.look.set(ballX * 0.2, 0, 0);
      this.camera.lookAt(this.look);
    }
  }
}
