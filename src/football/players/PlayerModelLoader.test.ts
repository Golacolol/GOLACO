/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  applyKitToSkinned,
  classifyMaterialSlot,
  gaitToClip,
  resolvePlayerModelUrl,
  skinnedSupportsTeamKit,
  tintBodyAlbedoMap,
  DEFAULT_PLAYER_MODEL,
  type SkinnedPlayerInstance,
} from "./PlayerModelLoader";
import type { Player } from "./Player";
import { MeshStandardMaterial, Texture } from "three";
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
});
