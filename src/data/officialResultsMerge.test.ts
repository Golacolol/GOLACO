import { describe, expect, it } from "vitest";
import { dedupeTeamDates, mergeOfficialMatches, pairingKey, type OfficialMatch } from "./officialResults";

function match(over: Partial<OfficialMatch> & Pick<OfficialMatch, "homeTeamId" | "awayTeamId" | "date">): OfficialMatch {
  return {
    competition: "League One",
    played: true,
    homeScore: 1,
    awayScore: 0,
    time: "15:00",
    ...over,
  };
}

describe("mergeOfficialMatches", () => {
  it("replaces a same-day reverse baked fixture with the overlay result", () => {
    const base = [
      match({
        homeTeamId: "plymouth_argyle_current",
        awayTeamId: "blackpool_current",
        date: "2026-09-19",
        played: false,
        homeScore: undefined,
        awayScore: undefined,
      }),
    ];
    const overlay = [
      match({
        homeTeamId: "blackpool_current",
        awayTeamId: "plymouth_argyle_current",
        date: "2026-09-19",
        homeScore: 2,
        awayScore: 4,
      }),
    ];
    const merged = mergeOfficialMatches(base, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      homeTeamId: "blackpool_current",
      awayTeamId: "plymouth_argyle_current",
      homeScore: 2,
      awayScore: 4,
      played: true,
    });
  });

  it("drops a baked reverse-leg when the overlay already recorded the encounter", () => {
    const base = [
      match({
        homeTeamId: "liverpool_current",
        awayTeamId: "ipswich_town_current",
        date: "2026-09-05",
        competition: "Premier League",
        homeScore: 2,
        awayScore: 0,
      }),
    ];
    const overlay = [
      match({
        homeTeamId: "ipswich_town_current",
        awayTeamId: "liverpool_current",
        date: "2026-09-04",
        competition: "Premier League",
        homeScore: 0,
        awayScore: 2,
      }),
    ];
    const merged = mergeOfficialMatches(base, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      homeTeamId: "ipswich_town_current",
      awayTeamId: "liverpool_current",
      date: "2026-09-04",
      homeScore: 0,
      awayScore: 2,
    });
  });

  it("imports unplayed overlay fixtures that are missing from the baked list", () => {
    const base = [
      match({
        homeTeamId: "stevenage_current",
        awayTeamId: "plymouth_argyle_current",
        date: "2026-10-20",
        played: false,
        homeScore: undefined,
        awayScore: undefined,
        time: "19:45",
      }),
    ];
    const overlay = [
      match({
        homeTeamId: "stevenage_current",
        awayTeamId: "plymouth_argyle_current",
        date: "2026-10-20",
        played: false,
        homeScore: undefined,
        awayScore: undefined,
        time: "19:45",
      }),
      match({
        homeTeamId: "afc_wimbledon_current",
        awayTeamId: "mansfield_town_current",
        date: "2026-10-20",
        played: false,
        homeScore: undefined,
        awayScore: undefined,
        time: "19:45",
      }),
    ];
    const merged = mergeOfficialMatches(base, overlay);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => `${m.homeTeamId}>${m.awayTeamId}`).sort()).toEqual([
      "afc_wimbledon_current>mansfield_town_current",
      "stevenage_current>plymouth_argyle_current",
    ]);
  });

  it("corrects an already-played baked score and date from the overlay", () => {
    const base = [
      match({
        homeTeamId: "mansfield_town_current",
        awayTeamId: "oxford_united_current",
        date: "2026-09-20",
        homeScore: 0,
        awayScore: 0,
      }),
    ];
    const overlay = [
      match({
        homeTeamId: "mansfield_town_current",
        awayTeamId: "oxford_united_current",
        date: "2026-10-15",
        time: "20:00",
        homeScore: 1,
        awayScore: 1,
      }),
    ];
    const merged = mergeOfficialMatches(base, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      date: "2026-10-15",
      time: "20:00",
      homeScore: 1,
      awayScore: 1,
      played: true,
    });
  });

  it("adds brand-new completed overlay pairings", () => {
    const merged = mergeOfficialMatches(
      [],
      [
        match({
          homeTeamId: "plymouth_argyle_current",
          awayTeamId: "afc_wimbledon_current",
          date: "2026-10-10",
          homeScore: 2,
          awayScore: 1,
        }),
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].played).toBe(true);
  });

  it("keeps the overlay leg when a mirror fixture double-books the same day", () => {
    const overlay = match({
      homeTeamId: "crystal_palace_current",
      awayTeamId: "fulham_current",
      date: "2026-09-05",
      homeScore: 3,
      awayScore: 2,
    });
    const mirror = match({
      homeTeamId: "fulham_current",
      awayTeamId: "crystal_palace_current",
      date: "2026-09-05",
      homeScore: 2,
      awayScore: 3,
    });
    const keys = new Set([pairingKey(overlay.homeTeamId, overlay.awayTeamId, overlay.competition)]);
    const deduped = dedupeTeamDates([mirror, overlay], keys);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      homeTeamId: "crystal_palace_current",
      awayTeamId: "fulham_current",
      homeScore: 3,
      awayScore: 2,
    });
  });
});
