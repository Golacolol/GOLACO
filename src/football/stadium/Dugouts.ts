import * as THREE from "three";
import { clamp, hexColor, lerp } from "../../core/math";
import type { TeamKit } from "../../data/schema";
import { HALF_WIDTH } from "../constants";
import { Player } from "../players/Player";
import { createPlayerVisual, updatePlayerAnimation } from "../players/PlayerVisual";
import type { PlayerAttributes } from "../../data/schema";

const ATTRS: PlayerAttributes = {
  pace: 48,
  passing: 50,
  longPassing: 50,
  vision: 55,
  control: 50,
  dribbling: 40,
  shooting: 30,
  finishing: 28,
  shotPower: 40,
  longShots: 30,
  defending: 40,
  strength: 55,
  stamina: 70,
  composure: 60,
};

export const HOME_DUGOUT_X = -11;
export const AWAY_DUGOUT_X = 11;

export function technicalArea(side: "home" | "away"): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const cx = side === "home" ? HOME_DUGOUT_X : AWAY_DUGOUT_X;
  return {
    minX: cx - 6.4,
    maxX: cx + 6.4,
    minZ: HALF_WIDTH + 0.55,
    maxZ: HALF_WIDTH + 3.2,
  };
}

interface SidelineActor {
  player: Player;
  kind: "manager" | "jog" | "stretch" | "sit";
  side: "home" | "away";
  phase: number;
  pause: number;
  dir: number;
}

export class Dugouts {
  readonly group = new THREE.Group();
  private actors: SidelineActor[] = [];
  private time = 0;

  constructor(homeKit: TeamKit, awayKit: TeamKit, homeColor: string, awayColor: string) {
    this.buildShelter(HOME_DUGOUT_X, homeColor, "HOME");
    this.buildShelter(AWAY_DUGOUT_X, awayColor, "AWAY");
    this.spawnSide("home", homeKit, homeColor);
    this.spawnSide("away", awayKit, awayColor);
  }

