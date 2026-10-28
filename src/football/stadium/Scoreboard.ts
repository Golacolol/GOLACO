import * as THREE from "three";
import type { ScoreboardConfig } from "../../data/schema";

export interface ScoreboardView {
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
  home: number;
  away: number;
  clock: string;
  state: string;
  scorer?: string;
  scorerNumber?: number;
  homeColor: string;
  awayColor: string;
}

export class Scoreboard {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  readonly type: ScoreboardConfig["type"];
  private lastKey = "";

  constructor(config: ScoreboardConfig) {
    this.type = config.type;
    this.canvas = document.createElement("canvas");
    this.canvas.width = config.type === "LED_VIDEO_SCREEN" ? 1024 : 512;
    this.canvas.height = config.type === "LED_VIDEO_SCREEN" ? 512 : 256;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: this.texture,
      emissive: 0x222222,
      emissiveMap: this.texture,
      emissiveIntensity: config.type === "LED_VIDEO_SCREEN" ? 0.85 : 0.15,
      roughness: 0.35,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(config.width, config.height), mat);
    this.mesh.position.set(...config.position);
    this.mesh.rotation.set(...config.rotation);
    if (config.type === "NONE") this.mesh.visible = false;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + 0.55, config.height + 0.7, 0.55),
      new THREE.MeshStandardMaterial({ color: config.type === "LED_VIDEO_SCREEN" ? 0x111418 : 0x5a3b22, roughness: 0.55, metalness: 0.12 }),
    );
    frame.position.z = -0.32;
    this.mesh.add(frame);
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + 0.15, config.height + 0.15, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }),
    );
    bezel.position.z = -0.02;
    this.mesh.add(bezel);
    if (config.type === "LED_VIDEO_SCREEN") {
      const legGeo = new THREE.BoxGeometry(0.28, 6.5, 0.28);
      const steel = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.45, metalness: 0.35 });
      for (const x of [-config.width * 0.38, config.width * 0.38]) {
        const leg = new THREE.Mesh(legGeo, steel);
        leg.position.set(x, -config.height * 0.5 - 3.1, -0.5);
        this.mesh.add(leg);
      }
      const gantry = new THREE.Mesh(new THREE.BoxGeometry(config.width + 1.4, 0.22, 1.1), steel);
      gantry.position.set(0, config.height * 0.5 + 0.4, -0.6);
      this.mesh.add(gantry);
    }
  }

  draw(view: ScoreboardView): void {
    const key = `${view.home}|${view.away}|${view.clock}|${view.state}|${view.scorer ?? ""}|${view.scorerNumber ?? ""}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const { ctx, canvas } = this;
    if (this.type === "TRADITIONAL_SCOREBOARD") {
      ctx.fillStyle = "#5c3b1e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f0e6c8";
      ctx.font = "bold 42px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("HOME", canvas.width * 0.28, 70);
      ctx.fillText("AWAY", canvas.width * 0.72, 70);
      ctx.fillStyle = "#111";
      ctx.fillRect(50, 100, 150, 110);
      ctx.fillRect(canvas.width - 200, 100, 150, 110);
      ctx.fillStyle = "#e23";
      ctx.font = "bold 88px monospace";
      ctx.fillText(String(view.home), 125, 185);
      ctx.fillText(String(view.away), canvas.width - 125, 185);
      ctx.fillStyle = "#f0e6c8";
      ctx.font = "24px Georgia, serif";
      ctx.fillText(view.clock, canvas.width / 2, 236);
      this.texture.needsUpdate = true;
      return;
    }
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (view.state === "GOAL" || view.state === "GOAL_CELEBRATION") {
      ctx.fillStyle = view.homeColor;
      ctx.fillRect(0, 0, canvas.width, 90);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 72px Impact, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GOAL", canvas.width / 2, 70);
      ctx.font = "bold 40px Arial";
      ctx.fillText(view.scorer ?? "", canvas.width / 2, 160);
      if (view.scorerNumber) ctx.fillText(`#${view.scorerNumber}`, canvas.width / 2, 210);
    } else {
      ctx.fillStyle = view.homeColor;
      ctx.fillRect(0, 0, canvas.width / 2, 120);
      ctx.fillStyle = view.awayColor;
      ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, 120);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 42px Arial";
      ctx.textAlign = "center";
      ctx.fillText(view.homeName.toUpperCase().slice(0, 14), canvas.width * 0.25, 50);
      ctx.fillText(view.awayName.toUpperCase().slice(0, 14), canvas.width * 0.75, 50);
      ctx.font = "bold 28px Arial";
      ctx.fillText(view.homeAbbr, canvas.width * 0.25, 95);
      ctx.fillText(view.awayAbbr, canvas.width * 0.75, 95);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 120px Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${view.home}  -  ${view.away}`, canvas.width / 2, 340);
    ctx.font = "bold 48px Arial";
    ctx.fillText(view.clock, canvas.width / 2, 430);
    ctx.font = "24px Arial";
    ctx.fillStyle = "#9f9";
    ctx.fillText(view.state.replaceAll("_", " "), canvas.width / 2, 490);
    this.texture.needsUpdate = true;
  }

  setEmissive(intensity: number): void {
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = this.type === "LED_VIDEO_SCREEN" ? intensity : Math.min(0.2, intensity * 0.2);
  }
}
