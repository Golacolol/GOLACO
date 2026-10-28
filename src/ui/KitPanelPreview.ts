/**
 * Small in-panel WebGL mannequin for Kit Select — reuses createPlayerVisual kit wrap.
 */
import * as THREE from "three";
import type { SquadPlayer } from "../core/Database";
import type { TeamKit } from "../data/schema";
import { createPlayerVisual } from "../football/players/PlayerVisual";
import { Player } from "../football/players/Player";

export class KitPanelPreview {
  private host: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private root: THREE.Group | null = null;
  private spin = 0;
  private ro: ResizeObserver | null = null;
  private kitKey = "";

  get active(): boolean {
    return !!this.renderer;
  }

  /** Attach to `.kit-preview-host` (creates canvas if needed). */
  mount(host: HTMLElement): void {
    if (this.host === host && this.renderer) {
      this.resize();
      return;
    }
    this.dispose();
    this.host = host;
    host.replaceChildren();
    const canvas = document.createElement("canvas");
    canvas.className = "kit-preview-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    this.camera.position.set(0.55, 1.2, 2.85);
    this.camera.lookAt(0, 1.05, 0);

    const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x2a3a28, 1.05);
    const key = new THREE.DirectionalLight(0xfff2d6, 1.15);
    key.position.set(2.2, 4.5, 3.2);
    const fill = new THREE.DirectionalLight(0xa8c4ff, 0.35);
    fill.position.set(-2.5, 1.8, -1.5);
    this.scene.add(hemi, key, fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 40),
      new THREE.MeshBasicMaterial({ color: 0x06140c, transparent: true, opacity: 0.55 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    this.scene.add(ground);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  showPlayer(sp: SquadPlayer, kit: TeamKit, side: "home" | "away" = "home"): void {
    if (!this.scene || !this.renderer) return;
    const key = `${sp.player.id}|${kit.shirt}|${kit.shorts}|${kit.socks}|${kit.shirtAsset ?? ""}|${sp.shirtNumber}`;
    if (this.root && this.kitKey === key) return;
    this.kitKey = key;

    if (this.root) {
      this.scene.remove(this.root);
      this.root = null;
    }

    const p = new Player({
      id: sp.player.id,
      name: sp.player.name,
      displayName: sp.player.displayName,
      shirtNumber: sp.shirtNumber,
      position: sp.player.primaryPosition,
      slot: sp.player.primaryPosition,
      side,
      attrs: sp.attrs,
      overall: sp.overall,
      appearance: sp.player.appearance,
    });
    const vis = createPlayerVisual(p, kit, p.isGK);
    vis.group.position.set(0, 0, 0);
    vis.group.rotation.y = this.spin;
    this.root = vis.group;
    this.scene.add(vis.group);
    this.renderFrame();
  }

  tick(dt: number): void {
    if (!this.root || !this.renderer) return;
    this.spin += dt * 0.55;
    this.root.rotation.y = this.spin;
    this.renderFrame();
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
    if (this.root && this.scene) this.scene.remove(this.root);
    this.root = null;
    this.kitKey = "";
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    if (this.host) {
      this.host.replaceChildren();
      this.host = null;
    }
  }

  private resize(): void {
    if (!this.host || !this.renderer || !this.camera) return;
    const w = Math.max(2, this.host.clientWidth);
    const h = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderFrame();
  }

  private renderFrame(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }
}
