/**
 * Shared skinned humanoid loader — one base GLB, cloned per player, AnimationMixer per instance.
 * Falls back gracefully when the asset is missing (procedural mannequin stays in PlayerVisual).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetUrl } from "../../core/assetUrl";
import type { TeamKit } from "../../data/schema";
import { hexColor } from "../../core/math";
import type { Gait } from "./PlayerAnimation";
import type { Player } from "./Player";

export const DEFAULT_PLAYER_MODEL = "assets/players/base_outfield.glb";

export type PlayerAnimClipKey =
  | "idle"
  | "walk"
  | "jog"
  | "run"
  | "sprint"
  | "pass"
  | "kick"
  | "receive"
  | "slide";

export interface SkinnedPlayerInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<PlayerAnimClipKey, THREE.AnimationAction>>;
  /** Materials we tint for kit / skin (cloned per instance). */
  kitMaterials: {
    shirt: THREE.MeshStandardMaterial[];
    shorts: THREE.MeshStandardMaterial[];
    socks: THREE.MeshStandardMaterial[];
    skin: THREE.MeshStandardMaterial[];
    boots: THREE.MeshStandardMaterial[];
  };
  activeClip: PlayerAnimClipKey | null;
}

interface Template {
  url: string;
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  clipMap: Partial<Record<PlayerAnimClipKey, THREE.AnimationClip>>;
}

const templates = new Map<string, Template>();
const inflight = new Map<string, Promise<Template | null>>();

const CLIP_ALIASES: Record<PlayerAnimClipKey, string[]> = {
  idle: ["Idle", "idle", "TPose", "Rest"],
  walk: ["Walk", "walk", "Walking"],
  jog: ["Jog", "jog", "Walk"],
  run: ["Run", "run", "Running"],
  sprint: ["Sprint", "sprint", "Run", "run"],
  pass: ["Pass", "pass", "Kick", "kick"],
  kick: ["Kick", "kick", "SoccerKick", "Shoot"],
  receive: ["Receive", "receive", "Idle", "idle"],
  slide: ["Slide", "slide", "Fall", "Death"],
};

function mapClips(clips: THREE.AnimationClip[]): Partial<Record<PlayerAnimClipKey, THREE.AnimationClip>> {
  const byName = new Map(clips.map((c) => [c.name, c]));
  const out: Partial<Record<PlayerAnimClipKey, THREE.AnimationClip>> = {};
  for (const key of Object.keys(CLIP_ALIASES) as PlayerAnimClipKey[]) {
    for (const alias of CLIP_ALIASES[key]) {
      const hit = byName.get(alias);
      if (hit) {
        out[key] = hit;
        break;
      }
    }
  }
  // Guarantees: if we only have Idle/Walk/Run (Soldier), fill jog/sprint from nearest.
  if (!out.jog && out.walk) out.jog = out.walk;
  if (!out.sprint && out.run) out.sprint = out.run;
  if (!out.pass && out.kick) out.pass = out.kick;
  if (!out.kick && out.pass) out.kick = out.pass;
  if (!out.receive && out.idle) out.receive = out.idle;
  return out;
}

function classifyMaterialSlot(name: string): keyof SkinnedPlayerInstance["kitMaterials"] | null {
  const n = name.toLowerCase();
  if (/skin|face|head|arm|hand|leg|flesh|body/.test(n) && !/shirt|jersey|sock|boot|pant|short/.test(n)) {
    return "skin";
  }
  if (/shirt|jersey|torso|chest|top|uniform|vest/.test(n)) return "shirt";
  if (/short|pant|hip|pelvis/.test(n)) return "shorts";
  if (/sock|hose|calf/.test(n)) return "socks";
  if (/boot|shoe|cleat|foot/.test(n)) return "boots";
  // Soldier.glb: typically "Body_Material" / "Clothes" etc.
  if (/cloth|outfit|gear/.test(n)) return "shirt";
  return null;
}

async function loadTemplate(url: string): Promise<Template | null> {
  const cached = templates.get(url);
  if (cached) return cached;
  const pending = inflight.get(url);
  if (pending) return pending;

  const job = (async () => {
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(assetUrl(url));
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      // Normalize approximate height to ~1.75m (Soldier is ~1.7–2).
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y > 0.2) {
        const s = 1.78 / size.y;
        scene.scale.setScalar(s);
        scene.updateMatrixWorld(true);
      }
      // Center feet on origin.
      const box2 = new THREE.Box3().setFromObject(scene);
      scene.position.y -= box2.min.y;
      scene.position.x -= (box2.min.x + box2.max.x) * 0.5;
      scene.position.z -= (box2.min.z + box2.max.z) * 0.5;

      const tmpl: Template = {
        url,
        scene,
        clips: gltf.animations ?? [],
        clipMap: mapClips(gltf.animations ?? []),
      };
      templates.set(url, tmpl);
      return tmpl;
    } catch (err) {
      console.warn("[PlayerModelLoader] failed to load", url, err);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, job);
  return job;
}

