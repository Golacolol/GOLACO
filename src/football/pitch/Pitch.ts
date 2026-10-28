import * as THREE from "three";
import {
  CENTRE_CIRCLE_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_LENGTH,
  PENALTY_AREA_WIDTH,
  PENALTY_SPOT,
  SIX_YARD_LENGTH,
  SIX_YARD_WIDTH,
} from "../constants";
import type { EnvironmentPreset } from "../environment/Environment";

const LINE = 0.12;
const ARC_R = CENTRE_CIRCLE_RADIUS;

/** Sweep of the D that sits outside the penalty area, in RingGeometry radians (θ=0 is +X). */
export function penaltyArcSweep(dir: number): { thetaStart: number; thetaLength: number } {
  const inset = PENALTY_AREA_LENGTH - PENALTY_SPOT;
  const inner = ARC_R - LINE / 2;
  const half = Math.acos(Math.min(0.999, inset / inner)) + 0.035;
  return {
    thetaStart: dir > 0 ? Math.PI - half : -half,
    thetaLength: half * 2,
  };
}

export function createPitch(
  length = 105,
  width = 68,
  opts?: { park?: boolean },
): THREE.Group {
  const group = new THREE.Group();
  const park = !!opts?.park;
  const grassPad = park ? 10 : 6;
  const surroundLen = park ? length + 40 : length + 28;
  const surroundWid = park ? width + 40 : width + 24;
  const grassGeo = new THREE.PlaneGeometry(length + grassPad, width + grassPad, 32, 20);
  grassGeo.rotateX(-Math.PI / 2);
  const grass = new THREE.Mesh(
    grassGeo,
    new THREE.MeshStandardMaterial({
      map: grassTexture(length, width),
      roughness: 0.74,
      metalness: 0.03,
    }),
  );
  grass.receiveShadow = true;
  grass.name = "grass";
  group.add(grass);

  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf5f8f2, roughness: 0.45, emissive: 0x222222, emissiveIntensity: 0.08 });
  const addLine = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), lineMat);
    m.position.set(x, 0.02, z);
    m.receiveShadow = true;
    group.add(m);
  };
  addLine(length, 0.12, 0, HALF_WIDTH);
  addLine(length, 0.12, 0, -HALF_WIDTH);
  addLine(0.12, width, HALF_LENGTH, 0);
  addLine(0.12, width, -HALF_LENGTH, 0);
  addLine(0.12, width, 0, 0);

  const circle = new THREE.Mesh(
    new THREE.RingGeometry(CENTRE_CIRCLE_RADIUS - 0.08, CENTRE_CIRCLE_RADIUS + 0.04, 64),
    lineMat,
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.025;
  group.add(circle);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), lineMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.03;
  group.add(spot);

  const addBox = (dir: number) => {
    const x = dir * (HALF_LENGTH - PENALTY_AREA_LENGTH / 2);
    addLine(PENALTY_AREA_LENGTH, 0.12, x, PENALTY_AREA_WIDTH / 2);
    addLine(PENALTY_AREA_LENGTH, 0.12, x, -PENALTY_AREA_WIDTH / 2);
    addLine(0.12, PENALTY_AREA_WIDTH, dir * (HALF_LENGTH - PENALTY_AREA_LENGTH), 0);
    const sx = dir * (HALF_LENGTH - SIX_YARD_LENGTH / 2);
    addLine(SIX_YARD_LENGTH, 0.12, sx, SIX_YARD_WIDTH / 2);
    addLine(SIX_YARD_LENGTH, 0.12, sx, -SIX_YARD_WIDTH / 2);
    addLine(0.12, SIX_YARD_WIDTH, dir * (HALF_LENGTH - SIX_YARD_LENGTH), 0);
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), lineMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(dir * (HALF_LENGTH - PENALTY_SPOT), 0.03, 0);
    group.add(p);
    const sweep = penaltyArcSweep(dir);
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(ARC_R - LINE / 2, ARC_R + LINE / 2, 48, 1, sweep.thetaStart, sweep.thetaLength),
      lineMat,
    );
    arc.rotation.x = -Math.PI / 2;
    arc.position.set(dir * (HALF_LENGTH - PENALTY_SPOT), 0.04, 0);
    arc.name = dir > 0 ? "penalty-arc-plus" : "penalty-arc-minus";
    group.add(arc);
  };
  addBox(1);
  addBox(-1);

  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(surroundLen, surroundWid),
    new THREE.MeshStandardMaterial({ color: park ? 0x2a6336 : 0x2f6b3a, roughness: 0.95 }),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.04;
  surround.receiveShadow = true;
  surround.name = "surround";
  group.add(surround);
  return group;
}

function grassTexture(length: number, width: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1536;
  const ctx = canvas.getContext("2d")!;
  const stripes = 24;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#228544" : "#1a7338";
    ctx.fillRect((i * canvas.width) / stripes, 0, canvas.width / stripes, canvas.height);
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  void length;
  void width;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function applyPitchWeather(pitch: THREE.Group, env: EnvironmentPreset): void {
  const grass = pitch.getObjectByName("grass") as THREE.Mesh | undefined;
  if (!grass) return;
  const mat = grass.material as THREE.MeshStandardMaterial;
  mat.roughness = env.pitchRoughness;
  mat.metalness = env.pitchWetness * 0.18;
  const tint = env.pitchTint;
  mat.color.setRGB(1 + tint * 0.15, 1 + tint * 0.05, 1 - Math.abs(tint) * 0.08);
  mat.needsUpdate = true;
}
