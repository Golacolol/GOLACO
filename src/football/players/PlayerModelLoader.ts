/**
 * Shared skinned humanoid loader — one base GLB, cloned per player, AnimationMixer per instance.
 * Falls back gracefully when the asset is missing (procedural mannequin stays in PlayerVisual).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
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

/**
 * Map a GLB material/mesh name onto a kit tint slot.
 * Generic "body" meshes (e.g. VanguardBodyMat) are intentionally unclassified —
 * treating them as skin would paint the whole figure skin-tone and erase kits.
 */
export function classifyMaterialSlot(name: string): keyof SkinnedPlayerInstance["kitMaterials"] | null {
  const n = name.toLowerCase();
  if (/visor|helmet|weapon|gun|mask|optic/.test(n)) return null;
  if (/shirt|jersey|torso|chest|top|uniform|vest|cloth|outfit|gear|suit/.test(n)) return "shirt";
  if (/short|pant|hip|pelvis/.test(n)) return "shorts";
  if (/sock|hose|calf/.test(n)) return "socks";
  if (/boot|shoe|cleat|foot/.test(n)) return "boots";
  // Explicit skin tokens only — do not match bare "body" (full-character mats).
  if (/skin|face|flesh|headskin/.test(n)) return "skin";
  if (/(^|[^a-z])(arm|hand|leg)([^a-z]|$)/.test(n) && !/armor|alarm|legend/.test(n)) return "skin";
  return null;
}

/** True when the clone has a dedicated shirt (or clothes) slot we can tint for team kits. */
export function skinnedSupportsTeamKit(inst: SkinnedPlayerInstance): boolean {
  return inst.kitMaterials.shirt.length > 0;
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

  // SkeletonUtils remaps bones — Object3D.clone breaks SkinnedMesh bindings (invisible players).
  const root = cloneSkeleton(tmpl.scene) as THREE.Group;
  root.visible = true;
  root.frustumCulled = false;

  const kitMaterials: SkinnedPlayerInstance["kitMaterials"] = {
    shirt: [],
    shorts: [],
    socks: [],
    skin: [],
    boots: [],
  };
  let skinnedCount = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if ((mesh as THREE.Mesh).isMesh) {
      mesh.frustumCulled = false;
      mesh.visible = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    if (mesh.isSkinnedMesh) {
      skinnedCount += 1;
      // Ensure skeleton is bound after clone.
      if (mesh.skeleton) mesh.bind(mesh.skeleton, mesh.bindMatrix);
    }
    if (!(mesh as THREE.Mesh).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = mats.map((m) => {
      const c = (m as THREE.Material).clone() as THREE.MeshStandardMaterial;
      const slot = classifyMaterialSlot(m.name || mesh.name || "");
      if (slot && "color" in c) kitMaterials[slot].push(c);
      else if (!slot && /cloth|outfit|gear|suit/i.test(m.name || mesh.name || "")) {
        kitMaterials.shirt.push(c);
      }
      return c;
    });
    mesh.material = cloned.length === 1 ? cloned[0]! : cloned;
  });

  if (skinnedCount === 0) return null;

  // Leave unclassified full-body mats out of shirt — Vanguard-style meshes have no kit
  // slots; PlayerVisual keeps the procedural mannequin so team colours / wraps stay correct.

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
  const seen = new Set<THREE.MeshStandardMaterial>();
  const paint = (mats: THREE.MeshStandardMaterial[], hex: number, roughness = 0.55) => {
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      m.color.setHex(hex);
      m.roughness = roughness;
      m.metalness = Math.min(m.metalness ?? 0.05, 0.15);
      m.needsUpdate = true;
    }
  };
  // Shirt/shorts/socks first so a shared mat is never overwritten by skin.
  paint(inst.kitMaterials.shirt, hexColor(kit.shirt), 0.42);
  paint(inst.kitMaterials.shorts, hexColor(kit.shorts), 0.58);
  paint(inst.kitMaterials.socks, hexColor(kit.socks), 0.68);
  paint(inst.kitMaterials.boots, bootHex, 0.3);
  paint(inst.kitMaterials.skin, skinToneHex, 0.7);
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
