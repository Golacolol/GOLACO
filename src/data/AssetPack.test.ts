import { describe, expect, it, beforeEach } from "vitest";
import {
  fallbackPortraitFor,
  playerPortraitCandidates,
  resolvePlayerPortraitUrl,
  resolveTeamCrestUrl,
  setAssetPackManifestForTests,
  teamCrestCandidates,
} from "./AssetPack";

describe("AssetPack", () => {
  beforeEach(() => setAssetPackManifestForTests(null));

  it("resolves conventional player and crest paths", () => {
    expect(playerPortraitCandidates("player_hardie")[0]).toBe("/assets/players/player_hardie.png");
    expect(teamCrestCandidates("plymouth_argyle_current")[0]).toBe("/assets/crests/plymouth_argyle_current.png");
    expect(teamCrestCandidates("plymouth_argyle_current")).toContain("/assets/crests/plymouth_argyle.png");
    expect(teamCrestCandidates("classic_england_1996")).toContain("/assets/crests/classic_england.png");
    expect(teamCrestCandidates("classic_juventus_1997_98")).toContain("/assets/crests/classic_juventus.png");
  });

  it("lets explicit assets win over convention", () => {
    expect(resolvePlayerPortraitUrl("player_hardie", "/custom/face.png")).toBe("/custom/face.png");
    expect(resolveTeamCrestUrl("plymouth_argyle_current", "/custom/crest.svg")).toBe("/custom/crest.svg");
  });

  it("uses manifest mappings and fallback pool", () => {
    setAssetPackManifestForTests({
      players: { player_hardie: "/assets/players/hardie_hd.webp" },
      crests: { plymouth_argyle_current: "/assets/crests/pafc.png" },
      fallbackPortraits: ["/assets/players/_a.png", "/assets/players/_b.png"],
    });
    expect(resolvePlayerPortraitUrl("player_hardie", null)).toBe("/assets/players/hardie_hd.webp");
    expect(resolveTeamCrestUrl("plymouth_argyle_current", null)).toBe("/assets/crests/pafc.png");
    expect(fallbackPortraitFor("someone_else")).toMatch(/^\/assets\/players\/_/);
  });
});
