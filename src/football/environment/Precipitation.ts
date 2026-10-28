import * as THREE from "three";
import type { EnvironmentPreset } from "./Environment";

export class Precipitation {
  readonly group = new THREE.Group();
  private rain: THREE.InstancedMesh | null = null;
  private snow: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();
  private phases: number[] = [];
  private mode: "none" | "rain" | "snow" = "none";
  private density = 1;
  private acc = 0;

  constructor() {
    const rainGeo = new THREE.BoxGeometry(0.03, 0.55, 0.03);
    const rainMat = new THREE.MeshBasicMaterial({ color: 0xa8c4d8, transparent: true, opacity: 0.45 });
    this.rain = new THREE.InstancedMesh(rainGeo, rainMat, 420);
    this.rain.count = 0;
    this.rain.frustumCulled = false;
    const snowGeo = new THREE.SphereGeometry(0.045, 5, 4);
    const snowMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.85 });
    this.snow = new THREE.InstancedMesh(snowGeo, snowMat, 280);
    this.snow.count = 0;
    this.snow.frustumCulled = false;
    this.group.add(this.rain, this.snow);
    this.phases = Array.from({ length: 420 }, () => Math.random());
  }

  configure(env: EnvironmentPreset, graphics: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" = "HIGH"): void {
    this.mode = env.precipitation;
    const cap = graphics === "LOW" ? 0 : graphics === "MEDIUM" ? 0.55 : 1;
    this.density = env.precipDensity * cap;
    if (this.rain) this.rain.count = this.mode === "rain" ? Math.floor(420 * this.density) : 0;
    if (this.snow) this.snow.count = this.mode === "snow" ? Math.floor(280 * this.density) : 0;
  }

  update(dt: number, cam: THREE.Vector3): void {
    if (this.mode === "none" || this.density <= 0) return;
    this.acc += dt;
    if (this.acc < 0.032) return;
    const step = this.acc;
    this.acc = 0;
    const mesh = this.mode === "rain" ? this.rain : this.snow;
    if (!mesh) return;
    const n = mesh.count;
    const fall = this.mode === "rain" ? 28 : 6.5;
    const spread = this.mode === "rain" ? 22 : 18;
    for (let i = 0; i < n; i++) {
      this.phases[i] = (this.phases[i] + step * (0.15 + (i % 7) * 0.02)) % 1;
      const px = cam.x + ((i * 17) % 40 - 20) * (spread / 20);
      const pz = cam.z + ((i * 13) % 36 - 18) * (spread / 18) - 8;
      const py = 14 - this.phases[i] * fall;
      this.dummy.position.set(px, py, pz);
      this.dummy.rotation.z = this.mode === "rain" ? 0.15 : 0;
      this.dummy.scale.setScalar(this.mode === "snow" ? 1 + (i % 5) * 0.12 : 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
