import * as THREE from "three";
import type { FlickBallState } from "./FlickBall";
import type { FlickFigureState } from "./FlickFigure";
import { FLICK_PITCH, type FlickPitchDims } from "./FlickPitch";

interface FigureMesh {
  root: THREE.Group;
  body: THREE.Group;
  base: THREE.Mesh;
  select: THREE.Mesh;
}

/**
 * Tabletop pitch + figures on half-sphere bases (planar physics; lean is cosmetic only).
 */
export class FlickVisual {
  readonly group = new THREE.Group();
  private ballMesh: THREE.Mesh;
  private figures = new Map<string, FigureMesh>();
  private aimLine: THREE.Line;
  private aimRing: THREE.Mesh;
  private dims: FlickPitchDims;
  private homeColor: number;
  private awayColor: number;

  constructor(homeColor: number, awayColor: number, dims: FlickPitchDims = FLICK_PITCH) {
    this.dims = dims;
    this.homeColor = homeColor;
    this.awayColor = awayColor;
    this.buildPitch();
    const ballGeo = new THREE.SphereGeometry(dims.ballRadius, 20, 16);
    this.ballMesh = new THREE.Mesh(
      ballGeo,
      new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.42 }),
    );
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);

    const aimMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
    this.aimLine = new THREE.Line(new THREE.BufferGeometry(), aimMat);
    this.aimLine.visible = false;
    this.group.add(this.aimLine);

    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.18, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    this.group.add(this.aimRing);
  }

  private buildPitch(): void {
    const { dims } = this;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(dims.length + 0.7, 0.28, dims.width + 0.7),
      new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.78 }),
    );
    board.position.y = dims.playY - 0.16;
    this.group.add(board);

    const play = new THREE.Mesh(
      new THREE.BoxGeometry(dims.length, 0.05, dims.width),
      new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 }),
    );
    play.position.y = dims.playY - 0.02;
    play.receiveShadow = true;
    this.group.add(play);

    // Centre line / circle
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8efe8 });
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, dims.width), lineMat);
    mid.position.y = dims.playY;
    this.group.add(mid);
    const circle = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.12, 48),
      new THREE.MeshBasicMaterial({ color: 0xe8efe8, side: THREE.DoubleSide }),
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = dims.playY + 0.01;
    this.group.add(circle);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.55 });
    const h = dims.wallHeight;
    const specs: [number, number, number, number, number, number][] = [
      [dims.length + 0.15, h, 0.1, 0, dims.playY + h / 2, dims.width / 2 + 0.05],
      [dims.length + 0.15, h, 0.1, 0, dims.playY + h / 2, -dims.width / 2 - 0.05],
      [0.1, h, dims.width + 0.15, dims.length / 2 + 0.05, dims.playY + h / 2, 0],
      [0.1, h, dims.width + 0.15, -dims.length / 2 - 0.05, dims.playY + h / 2, 0],
    ];
    for (const [w, hh, d, x, y, z] of specs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), railMat);
      m.position.set(x, y, z);
      this.group.add(m);
    }

    const goalMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.02 });
    for (const sign of [-1, 1] as const) {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(dims.goalDepth * 1.1, h * 1.1, dims.goalWidth * 1.05),
        goalMat,
      );
      g.position.set(sign * (dims.length / 2 + dims.goalDepth * 0.4), dims.playY + 0.02, 0);
      this.group.add(g);
      // Goal posts
      const postMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.35 });
      for (const z of [-dims.goalWidth / 2, dims.goalWidth / 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), postMat);
        post.position.set(sign * (dims.length / 2), dims.playY + 0.28, z);
        this.group.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, dims.goalWidth), postMat);
      bar.position.set(sign * (dims.length / 2), dims.playY + 0.55, 0);
      this.group.add(bar);
    }
  }

  ensureFigures(figures: FlickFigureState[]): void {
    for (const f of figures) {
      if (this.figures.has(f.id)) continue;
      this.figures.set(f.id, this.buildFigure(f));
    }
  }

  private buildFigure(f: FlickFigureState): FigureMesh {
    const color = f.side === "home" ? this.homeColor : this.awayColor;
    const root = new THREE.Group();
    root.name = f.id;

    // Half-sphere base (dome) — flat cut on pitch; no physics tip.
    const baseGeo = new THREE.SphereGeometry(f.radius, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const baseMat = new THREE.MeshStandardMaterial({
      color: f.isGK ? 0x222222 : 0x1a1a1a,
      roughness: 0.55,
      metalness: 0.15,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = this.dims.playY;
    base.castShadow = true;
    root.add(base);

    const body = new THREE.Group();
    body.position.y = this.dims.playY + f.radius * 0.35;
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.38, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.48 }),
    );
    torso.position.y = 0.28;
    torso.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.62 }),
    );
    head.position.y = 0.55;
    body.add(torso, head);
    if (f.isGK) {
      const gloves = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.06, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xf0d060 }),
      );
      gloves.position.y = 0.22;
      body.add(gloves);
    }
    root.add(body);

    const select = new THREE.Mesh(
      new THREE.RingGeometry(f.radius * 1.05, f.radius * 1.25, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    select.rotation.x = -Math.PI / 2;
    select.position.y = this.dims.playY + 0.02;
    select.visible = false;
    root.add(select);

    this.group.add(root);
    return { root, body, base, select };
  }

  sync(
    figures: FlickFigureState[],
    ball: FlickBallState,
    selectedId: string | null,
    aim?: { fromX: number; fromZ: number; toX: number; toZ: number } | null,
  ): void {
    this.ensureFigures(figures);
    this.ballMesh.position.set(ball.x, ball.y, ball.z);

    for (const f of figures) {
      const mesh = this.figures.get(f.id);
      if (!mesh) continue;
      mesh.root.position.set(f.x, 0, f.z);
      mesh.root.rotation.y = f.facing;
      // Cosmetic lean only — never accumulates; settled figures are upright.
      mesh.body.rotation.x = f.leanX;
      mesh.body.rotation.z = f.leanZ;
      mesh.base.rotation.set(0, 0, 0);
      mesh.select.visible = f.id === selectedId;
    }

    if (aim) {
      const pts = new Float32Array([aim.fromX, this.dims.playY + 0.05, aim.fromZ, aim.toX, this.dims.playY + 0.05, aim.toZ]);
      this.aimLine.geometry.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      this.aimLine.geometry.computeBoundingSphere();
      this.aimLine.visible = true;
      const pull = Math.hypot(aim.toX - aim.fromX, aim.toZ - aim.fromZ);
      this.aimRing.visible = true;
      this.aimRing.position.set(aim.fromX, this.dims.playY + 0.03, aim.fromZ);
      const s = 1 + Math.min(2.5, pull * 2.2);
      this.aimRing.scale.setScalar(s);
    } else {
      this.aimLine.visible = false;
      this.aimRing.visible = false;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
