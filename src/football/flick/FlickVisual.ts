import * as THREE from "three";
import type { FlickBallState } from "./FlickBall";
import type { FlickFigureState } from "./FlickFigure";
import { FLICK_PITCH, type FlickPitchDims } from "./FlickPitch";

interface FigureMesh {
  root: THREE.Group;
  body: THREE.Group;
  base: THREE.Mesh;
  shelf: THREE.Mesh;
  rim: THREE.Mesh;
  select: THREE.Mesh;
  baseMat: THREE.MeshStandardMaterial;
  shelfMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshStandardMaterial;
  torsoMat: THREE.MeshStandardMaterial;
  teamColor: number;
  isGK: boolean;
}

/**
 * Flick pieces only — the REAL Stadium supplies pitch, goals, stands, and lighting.
 * Subbuteo bases: curved shell on the pitch, flat top for the figure (planar physics).
 * Bases are team-coloured so sides read clearly from above.
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

  /** Slightly under a hemisphere so the shell sits on its curve, flat shelf on top. */
  private static readonly BASE_PHI = Math.PI * 0.48;

  constructor(homeColor: number, awayColor: number, dims: FlickPitchDims = FLICK_PITCH) {
    this.dims = dims;
    this.homeColor = homeColor;
    this.awayColor = awayColor;
    this.group.name = "flickPieces";

    const ballGeo = new THREE.SphereGeometry(dims.ballRadius, 20, 16);
    this.ballMesh = new THREE.Mesh(
      ballGeo,
      new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.42 }),
    );
    this.ballMesh.castShadow = true;
    this.ballMesh.name = "flickBall";
    this.group.add(this.ballMesh);

    const aimMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
    this.aimLine = new THREE.Line(new THREE.BufferGeometry(), aimMat);
    this.aimLine.visible = false;
    this.group.add(this.aimLine);

    const ringInner = dims.figureRadius * 0.45;
    const ringOuter = dims.figureRadius * 0.7;
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(ringInner, ringOuter, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    this.group.add(this.aimRing);
  }

  /** True when this visual did not build a private tabletop board (Stadium hosts the pitch). */
  hasPrivatePitchBoard(): boolean {
    return this.group.children.some((c) => c.name === "flickTabletopBoard" || c.name === "flickTabletopPlay");
  }

  ensureFigures(figures: FlickFigureState[]): void {
    for (const f of figures) {
      if (this.figures.has(f.id)) continue;
      this.figures.set(f.id, this.buildFigure(f));
    }
  }

  /** Darken / lighten a team hex for base shell vs rim. */
  static shade(color: number, factor: number): number {
    const c = new THREE.Color(color);
    c.multiplyScalar(factor);
    c.r = Math.min(1, c.r);
    c.g = Math.min(1, c.g);
    c.b = Math.min(1, c.b);
    return c.getHex();
  }

  private buildFigure(f: FlickFigureState): FigureMesh {
    const color = f.side === "home" ? this.homeColor : this.awayColor;
    const r = f.radius;
    const phi = FlickVisual.BASE_PHI;
    // Cap height from curved tip to flat rim (just under a hemisphere).
    const baseH = r * (1 - Math.cos(phi));
    const rimR = r * Math.sin(phi);
    const root = new THREE.Group();
    root.name = f.id;

    // GK stays dark charcoal; outfield bases carry the club colour.
    const shellColor = f.isGK ? 0x1c1c1c : FlickVisual.shade(color, 0.42);
    const shelfColor = f.isGK ? 0x2a2a2a : FlickVisual.shade(color, 0.62);
    const rimColor = f.isGK ? 0x3a3a3a : color;

    const baseMat = new THREE.MeshStandardMaterial({
      color: shellColor,
      roughness: 0.5,
      metalness: 0.18,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    // Spherical cap from +Y pole; flip so the curve sits on the pitch and the flat faces up.
    const baseGeo = new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, phi);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.name = "flickBase";
    base.rotation.x = Math.PI;
    // Pole (curve) on playY; flat rim at playY + baseH.
    base.position.y = this.dims.playY + r;
    base.castShadow = true;
    root.add(base);

    // Flat shelf on the rim so the figure clearly stands on the base top.
    const shelfMat = new THREE.MeshStandardMaterial({
      color: shelfColor,
      roughness: 0.65,
      metalness: 0.1,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const shelf = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.98, 28), shelfMat);
    shelf.name = "flickShelf";
    shelf.rotation.x = -Math.PI / 2;
    shelf.position.y = this.dims.playY + baseH + 0.01;
    shelf.receiveShadow = true;
    root.add(shelf);

    // Team-coloured rim ring — reads the side from bird-view.
    const rimMat = new THREE.MeshStandardMaterial({
      color: rimColor,
      roughness: 0.45,
      metalness: 0.22,
      emissive: new THREE.Color(rimColor),
      emissiveIntensity: 0.15,
    });
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(rimR * 0.78, rimR * 1.02, 28),
      rimMat,
    );
    rim.name = "flickBaseRim";
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = this.dims.playY + baseH + 0.015;
    root.add(rim);

    const body = new THREE.Group();
    body.position.y = this.dims.playY + baseH;
    const torsoMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.28, r * 0.34, r * 0.95, 10),
      torsoMat,
    );
    torso.position.y = r * 0.55;
    torso.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.26, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.62 }),
    );
    head.position.y = r * 1.2;
    body.add(torso, head);
    if (f.isGK) {
      const gloves = new THREE.Mesh(
        new THREE.BoxGeometry(r * 0.65, r * 0.16, r * 0.24),
        new THREE.MeshStandardMaterial({ color: 0xf0d060 }),
      );
      gloves.position.y = r * 0.5;
      body.add(gloves);
    }
    root.add(body);

    const select = new THREE.Mesh(
      new THREE.RingGeometry(r * 1.05, r * 1.25, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    select.rotation.x = -Math.PI / 2;
    select.position.y = this.dims.playY + 0.02;
    select.visible = false;
    root.add(select);

    this.group.add(root);
    return {
      root,
      body,
      base,
      shelf,
      rim,
      select,
      baseMat,
      shelfMat,
      rimMat,
      torsoMat,
      teamColor: color,
      isGK: f.isGK,
    };
  }

  sync(
    figures: FlickFigureState[],
    ball: FlickBallState,
    selectedId: string | null,
    aim?: { fromX: number; fromZ: number; toX: number; toZ: number } | null,
    flash?: { ids: ReadonlySet<string>; phase: number } | null,
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
      // Keep Subbuteo orientation: curved shell down, flat top up.
      mesh.base.rotation.set(Math.PI, 0, 0);
      mesh.select.visible = f.id === selectedId;

      const flashing = !!(flash && flash.ids.has(f.id));
      if (flashing) {
        // Brief pulse so the active side's outfield pieces read clearly.
        const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(flash.phase * Math.PI * 4));
        const glow = new THREE.Color(mesh.teamColor);
        mesh.baseMat.emissive.copy(glow);
        mesh.baseMat.emissiveIntensity = 0.25 + pulse * 0.85;
        mesh.shelfMat.emissive.copy(glow);
        mesh.shelfMat.emissiveIntensity = 0.15 + pulse * 0.55;
        mesh.rimMat.emissive.copy(glow);
        mesh.rimMat.emissiveIntensity = 0.35 + pulse * 0.9;
        mesh.torsoMat.emissive.copy(glow);
        mesh.torsoMat.emissiveIntensity = pulse * 0.45;
      } else {
        mesh.baseMat.emissive.setHex(0x000000);
        mesh.baseMat.emissiveIntensity = 0;
        mesh.shelfMat.emissive.setHex(0x000000);
        mesh.shelfMat.emissiveIntensity = 0;
        mesh.rimMat.emissive.setHex(mesh.isGK ? 0x000000 : mesh.teamColor);
        mesh.rimMat.emissiveIntensity = mesh.isGK ? 0 : 0.15;
        mesh.torsoMat.emissive.setHex(0x000000);
        mesh.torsoMat.emissiveIntensity = 0;
      }
    }

    if (aim) {
      const y = this.dims.playY + 0.08;
      const pts = new Float32Array([aim.fromX, y, aim.fromZ, aim.toX, y, aim.toZ]);
      this.aimLine.geometry.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      this.aimLine.geometry.computeBoundingSphere();
      this.aimLine.visible = true;
      const pull = Math.hypot(aim.toX - aim.fromX, aim.toZ - aim.fromZ);
      this.aimRing.visible = true;
      this.aimRing.position.set(aim.fromX, this.dims.playY + 0.04, aim.fromZ);
      const s = 1 + Math.min(2.5, pull * 0.08);
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
