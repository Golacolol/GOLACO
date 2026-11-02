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

  it("formats single-year teams with the full year and no dash", () => {
    expect(formatPlayerCardTeamName("Italy — 1982")).toBe("Italy 1982");
    expect(formatPlayerCardTeamName("Italy - 1982")).toBe("Italy 1982");
    expect(formatPlayerCardTeamName("Portugal — 2016")).toBe("Portugal 2016");
    expect(formatPlayerCardTeamName("Germany — 2014")).toBe("Germany 2014");
    expect(formatPlayerCardTeamName("Boca Juniors — 2000")).toBe("Boca Juniors 2000");
    expect(formatPlayerCardTeamName("Argentina — 2022")).toBe("Argentina 2022");
    expect(formatPlayerCardTeamName("Italy 1982")).toBe("Italy 1982");
  });
});
