/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  applyCylindricalBodyUVs,
  applyKitToSkinned,
  bakeHeightBandedKitWrap,
  classifyMaterialSlot,
  desiredSkinnedClip,
  gaitToClip,
  isSkinLikePixel,
  KIT_WRAP_BANDS,
  pickSkinnedAction,
  resolvePlayerModelUrl,
  skinnedSupportsTeamKit,
  tintBodyAlbedoMap,
  DEFAULT_PLAYER_MODEL,
  type SkinnedPlayerInstance,
} from "./PlayerModelLoader";
import type { Player } from "./Player";
import { AnimationAction, BufferAttribute, BufferGeometry, CanvasTexture, MeshStandardMaterial, Texture } from "three";
import type { TeamKit } from "../../data/schema";

describe("PlayerModelLoader", () => {
  it("maps gait to clip keys", () => {
    expect(gaitToClip("IDLE")).toBe("idle");
    expect(gaitToClip("WALK")).toBe("walk");
    expect(gaitToClip("JOG")).toBe("jog");
    expect(gaitToClip("RUN")).toBe("run");
    expect(gaitToClip("SPRINT")).toBe("sprint");
  });

  it("keeps off-ball runners on gait clips even with a leftover first-touch timer", () => {
    const moving = {
      gait: "RUN",
      hasBall: false,
      firstTouchTimer: 0.3,
      kickTimer: 0,
      sliding: false,
      slideRecoverTimer: 0,
      handRelease: false,
      boosting: false,
    } as unknown as Player;
    expect(desiredSkinnedClip(moving)).toBe("run");

    const onBall = { ...moving, hasBall: true } as unknown as Player;
    expect(desiredSkinnedClip(onBall)).toBe("receive");
  });

  it("collapses sprint onto the shared run action without inventing a new clip", () => {
    const runAction = { uuid: "run" } as unknown as AnimationAction;
    const inst = {
      actions: { run: runAction, walk: { uuid: "walk" } as unknown as AnimationAction },
      activeClip: null,
    } as unknown as SkinnedPlayerInstance;
    const sprint = pickSkinnedAction(inst, "sprint");
    const run = pickSkinnedAction(inst, "run");
    expect(sprint?.action).toBe(runAction);
    expect(run?.action).toBe(runAction);
    expect(sprint?.action).toBe(run?.action);
  });

  it("resolves default and custom model urls", () => {
    const base = {
      appearance: { fullBodyAsset: null, modelId: null },
    } as unknown as Player;
    expect(resolvePlayerModelUrl(base)).toBe(DEFAULT_PLAYER_MODEL);

    const byId = {
      appearance: { fullBodyAsset: null, modelId: "keeper_v1" },
    } as unknown as Player;
    expect(resolvePlayerModelUrl(byId)).toBe("assets/players/keeper_v1.glb");

    const byAsset = {
      appearance: { fullBodyAsset: "/assets/players/custom.glb", modelId: null },
    } as unknown as Player;
    expect(resolvePlayerModelUrl(byAsset)).toBe("assets/players/custom.glb");
  });

  it("classifies kit slots without treating full-body mats as skin", () => {
    expect(classifyMaterialSlot("Shirt_Mat")).toBe("shirt");
    expect(classifyMaterialSlot("Clothes")).toBe("shirt");
    expect(classifyMaterialSlot("Shorts")).toBe("shorts");
    expect(classifyMaterialSlot("Socks_L")).toBe("socks");
    expect(classifyMaterialSlot("Skin_Face")).toBe("skin");
    // Vanguard-style whole-character material must not become skin via classify —
    // cloneSkinnedPlayer collects it into shirt as a tint fallback instead.
    expect(classifyMaterialSlot("VanguardBodyMat")).toBeNull();
    expect(classifyMaterialSlot("Vanguard_VisorMat")).toBeNull();
  });

  it("treats full-body shirt fallback as kit-capable", () => {
    const empty = {
      kitMaterials: { shirt: [], shorts: [], socks: [], skin: [], boots: [] },
      bodyTintFallback: false,
    } as unknown as SkinnedPlayerInstance;
    expect(skinnedSupportsTeamKit(empty)).toBe(false);

    const bodyTint = {
      kitMaterials: {
        shirt: [{} as MeshStandardMaterial],
        shorts: [],
        socks: [],
        skin: [],
        boots: [],
      },
      bodyTintFallback: true,
    } as unknown as SkinnedPlayerInstance;
    expect(skinnedSupportsTeamKit(bodyTint)).toBe(true);
  });

  it("falls back to solid kit colour when wrap canvas cannot be baked", () => {
    const mat = new MeshStandardMaterial({ color: 0x111111, name: "VanguardBodyMat" });
    mat.map = new Texture();
    mat.normalMap = new Texture();

    const inst = {
      root: null,
      kitMaterials: { shirt: [mat], shorts: [], socks: [], skin: [], boots: [] },
      bodyTintFallback: true,
      activeClip: null,
    } as unknown as SkinnedPlayerInstance;

    const kit = { shirt: "#034694", shorts: "#fff", socks: "#034694" } as TeamKit;
    // jsdom has no canvas — bake returns null → solid kit colour (same as referee path).
    applyKitToSkinned(inst, kit, 0xb8896a, 0x101214, null);
    expect(mat.normalMap).toBeNull();
    expect(mat.color.getHex()).toBe(0x034694);
  });

  it("returns null from tintBodyAlbedoMap when source has no image", () => {
    expect(tintBodyAlbedoMap(new Texture(), 0x007a3d, 0xc48a6e)).toBeNull();
  });

  it("treats face tones as skin but not khaki armor / gray cloth", () => {
    expect(isSkinLikePixel(198, 148, 112)).toBe(true);
    expect(isSkinLikePixel(90, 95, 70)).toBe(false); // khaki armor
    expect(isSkinLikePixel(60, 62, 65)).toBe(false); // gray metal
    expect(isSkinLikePixel(40, 80, 40)).toBe(false); // olive cloth
  });

  it("tints full-body albedo so home and away kit colours stay far apart", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    // jsdom without the canvas package cannot rasterise — solid-kit fallback covers that path.
    if (!ctx) return;
    // Half khaki armor, half peach skin — mirrors Vanguard atlas mix.
    ctx.fillStyle = "rgb(90,95,70)";
    ctx.fillRect(0, 0, 16, 8);
    ctx.fillStyle = "rgb(198,148,112)";
    ctx.fillRect(0, 8, 16, 8);
    const src = new CanvasTexture(canvas);

    const home = tintBodyAlbedoMap(src, 0x034694, 0xb8896a)!;
    const away = tintBodyAlbedoMap(src, 0xffffff, 0xb8896a)!;
    expect(home).toBeTruthy();
    expect(away).toBeTruthy();

    const readMean = (tex: CanvasTexture) => {
      const c = tex.image as HTMLCanvasElement;
      const data = c.getContext("2d")!.getImageData(0, 0, 16, 8).data; // armor band only
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        n += 1;
      }
      return { r: r / n, g: g / n, b: b / n };
    };
    const hm = readMean(home);
    const am = readMean(away);
    const dist = Math.hypot(hm.r - am.r, hm.g - am.g, hm.b - am.b);
    expect(dist).toBeGreaterThan(80);
    expect(hm.b).toBeGreaterThan(hm.r); // navy kit stays blue-dominant
    expect(am.r).toBeGreaterThan(140); // white kit stays bright
  });

  it("bakes a height-banded kit wrap so shirt band matches team colour (not skin)", () => {
    const baked = bakeHeightBandedKitWrap(null, 0x034694, 0xffffff, 0x034694, 0xb8896a, 0x101214, 64);
    if (!baked) return; // jsdom without canvas
    const c = baked.image as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const mid = Math.floor(64 * (1 - (KIT_WRAP_BANDS.shortTop + KIT_WRAP_BANDS.shirtTop) / 2));
    const [r, , b] = ctx.getImageData(32, mid, 1, 1).data;
    expect(b).toBeGreaterThan(r); // navy shirt band
    expect(b).toBeGreaterThan(100);
    // Upper chest / Vanguard plate (~0.80) must stay in the shirt band, not flesh.
    const chestY = Math.floor(64 * (1 - 0.8));
    const [cr, , cb] = ctx.getImageData(32, chestY, 1, 1).data;
    expect(cb).toBeGreaterThan(cr);
    expect(cb).toBeGreaterThan(100);
    const headY = Math.floor(64 * (1 - 0.92));
    const [sr, , sb] = ctx.getImageData(32, headY, 1, 1).data;
    expect(sr).toBeGreaterThan(sb); // skin band stays warm
    expect(sr).toBeGreaterThan(80);
  });

  it("assigns cylindrical UVs from bind-pose positions (no extra kit meshes)", () => {
    const geo = new BufferGeometry();
    // Simple column: feet at y=0, head at y=2, front at -Z.
    const positions = new Float32Array([
      0, 0, -0.2, 0.2, 1, -0.2, -0.2, 1, -0.2, 0, 2, -0.2,
    ]);
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    applyCylindricalBodyUVs(geo, { faceNegZ: true });
    const uv = geo.getAttribute("uv");
    expect(uv.count).toBe(4);
    // Front (−Z) → u ≈ 0.5
    expect(uv.getX(0)).toBeCloseTo(0.5, 2);
    expect(uv.getY(0)).toBeCloseTo(0, 2); // feet
    expect(uv.getY(3)).toBeCloseTo(1, 2); // head
  });
});
