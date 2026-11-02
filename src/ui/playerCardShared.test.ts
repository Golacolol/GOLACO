/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { formatPlayerCardTeamName } from "./playerCardShared";

describe("formatPlayerCardTeamName", () => {
  it("keeps fan / current names without season suffixes", () => {
    expect(formatPlayerCardTeamName("Plymouth Argyle Fans")).toBe("Plymouth Argyle Fans");
    expect(formatPlayerCardTeamName("Plymouth Argyle — FANS")).toBe("Plymouth Argyle Fans");
    expect(formatPlayerCardTeamName("Plymouth Argyle - Fans")).toBe("Plymouth Argyle Fans");
    expect(formatPlayerCardTeamName("Plymouth Argyle")).toBe("Plymouth Argyle");
  });

  it("drops the dash and century digits from classic seasons", () => {
    expect(formatPlayerCardTeamName("Inter Milan — 1993/94")).toBe("Inter Milan 93/94");
    expect(formatPlayerCardTeamName("Inter Milan - 1993/94")).toBe("Inter Milan 93/94");
    expect(formatPlayerCardTeamName("Plymouth Argyle — 2021/22")).toBe("Plymouth Argyle 21/22");
    expect(formatPlayerCardTeamName("Chelsea — 2004/05 Mourinho")).toBe("Chelsea 04/05 Mourinho");
    expect(formatPlayerCardTeamName("Liverpool — 2004/05 Istanbul")).toBe("Liverpool 04/05 Istanbul");
  });
});
