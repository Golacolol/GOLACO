import * as THREE from "three";
import type { AdvertisingBoardRecord } from "../../data/schema";
import { PITCH_LENGTH, PITCH_WIDTH } from "../constants";

export interface AdSpan {
  x: number;
  z: number;
  w: number;
  rot: number;
}

export function pitchAdSpans(length = PITCH_LENGTH, width = PITCH_WIDTH, gap = 0.35): AdSpan[] {
  const hl = length / 2;
  const hw = width / 2;
  const offset = 1.42;
  const spans: AdSpan[] = [];
  const addLine = (ax: number, az: number, bx: number, bz: number, rot: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 2) return;
    const n = Math.max(1, Math.round(len / 10.5));
    const seg = len / n;
    const ux = dx / len;
    const uz = dz / len;
    for (let i = 0; i < n; i++) {
      const mid = (i + 0.5) * seg;
      spans.push({
        x: ax + ux * mid,
        z: az + uz * mid,
        w: seg,
        rot,
      });
    }
  };
  addLine(-hl + gap, hw + offset, hl - gap, hw + offset, 0);
  addLine(hl - gap, -hw - offset, -hl + gap, -hw - offset, Math.PI);
  addLine(hl + offset, -hw + gap, hl + offset, hw - gap, Math.PI / 2);
  addLine(-hl - offset, hw - gap, -hl - offset, -hw + gap, -Math.PI / 2);
  return spans;
}

export class AdvertisingBoards {
  readonly group = new THREE.Group();
  private boards: THREE.Mesh[] = [];

  constructor(records: AdvertisingBoardRecord[]) {
    const spans = pitchAdSpans();
    spans.forEach((spec, i) => {
      const rec = records[i % Math.max(1, records.length)] ?? { board: i, label: "ARGYLE", color: "#007A3D", textColor: "#FFFFFF" };
      const tex = makeAdTexture(rec, spec.w);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.45,
        metalness: 0.08,
        emissive: new THREE.Color(0x111111),
        emissiveMap: tex,
        emissiveIntensity: 0.28,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 1.05, 0.28), mat);
      mesh.position.set(spec.x, 0.64, spec.z);
      mesh.rotation.y = spec.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.boards.push(mesh);
    });
  }

  applyRecords(records: AdvertisingBoardRecord[]): void {
    this.boards.forEach((mesh, i) => {
      const rec = records[i % Math.max(1, records.length)];
      const tex = makeAdTexture(rec, (mesh.geometry as THREE.BoxGeometry).parameters.width);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.map = tex;
      mat.emissiveMap = tex;
      mat.needsUpdate = true;
    });
  }
}

export function makeAdTexture(rec: AdvertisingBoardRecord, widthM = 13): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = rec.color;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = rec.textColor ?? "#ffffff";
  ctx.font = "bold 58px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const repeats = Math.max(2, Math.round(widthM / 7));
  for (let i = 0; i < repeats; i++) {
    ctx.fillText(rec.label, ((i + 0.5) * 1024) / repeats, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
