import { describe, expect, it } from "vitest";
import {
  classifyMaterialSlot,
  gaitToClip,
  resolvePlayerModelUrl,
  DEFAULT_PLAYER_MODEL,
} from "./PlayerModelLoader";
import type { Player } from "./Player";

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
    // Vanguard-style whole-character material must not become skin or shirt.
    expect(classifyMaterialSlot("VanguardBodyMat")).toBeNull();
    expect(classifyMaterialSlot("Vanguard_VisorMat")).toBeNull();
  });
});
