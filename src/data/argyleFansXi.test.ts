import { describe, expect, it } from "vitest";
import {
  ARGYLE_FANS_BENCH,
  ARGYLE_FANS_FORMATION,
  ARGYLE_FANS_LINEUP,
  ARGYLE_FANS_MEMBERSHIPS,
  ARGYLE_FANS_NAME,
  ARGYLE_FANS_PLAYERS,
  ARGYLE_FANS_XI,
} from "./argyleFansXi";

describe("Argyle Fans XI", () => {
  it("uses the Plymouth Argyle — FANSXI display name", () => {
    expect(ARGYLE_FANS_NAME).toBe("Plymouth Argyle — FANSXI");
  });
  it("starts the named 4-4-2-W eleven with the listed shirt numbers", () => {
    expect(ARGYLE_FANS_LINEUP.formation).toBe(ARGYLE_FANS_FORMATION);
    expect(ARGYLE_FANS_XI).toHaveLength(11);
    const byShirt = new Map(ARGYLE_FANS_MEMBERSHIPS.map((m) => [m.shirtNumber, m.playerId]));
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(1))?.displayName).toBe("CD-PAFC");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(2))?.displayName).toBe("Argyletweet");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(3))?.displayName).toBe("T. Bones");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(5))?.displayName).toBe("V. Doo");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(4))?.displayName).toBe("A. Tweets");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(11))?.displayName).toBe("S. ArgoTweets");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(6))?.displayName).toBe("A. Life");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(8))?.displayName).toBe("C. Pilgrim");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(7))?.displayName).toBe("L. Days");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(9))?.displayName).toBe("S. Down");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === byShirt.get(10))?.displayName).toBe("P. Face");
    expect(ARGYLE_FANS_LINEUP.starters.map((s) => s.playerId)).toEqual(ARGYLE_FANS_XI.map((s) => s.id));
  });

  it("keeps the three named substitutes on unique shirts", () => {
    expect(ARGYLE_FANS_BENCH.map((b) => b.shirtNumber)).toEqual([12, 13, 14]);
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === "player_fan_a_bradderz")?.displayName).toBe("A. Bradderz");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === "player_fan_p_petey")?.displayName).toBe("P. Petey");
    expect(ARGYLE_FANS_PLAYERS.find((p) => p.id === "player_fan_c_pilgrim_14")?.displayName).toBe("C. Pilgrim");
    const numbers = ARGYLE_FANS_MEMBERSHIPS.map((m) => m.shirtNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("assigns Fans XI starter portraits from images/", () => {
    const byId = new Map(ARGYLE_FANS_PLAYERS.map((p) => [p.id, p.appearance?.portraitAsset]));
    expect(byId.get("player_fan_cd_pafc")).toBe("/images/l8.png");
    expect(byId.get("player_fan_t_bones")).toBe("/images/l7.png");
    expect(byId.get("player_fan_c_pilgrim")).toBe("/images/l6.png");
    expect(byId.get("player_fan_v_doo")).toBe("/images/l4.png");
    expect(byId.get("player_fan_a_tweets")).toBe("/images/l3.png");
    expect(byId.get("player_fan_a_life")).toBe("/images/l23.png");
    expect(byId.get("player_fan_s_argotweets")).toBe("/images/l1.png");
    expect(byId.get("player_fan_argyletweet")).toBe("/images/l2.png");
    expect(byId.get("player_fan_l_days")).toBe("/images/l12.png");
    expect(byId.get("player_fan_p_face")).toBe("/images/l26.png");
    expect(byId.get("player_fan_s_down")).toBe("/images/l23.png");
  });

  it("profiles Argyletweet and A. Tweets as full-backs", () => {
    const lb = ARGYLE_FANS_PLAYERS.find((p) => p.id === "player_fan_argyletweet")!;
    const rb = ARGYLE_FANS_PLAYERS.find((p) => p.id === "player_fan_a_tweets")!;
    expect(lb.primaryPosition).toBe("LB");
    expect(rb.primaryPosition).toBe("RB");
    expect(lb.defending).toBeGreaterThanOrEqual(65);
    expect(rb.defending).toBeGreaterThanOrEqual(65);
    expect(lb.shooting).toBeLessThan(50);
    expect(rb.shooting).toBeLessThan(50);
    expect(ARGYLE_FANS_XI.find((s) => s.id === lb.id)?.slot).toBe("LB");
    expect(ARGYLE_FANS_XI.find((s) => s.id === rb.id)?.slot).toBe("RB");
  });
});
