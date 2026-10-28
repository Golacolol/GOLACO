import * as THREE from "three";
import type { Match } from "../Match";

const _v = new THREE.Vector3();

export class FormationDebug {
  private group = new THREE.Group();
  private added = false;

  update(scene: THREE.Scene, match: Match, enabled: boolean): void {
    if (!enabled) {
      this.group.visible = false;
      return;
    }
    if (!this.added) {
      scene.add(this.group);
      this.added = true;
    }
    this.group.visible = true;
    this.group.clear();
    for (const p of match.allPlayers()) {
      this.marker(p.anchorX, p.anchorZ, 0x55aaff);
      this.marker(p.desiredX, p.desiredZ, 0xffaa33);
      if (p.id === match.pressingId) this.marker(p.x, p.z, 0xff3355, 0.55);
    }
  }

  private marker(x: number, z: number, color: number, r = 0.28): void {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    this.group.add(m);
    void _v;
  }
}
