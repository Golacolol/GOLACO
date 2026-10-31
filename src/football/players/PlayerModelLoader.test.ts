import { describe, expect, it } from "vitest";
import {
  classifyMaterialSlot,
  gaitToClip,
  resolvePlayerModelUrl,
  skinnedSupportsTeamKit,
  DEFAULT_PLAYER_MODEL,
  type SkinnedPlayerInstance,
} from "./PlayerModelLoader";
import type { Player } from "./Player";
import type { MeshStandardMaterial } from "three";

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
    } as unknown as SkinnedPlayerInstance;
    expect(skinnedSupportsTeamKit(bodyTint)).toBe(true);
  });
});