  private buildShelter(x: number, color: string, label: string): void {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.55, metalness: 0.12 });
    const seat = new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: 0.7 });
    const paint = new THREE.MeshStandardMaterial({ color: hexColor(color), roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f2, roughness: 0.45 });

    const roof = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.16, 3.4), dark);
    roof.position.set(x, 2.35, HALF_WIDTH + 4.35);
    roof.rotation.x = -0.08;
    const back = new THREE.Mesh(new THREE.BoxGeometry(13.2, 1.7, 0.22), paint);
    back.position.set(x, 1.35, HALF_WIDTH + 5.55);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.38, 0.95), seat);
    bench.position.set(x, 0.52, HALF_WIDTH + 4.15);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.12, 3.2), dark);
    deck.position.set(x, 0.08, HALF_WIDTH + 4.4);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), dark);
    const postR = postL.clone();
    postL.position.set(x - 6.3, 1.15, HALF_WIDTH + 3.1);
    postR.position.set(x + 6.3, 1.15, HALF_WIDTH + 3.1);
    this.group.add(roof, back, bench, deck, postL, postR);

    const area = technicalArea(x < 0 ? "home" : "away");
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mkLine = (w: number, d: number, px: number, pz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), lineMat);
      m.position.set(px, 0.03, pz);
      this.group.add(m);
    };
    mkLine(area.maxX - area.minX, 0.08, x, area.minZ);
    mkLine(area.maxX - area.minX, 0.08, x, area.maxZ);
    mkLine(0.08, area.maxZ - area.minZ, area.minX, (area.minZ + area.maxZ) / 2);
    mkLine(0.08, area.maxZ - area.minZ, area.maxX, (area.minZ + area.maxZ) / 2);

    const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.32, 0.08), white);
    plaque.position.set(x, 2.05, HALF_WIDTH + 5.42);
    this.group.add(plaque);
    void label;
  }

  private spawnSide(side: "home" | "away", kit: TeamKit, color: string): void {
    const cx = side === "home" ? HOME_DUGOUT_X : AWAY_DUGOUT_X;
    const area = technicalArea(side);
    const manager = dummyPlayer(`${side}-mgr`, 0, side, "CM");
    manager.x = cx;
    manager.z = (area.minZ + area.maxZ) / 2;
    manager.facing = Math.PI;
    const vis = createPlayerVisual(manager, kit, false);
    manager.mesh = vis.group;
    addCoat(vis.group, color);
    this.group.add(vis.group);
    this.actors.push({ player: manager, kind: "manager", side, phase: Math.random() * 8, pause: 0, dir: 1 });

    for (let i = 0; i < 3; i++) {
      const jog = dummyPlayer(`${side}-wu${i}`, 12 + i, side, "ST");
      jog.x = cx + (side === "home" ? -10 : 10) + i * 1.4;
      jog.z = HALF_WIDTH + 5.2;
      jog.facing = 0;
      const jv = createPlayerVisual(jog, kit, false);
      jog.mesh = jv.group;
      this.group.add(jv.group);
      this.actors.push({ player: jog, kind: "jog", side, phase: i * 1.7, pause: 0, dir: 1 });
    }

    const stretch = dummyPlayer(`${side}-str`, 16, side, "CM");
    stretch.x = cx + (side === "home" ? -8.5 : 8.5);
    stretch.z = HALF_WIDTH + 4.7;
    stretch.facing = Math.PI;
    const sv = createPlayerVisual(stretch, kit, false);
    stretch.mesh = sv.group;
    this.group.add(sv.group);
    this.actors.push({ player: stretch, kind: "stretch", side, phase: 0, pause: 0, dir: 1 });

    for (let i = 0; i < 4; i++) {
      const sit = dummyPlayer(`${side}-sub${i}`, 18 + i, side, "CM");
      sit.x = cx - 4.2 + i * 2.7;
      sit.z = HALF_WIDTH + 4.15;
      sit.facing = Math.PI;
      const bv = createPlayerVisual(sit, kit, false);
      sit.mesh = bv.group;
      this.group.add(bv.group);
      this.actors.push({ player: sit, kind: "sit", side, phase: i * 0.4, pause: 0, dir: 1 });
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const a of this.actors) {
      a.phase += dt;
      const p = a.player;
      if (a.kind === "manager") {
        const area = technicalArea(a.side);
        a.pause = Math.max(0, a.pause - dt);
        if (a.pause <= 0) {
          p.x += a.dir * dt * 1.15;
          if (p.x > area.maxX - 0.8) {
            a.dir = -1;
            a.pause = 0.8 + (a.phase % 1.4);
          }
          if (p.x < area.minX + 0.8) {
            a.dir = 1;
            a.pause = 0.7 + (a.phase % 1.1);
          }
          p.x = clamp(p.x, area.minX + 0.6, area.maxX - 0.6);
        }
        p.z = lerp(p.z, (area.minZ + area.maxZ) / 2 + Math.sin(this.time * 0.35 + a.phase) * 0.55, Math.min(1, dt * 2));
        p.z = clamp(p.z, area.minZ + 0.25, area.maxZ - 0.25);
        p.facing = a.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.vx = a.pause > 0 ? 0 : a.dir * 1.15;
        p.vz = 0;
        updatePlayerAnimation(p, dt, this.time);
        const rig = p.mesh?.userData.rig as { rightArm: THREE.Object3D; leftArm: THREE.Object3D } | undefined;
        if (rig && Math.sin(this.time * 0.7 + a.phase) > 0.55) {
          rig.rightArm.rotation.x = -1.6;
          rig.leftArm.rotation.x = 0.2;
        }
        continue;
      }
      if (a.kind === "jog") {
        const cx = a.side === "home" ? HOME_DUGOUT_X - 12 : AWAY_DUGOUT_X + 12;
        const ox = 3.2;
        const oz = 1.15;
        const t = a.phase * 0.55;
        const cycle = t % 4;
        if (cycle < 1) {
          p.x = cx - ox + cycle * ox * 2;
          p.z = HALF_WIDTH + 5.1;
          p.facing = Math.PI / 2;
        } else if (cycle < 2) {
          p.x = cx + ox;
          p.z = HALF_WIDTH + 5.1 + (cycle - 1) * oz * 2;
          p.facing = 0;
        } else if (cycle < 3) {
          p.x = cx + ox - (cycle - 2) * ox * 2;
          p.z = HALF_WIDTH + 5.1 + oz * 2;
          p.facing = -Math.PI / 2;
        } else {
          p.x = cx - ox;
          p.z = HALF_WIDTH + 5.1 + oz * 2 - (cycle - 3) * oz * 2;
          p.facing = Math.PI;
        }
        p.vx = 2.4;
        p.sprinting = false;
        updatePlayerAnimation(p, dt, this.time);
        continue;
      }
      if (a.kind === "stretch") {
        p.vx = 0;
        p.vz = 0;
        updatePlayerAnimation(p, dt, this.time);
        const rig = p.mesh?.userData.rig as { torso: THREE.Object3D; leftLeg: THREE.Object3D; rightLeg: THREE.Object3D } | undefined;
        if (rig) {
          rig.torso.rotation.x = 0.55 + Math.sin(this.time * 1.4 + a.phase) * 0.25;
          rig.leftLeg.rotation.x = -0.35;
          rig.rightLeg.rotation.x = 0.15;
        }
        continue;
      }
      p.vx = 0;
      p.vz = 0;
      if (p.mesh) {
        p.mesh.position.set(p.x, 0.42, p.z);
        p.mesh.rotation.y = p.facing;
        p.mesh.rotation.x = 0.18;
        const rig = p.mesh.userData.rig as { leftLeg: THREE.Object3D; rightLeg: THREE.Object3D; leftArm: THREE.Object3D; rightArm: THREE.Object3D } | undefined;
        if (rig) {
          rig.leftLeg.rotation.x = -1.15;
          rig.rightLeg.rotation.x = -1.15;
          rig.leftArm.rotation.x = -0.35 + Math.sin(this.time * 0.8 + a.phase) * 0.08;
          rig.rightArm.rotation.x = -0.25;
        }
      }
    }
  }
}

function dummyPlayer(id: string, number: number, side: "home" | "away", slot: string): Player {
  return new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: number,
    position: slot === "ST" ? "ST" : "CM",
    slot,
    side,
    attrs: ATTRS,
    overall: 62,
    appearance: {
      skinTone: 0.35 + Math.random() * 0.45,
      hairStyle: Math.random() > 0.7 ? "short" : "fade",
      hairColor: "#1a140f",
      heightScale: 0.96 + Math.random() * 0.08,
    },
  });
}

function addCoat(group: THREE.Group, color: string): void {
  const coat = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.78, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.62 }),
  );
  coat.position.y = 1.22;
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.78, 0.36),
    new THREE.MeshStandardMaterial({ color: hexColor(color), roughness: 0.5 }),
  );
  trim.position.set(-0.22, 1.22, 0);
  group.add(coat, trim);
}
