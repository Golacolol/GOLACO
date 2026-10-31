import * as THREE from "three";
import type { TableLayout, TableSkin } from "./TableLayouts";
import type { TableRodState } from "./TableRod";
import type { TableBallState } from "./TableBall";

const SKIN: Record<
  TableSkin,
  { play: number; rail: number; cabinet: number; home: number; away: number }
> = {
  wood_aged: {
    play: 0x2f6b3a,
    rail: 0x5c3a1e,
    cabinet: 0x3d2814,
    home: 0xc4a35a,
    away: 0x3a4a6b,
  },
  tournament_slick: {
    play: 0x1e7a3c,
    rail: 0x1a1a1e,
    cabinet: 0x2a2a32,
    home: 0xe8e8ef,
    away: 0xb83232,
  },
  custom_matte: {
    play: 0x356b45,
    rail: 0x4a5560,
    cabinet: 0x2e3640,
    home: 0xd4c48a,
    away: 0x4a6a9a,
  },
};

export class TableVisual {
  readonly group = new THREE.Group();
  private ballMesh: THREE.Mesh;
  private rodGroups: THREE.Group[] = [];
  private manMeshes: THREE.Mesh[][] = [];
  private selectMats: THREE.MeshStandardMaterial[] = [];
  private layout: TableLayout;

  constructor(layout: TableLayout) {
    this.layout = layout;
    this.buildCabinet();
    this.buildRods();
    const ballGeo = new THREE.SphereGeometry(layout.dims.ballRadius, 16, 12);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.45 });
    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);
  }

  private buildCabinet(): void {
    const { dims, skin } = this.layout;
    const c = SKIN[skin];
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(dims.length + 0.6, 0.55, dims.width + 0.6),
      new THREE.MeshStandardMaterial({ color: c.cabinet, roughness: 0.72 }),
    );
    cab.position.y = 0.05;
    this.group.add(cab);

    const play = new THREE.Mesh(
      new THREE.BoxGeometry(dims.length, 0.06, dims.width),
      new THREE.MeshStandardMaterial({ color: c.play, roughness: 0.88 }),
    );
    play.position.y = dims.playY - 0.03;
    play.receiveShadow = true;
    this.group.add(play);

    const railMat = new THREE.MeshStandardMaterial({ color: c.rail, roughness: 0.55 });
    const railH = dims.wallHeight;
    const specs: [number, number, number, number, number, number][] = [
      [dims.length + 0.2, railH, 0.1, 0, dims.playY + railH / 2, dims.width / 2 + 0.05],
      [dims.length + 0.2, railH, 0.1, 0, dims.playY + railH / 2, -dims.width / 2 - 0.05],
      [0.1, railH, dims.width + 0.2, dims.length / 2 + 0.05, dims.playY + railH / 2, 0],
      [0.1, railH, dims.width + 0.2, -dims.length / 2 - 0.05, dims.playY + railH / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of specs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), railMat);
      m.position.set(x, y, z);
      this.group.add(m);
    }

    // Deep black mouths so a scored ball can vanish into the abyss.
    const goalMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.02 });
    for (const sign of [-1, 1] as const) {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(dims.goalDepth * 1.15, dims.wallHeight * 1.05, dims.goalWidth * 1.05),
        goalMat,
      );
      g.position.set(sign * (dims.length / 2 + dims.goalDepth * 0.42), dims.playY + 0.02, 0);
      this.group.add(g);
    }
  }

  private buildRods(): void {
    const { dims, skin } = this.layout;
    const c = SKIN[skin];
    this.rodGroups = [];
    this.manMeshes = [];
    this.selectMats = [];

    for (const spec of this.layout.rods) {
      const rg = new THREE.Group();
      // Rod axis along Z at fixed X
      rg.position.set(spec.x, dims.playY + dims.manHeight * 0.42, 0);

      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(dims.rodRadius, dims.rodRadius, dims.width * 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x9a9aa4, metalness: 0.7, roughness: 0.32 }),
      );
      bar.rotation.x = Math.PI / 2;
      rg.add(bar);

      const color = spec.side === "home" ? c.home : c.away;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      this.selectMats.push(mat);
      const men: THREE.Mesh[] = [];
      for (let i = 0; i < spec.men; i++) {
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(dims.manRadius * 0.8, dims.manHeight * 0.4, 3, 6),
          mat,
        );
        body.castShadow = true;
        // Hang below rod axis so Z-rotation sweeps feet through play
        body.position.y = -dims.manHeight * 0.28;
        rg.add(body);
        men.push(body);
      }
      this.group.add(rg);
      this.rodGroups.push(rg);
      this.manMeshes.push(men);
    }
  }

  sync(rods: TableRodState[], ball: TableBallState, selectedHome: number[], selectedAway: number[]): void {
    this.ballMesh.position.set(ball.x, ball.y, ball.z);
    // Hide once the ball is deep inside either goal mouth.
    const half = this.layout.dims.length / 2;
    const inAbyss =
      Math.abs(ball.x) > half + this.layout.dims.goalDepth * 0.35 &&
      Math.abs(ball.z) < this.layout.dims.goalWidth * 0.55;
    this.ballMesh.visible = !inAbyss || ball.y > this.layout.dims.playY - 0.05;
    const hang = -this.layout.dims.manHeight * 0.28;

    for (let i = 0; i < rods.length; i++) {
      const rod = rods[i];
      const rg = this.rodGroups[i];
      if (!rg || !rod) continue;
      // Rotate around rod axis (Z)
      rg.rotation.set(0, 0, rod.angle);

      const slideZ = rod.slide * rod.maxSlide;
      const meshes = this.manMeshes[i];
      for (let m = 0; m < meshes.length; m++) {
        const lz = rod.manZs[m] ?? 0;
        meshes[m].position.set(0, hang, lz + slideZ);
      }

      const sel =
        rod.spec.side === "home"
          ? selectedHome.includes(rod.spec.index)
          : selectedAway.includes(rod.spec.index);
      const mat = this.selectMats[i];
      if (mat) {
        mat.emissive.setHex(sel ? 0x446622 : 0x000000);
        mat.emissiveIntensity = sel ? 0.4 : 0;
      }
    }
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });
  }
}
