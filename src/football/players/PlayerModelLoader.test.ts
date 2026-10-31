/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  applyKitToSkinned,
  classifyMaterialSlot,
  gaitToClip,
  isSkinLikePixel,
  resolvePlayerModelUrl,
  skinnedSupportsTeamKit,
  tintBodyAlbedoMap,
  DEFAULT_PLAYER_MODEL,
  type SkinnedPlayerInstance,
} from "./PlayerModelLoader";
import type { Player } from "./Player";
import { CanvasTexture, MeshStandardMaterial, Texture } from "three";
import type { TeamKit } from "../../data/schema";

describe("PlayerModelLoader", () => {
  it("maps gait to clip keys", () => {
    expect(gaitToClip("IDLE")).toBe("idle");
    expect(gaitToClip("WALK")).toBe("walk");
    expect(gaitToClip("JOG")).toBe("jog");
    expect(gaitToClip("RUN")).toBe("run");
    expect(gaitToClip("SPRINT")).toBe("sprint");
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

  it("falls back to solid kit colour when body albedo cannot be read", () => {
    const mat = new MeshStandardMaterial({ color: 0x111111, name: "VanguardBodyMat" });
    // Texture with no drawable image — tintBodyAlbedoMap returns null.
    mat.map = new Texture();

    const inst = {
      kitMaterials: { shirt: [mat], shorts: [], socks: [], skin: [], boots: [] },
      bodyTintFallback: true,
      activeClip: null,
    } as unknown as SkinnedPlayerInstance;

    const kit = { shirt: "#034694", shorts: "#fff", socks: "#034694" } as TeamKit;
    applyKitToSkinned(inst, kit, 0xb8896a, 0x101214);
    expect(mat.map).toBeNull();
    expect(mat.color.getHex()).toBe(0x034694);
    expect(mat.userData.kitBaseMap).toBeTruthy();
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
});
