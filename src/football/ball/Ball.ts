import * as THREE from "three";
import { BALL_RADIUS } from "../constants";

export const DEFAULT_BALL_SCALE = 1;
export const MIN_BALL_SCALE = 1;
export const MAX_BALL_SCALE = 2.25;

export function clampBallScale(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BALL_SCALE;
  return Math.min(MAX_BALL_SCALE, Math.max(MIN_BALL_SCALE, n));
}

export class Ball {
  mesh: THREE.Mesh;
  goldRing: THREE.Mesh;
  x = 0;
  y = BALL_RADIUS;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Sidespin about vertical (League-Soccer / GFootball feel) — bends flight in stepBall. */
  spinY = 0;
  /** Backspin / topspin about lateral axis — lifts or dumps bounce. */
  spinX = 0;
  prevX = 0;
  prevY = BALL_RADIUS;
  prevZ = 0;
  ownerId: string | null = null;
  lastTouchId: string | null = null;
  lastTouchSide: "home" | "away" | null = null;
  /** Visual size multiplier (physics radius stays BALL_RADIUS). */
  visualScale = DEFAULT_BALL_SCALE;

  constructor() {
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f4,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.addPattern();
    this.goldRing = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.4, 40),
      new THREE.MeshBasicMaterial({
        color: 0xc5a572,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.goldRing.rotation.x = -Math.PI / 2;
    this.goldRing.position.y = 0.035;
    this.goldRing.name = "ballGoldRing";
    this.goldRing.renderOrder = 4;
    this.goldRing.visible = false;
  }

  setVisualScale(scale: number): void {
    this.visualScale = clampBallScale(scale);
    this.mesh.scale.setScalar(this.visualScale);
  }

  private addPattern(): void {
    const decal = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS * 1.01, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.5,
        transparent: true,
        opacity: 0.18,
        wireframe: true,
      }),
    );
    this.mesh.add(decal);
  }

  setContrast(high: boolean): void {
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(high ? 0xfff7c2 : 0xf4f4f4);
    mat.emissive.setHex(high ? 0x332200 : 0x000000);
    mat.emissiveIntensity = high ? 0.22 : 0;
  }

  setGoldRing(on: boolean): void {
    const mat = this.goldRing.material as THREE.MeshBasicMaterial;
    mat.opacity = on ? 0.95 : 0;
    this.goldRing.visible = on;
  }

  placeGoldRing(x = this.x, z = this.z): void {
    this.goldRing.position.set(x, 0.035, z);
  }

  syncMesh(): void {
    const lift = BALL_RADIUS * (this.visualScale - 1) * 0.5;
    this.mesh.position.set(this.x, this.y + lift, this.z);
    this.placeGoldRing();
    const speed = Math.hypot(this.vx, this.vz);
    this.mesh.rotation.x += speed * 0.08;
    this.mesh.rotation.z += this.vx * 0.02;
  }

  reset(x = 0, z = 0): void {
    this.x = x;
    this.z = z;
    this.y = BALL_RADIUS;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.spinY = 0;
    this.spinX = 0;
    this.ownerId = null;
  }
}
