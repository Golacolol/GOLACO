import { describe, expect, it } from "vitest";
import {
  applyBioToPlayer,
  estimateWeightKg,
  findBioForPlayer,
  heightScaleFromCm,
  normalizePlayerName,
  parseOpenfootballPlayerLine,
  parseOpenfootballPlayersText,
} from "./openfootballBios.mjs";
import { mapFootballJsonMatches, parseFootballJsonScore } from "./footballJsonResults.mjs";
import { isFootballPortrait, nameInTitle } from "./portraitMatch.mjs";

describe("openfootball bios", () => {
  it("parses height, dob, and birthplace", () => {
    const row = parseOpenfootballPlayerLine(
      "Chris Rigg,                   M,  1.75 m,  b. 18 Jun 2007 @ Hebburn",
    );
    expect(row?.name).toBe("Chris Rigg");
    expect(row?.heightCm).toBe(175);
    expect(row?.birthplace).toBe("Hebburn");
    expect(row?.age).toBeGreaterThan(15);
  });

  it("accepts missing height", () => {
    const row = parseOpenfootballPlayerLine("Harry Howell,                 F,  - ,      b. 29 Sep 2008");
    expect(row?.heightCm).toBeUndefined();
    expect(row?.name).toBe("Harry Howell");
  });

  it("parses dual positions like M|F", () => {
    const row = parseOpenfootballPlayerLine(
      "Xavier Amaechi,               M|F,1.79 m,  b. 5 Jan 2001 @ Bath",
    );
    expect(row?.name).toBe("Xavier Amaechi");
    expect(row?.heightCm).toBe(179);
    expect(row?.birthplace).toBe("Bath");
  });

  it("matches full names and initial+surname", () => {
    const text = "Michael Cooper,               G,  1.91 m,  b. 8 Oct 1999 @ Kingston upon Thames\n";
    const idx = parseOpenfootballPlayersText(text);
    const full = findBioForPlayer({ name: "Michael Cooper" }, idx);
    expect(full?.heightCm).toBe(191);
    const short = findBioForPlayer({ name: "M. Cooper" }, idx);
    expect(short?.heightCm).toBe(191);
  });

  it("fills height, age, estimated weight", () => {
    const bio = parseOpenfootballPlayerLine(
      "Jude Bellingham,              M,  1.80 m,  b. 29 Jun 2003 @ Stourbridge",
    );
    const { player, changed } = applyBioToPlayer(
      { id: "x", name: "Jude Bellingham", primaryPosition: "CM" },
      bio,
    );
    expect(changed).toBe(true);
    expect(player.heightCm).toBe(180);
    expect(player.weightKg).toBe(estimateWeightKg(180, "M"));
    expect(player.appearance?.heightScale).toBe(heightScaleFromCm(180));
    expect(player.appearance?.fullName).toBe("Jude Bellingham");
  });

  it("normalizes accents", () => {
    expect(normalizePlayerName("José")).toBe("jose");
  });
});

describe("portrait matching", () => {
  it("rejects surname-only and non-football homonyms", () => {
    expect(nameInTitle("Michael Cooper", "File:Michael Cooper (7834581) (cropped).jpg")).toBe(true);
    expect(nameInTitle("M. Cooper", "File:John Cooper.jpg")).toBe(false);
    expect(
      isFootballPortrait({
        title: "File:Michael Cooper (7834581) (cropped).jpg",
        description: "NBA Legends … Camp Lemonnier",
      }),
    ).toBe(false);
    expect(
      isFootballPortrait({
        title: "File:Joe Edwards footballer May 2014.jpg",
        description: "Joe Edwards at Yeovil Town",
      }),
    ).toBe(true);
  });
});

describe("football.json results", () => {
  it("reads ft score objects", () => {
    expect(parseFootballJsonScore({ ft: [2, 1] })).toEqual([2, 1]);
    expect(parseFootballJsonScore([0, 0])).toEqual([0, 0]);
    expect(parseFootballJsonScore(null)).toBeNull();
  });

  it("maps league matches through a team resolver", () => {
    const payload = {
      matches: [
        {
          date: "2026-08-21",
          time: "20:00",
          team1: "Arsenal FC",
          team2: "Coventry City FC",
          score: { ft: [3, 0] },
        },
        {
          date: "2026-08-22",
          team1: "Unknown FC",
          team2: "Arsenal FC",
          score: { ft: [1, 1] },
        },
      ],
    };
    const resolve = (n) =>
      String(n).includes("Arsenal")
        ? "arsenal_current"
        : String(n).includes("Coventry")
          ? "coventry_city_current"
          : null;
    const rows = mapFootballJsonMatches(payload, "Premier League", resolve);
    expect(rows).toHaveLength(1);
    expect(rows[0].homeScore).toBe(3);
    expect(rows[0].played).toBe(true);
  });
});