/** Resolve which GLB URL a player should use. */
export function resolvePlayerModelUrl(player: Player): string {
  const app = player.appearance as {
    fullBodyAsset?: string | null;
    modelId?: string;
  };
  if (app.fullBodyAsset) return app.fullBodyAsset.replace(/^\//, "");
  if (app.modelId) {
    const id = app.modelId.replace(/\.glb$/i, "");
    return `assets/players/${id}.glb`;
  }
  return DEFAULT_PLAYER_MODEL;
}

/** Preload default (+ optional extras) so match kick-off can clone sync-ish. */
export async function preloadPlayerModels(urls: string[] = [DEFAULT_PLAYER_MODEL]): Promise<void> {
  await Promise.all(urls.map((u) => loadTemplate(u)));
}

export function isPlayerModelReady(url = DEFAULT_PLAYER_MODEL): boolean {
  return templates.has(url);
}

/**
 * Clone a skinned instance. Returns null if the template is not loaded yet.
 */
export function cloneSkinnedPlayer(url: string): SkinnedPlayerInstance | null {
  const tmpl = templates.get(url);
  if (!tmpl) return null;

  const root = tmpl.scene.clone(true);
  // Clone materials so kit tint is per-player.
  const kitMaterials: SkinnedPlayerInstance["kitMaterials"] = {
    shirt: [],
    shorts: [],
    socks: [],
    skin: [],
    boots: [],
  };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = mats.map((m) => {
      const c = (m as THREE.Material).clone() as THREE.MeshStandardMaterial;
      const slot = classifyMaterialSlot(m.name || mesh.name || "");
      if (slot && "color" in c) kitMaterials[slot].push(c);
      // Unclassified cloth-like → shirt bucket so kit colour still lands.
      if (!slot && c.type === "MeshStandardMaterial") {
        kitMaterials.shirt.push(c);
      }
      return c;
    });
    mesh.material = cloned.length === 1 ? cloned[0]! : cloned;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions: SkinnedPlayerInstance["actions"] = {};
  for (const key of Object.keys(tmpl.clipMap) as PlayerAnimClipKey[]) {
    const clip = tmpl.clipMap[key];
    if (!clip) continue;
    actions[key] = mixer.clipAction(clip);
  }

  return { root, mixer, actions, kitMaterials, activeClip: null };
}

export function applyKitToSkinned(inst: SkinnedPlayerInstance, kit: TeamKit, skinToneHex: number, bootHex: number): void {
  const paint = (mats: THREE.MeshStandardMaterial[], hex: number, roughness = 0.55) => {
    for (const m of mats) {
      m.color.setHex(hex);
      m.roughness = roughness;
      m.metalness = Math.min(m.metalness ?? 0.05, 0.15);
      m.needsUpdate = true;
    }
  };
  paint(inst.kitMaterials.shirt, hexColor(kit.shirt), 0.42);
  paint(inst.kitMaterials.shorts, hexColor(kit.shorts), 0.58);
  paint(inst.kitMaterials.socks, hexColor(kit.socks), 0.68);
  paint(inst.kitMaterials.skin, skinToneHex, 0.7);
  paint(inst.kitMaterials.boots, bootHex, 0.3);

  // Optional: shirt map on first shirt material when kit asset exists.
  if (kit.shirtAsset && inst.kitMaterials.shirt[0]) {
    // Kit wrap texture is applied from PlayerVisual via setSkinnedShirtMap.
  }
}

export function setSkinnedShirtMap(inst: SkinnedPlayerInstance, map: THREE.Texture | null): void {
  for (const m of inst.kitMaterials.shirt) {
    m.map = map;
    if (map) m.color.setHex(0xffffff);
    m.needsUpdate = true;
  }
}

export function gaitToClip(gait: Gait): PlayerAnimClipKey {
  switch (gait) {
    case "IDLE":
      return "idle";
    case "WALK":
      return "walk";
    case "JOG":
      return "jog";
    case "RUN":
      return "run";
    case "SPRINT":
      return "sprint";
  }
}

/** Cross-fade to the clip that matches gameplay state. */
export function syncSkinnedAnimation(
  inst: SkinnedPlayerInstance,
  player: Player,
  dt: number,
): void {
  let want: PlayerAnimClipKey = gaitToClip(player.gait);
  if (player.sliding || player.slideRecoverTimer > 0) want = "slide";
  else if (player.kickTimer > 0 && !player.handRelease) want = player.kickTimer > 0.35 ? "kick" : "pass";
  else if (player.firstTouchTimer > 0.08) want = "receive";

  if (want !== inst.activeClip) {
    const next = inst.actions[want] ?? inst.actions.idle ?? inst.actions.walk ?? null;
    const prev = inst.activeClip ? inst.actions[inst.activeClip] : null;
    if (next) {
      next.reset();
      next.setEffectiveTimeScale(player.gait === "SPRINT" || player.boosting ? 1.15 : 1);
      next.setEffectiveWeight(1);
      next.fadeIn(0.12);
      next.play();
      if (prev && prev !== next) prev.fadeOut(0.12);
      inst.activeClip = want;
    }
  }
  inst.mixer.update(dt);
}
