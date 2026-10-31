/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fitMenuLabels, MainMenu, type MainMenuView } from "./MainMenu";
import type { FixtureRecord, StadiumRecord, TeamRecord } from "../data/schema";
import type { GameDatabase } from "../core/Database";

const team = (id: string, name: string, abbr: string): TeamRecord =>
  ({
    id,
    name,
    abbreviation: abbr,
    shortName: abbr,
    defaultStadiumId: "ground",
    primaryColor: "#007A3D",
    secondaryColor: "#FFFFFF",
    defaultKit: { primary: "#007A3D", secondary: "#FFFFFF", socks: "#007A3D" },
    teamType: "CURRENT_TEAM",
    league: "LEAGUE_ONE",
  }) as unknown as TeamRecord;

const stadium = (id: string, name: string): StadiumRecord =>
  ({ id, name, capacity: 18000 }) as unknown as StadiumRecord;

describe("MainMenu LEAGUE mode button", () => {
  function paint(showLeague: boolean): MainMenu {
    const home = team("home", "Home", "HOM");
    const away = team("away", "Away", "AWY");
    const ground = stadium("ground", "Home Park");
    const fixture = {
      id: "f1",
      homeTeamId: home.id,
      awayTeamId: away.id,
      venueId: ground.id,
      competition: "League One",
      date: "2026-09-08",
      time: "15:00",
      played: false,
    } as FixtureRecord;
    const db = {
      fixtures: [fixture],
      teams: new Map([
        [home.id, home],
        [away.id, away],
      ]),
    } as unknown as GameDatabase;
    const host = document.createElement("div");
    const menu = new MainMenu(host);
    const view: MainMenuView = {
      timeOfDay: "EVENING",
      gameplayMode: "REAL",
      playMode: "REAL",
      showLeague,
      kickOffTime: "15:00",
      matchDuration: 600,
    };
    menu.render(fixture, home, away, view, { team: home, homeGround: ground, matchGround: ground, teams: [home, away] }, db);
    return menu;
  }

  it("hides LEAGUE before the first Play Next Fixture", () => {
    const menu = paint(false);
    expect(menu.root.querySelector('[data-mode="LEAGUE"]')).toBeNull();
    expect(menu.root.querySelector('[data-mode="REAL"]')).toBeTruthy();
    expect(menu.root.querySelector('[data-mode="ARCADE"]')).toBeTruthy();
    expect(menu.root.querySelector('[data-mode="TABLE"]')?.textContent).toMatch(/Foosball/i);
  });

  it("shows LEAGUE after career progress is unlocked", () => {
    const menu = paint(true);
    expect(menu.root.querySelector('[data-mode="LEAGUE"]')).toBeTruthy();
  });

  it("renders kick-off time fully and a countdown after the fixture teams", () => {
    const menu = paint(false);
    const meta = menu.root.querySelector(".fixture-match .meta");
    expect(meta?.textContent).toContain("15:00");
    const teams = menu.root.querySelector(".fixture-teams");
    const kick = menu.root.querySelector("[data-kick-count]");
    expect(teams?.querySelectorAll(".fixture-crest").length).toBe(2);
    expect(teams?.contains(kick)).toBe(true);
    expect(kick?.querySelector("[data-kick-unit]")).toBeTruthy();
    menu.setKickOffCountdown(45);
    expect(kick!.classList.contains("phase-seconds")).toBe(true);
    expect(kick!.querySelector("strong")?.textContent).toBe("45");
    expect(kick!.querySelector("[data-kick-unit]")?.textContent).toBe("S");
    menu.setKickOffCountdown(120);
    expect(kick!.querySelector("[data-kick-unit]")?.textContent).toBe("M");
    menu.setKickOffCountdown(7200);
    expect(kick!.querySelector("[data-kick-unit]")?.textContent).toBe("H");
    menu.setKickOffCountdown(48 * 3600);
    expect(kick!.classList.contains("phase-days")).toBe(true);
    expect(kick!.querySelector("[data-kick-unit]")?.textContent).toBe("D");
  });

  it("colours stadium and club name with the club primary", () => {
    const menu = paint(false);
    const meta = menu.root.querySelector<HTMLElement>(".club-meta");
    expect(meta?.style.getPropertyValue("--club-primary").trim()).toBe("#007A3D");
    expect(menu.root.querySelector(".club-ground")?.textContent).toBe("Home Park");
    expect(menu.root.querySelector(".club-team")?.textContent).toBe("Home");
    expect(menu.root.querySelector(".club-line")?.textContent).toContain("Home Park");
    expect(menu.root.querySelector(".menu-badge")).toBeNull();
  });

  it("scales the club line to fit, and leaves team dials at fixed CSS size", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = `
      <div class="club-meta">
        <div class="club-crest"></div>
        <span class="club-line">Very Long Stadium Name · Very Long United Football Club</span>
      </div>
      <span class="time-spin team-spin">
        <span class="spin-ghost">Prev</span>
        <strong>Current Extremely Long Team Name</strong>
        <span class="spin-ghost">Next</span>
      </span>
    `;
    const meta = host.querySelector<HTMLElement>(".club-meta")!;
    const crest = host.querySelector<HTMLElement>(".club-crest")!;
    const line = host.querySelector<HTMLElement>(".club-line")!;
    const strong = host.querySelector<HTMLElement>("strong")!;
    Object.defineProperty(meta, "clientWidth", { configurable: true, get: () => 200 });
    Object.defineProperty(crest, "offsetWidth", { configurable: true, get: () => 52 });
    vi.spyOn(line, "scrollWidth", "get").mockImplementation(() => {
      const px = parseFloat(line.style.fontSize) || 16;
      return Math.max(120, 340 * (px / 16));
    });

    fitMenuLabels(host);

    expect(parseFloat(line.style.fontSize)).toBeLessThan(16);
    expect(line.style.textOverflow).toBe("clip");
    // Dial type is CSS-only — fitMenuLabels must not rewrite it.
    expect(strong.style.fontSize).toBe("");

    host.remove();
    vi.restoreAllMocks();
  });

  it("places the title above club text and keeps Team + League dials", () => {
    const menu = paint(false);
    const hero = menu.root.querySelector(".menu-hero")!;
    const stack = hero.querySelector(".menu-hero-stack");
    const title = hero.querySelector("h1");
    const club = hero.querySelector(".club-wrap");
    const teamSelect = hero.querySelector(".team-select-fixture");
    const gameplay = [...hero.querySelectorAll(".menu-fixture")].find((el) => el.querySelector(".meta")?.textContent === "Gameplay");
    expect(stack).toBeTruthy();
    expect(stack?.contains(title!)).toBe(true);
    expect(stack?.contains(club!)).toBe(true);
    expect(stack?.contains(teamSelect!)).toBe(true);
    expect(title?.textContent?.replace(/\s+/g, "").trim()).toBe("GOLAÇO⚽️SOCCER");
    expect(title?.querySelector(".title-emoji")?.textContent).toBe("⚽️");
    expect(title!.compareDocumentPosition(club!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(club!.compareDocumentPosition(teamSelect!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(teamSelect!.compareDocumentPosition(gameplay!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(menu.root.querySelector("[data-team-spin]")).toBeTruthy();
    expect(menu.root.querySelector("[data-league-spin]")).toBeTruthy();
    expect(menu.root.querySelector("[data-era-spin]")).toBeNull();
    expect(teamSelect?.querySelector(".meta")).toBeNull();
    const fields = [...teamSelect!.querySelectorAll(".team-dial-field")];
    expect(fields).toHaveLength(2);
    expect(fields[0]?.querySelector(".team-dial-label")?.textContent).toBe("League");
    expect(fields[1]?.querySelector(".team-dial-label")?.textContent).toBe("Club");
    const dials = [...teamSelect!.querySelectorAll(".time-spin")];
    expect(dials[0]?.hasAttribute("data-league-spin")).toBe(true);
    expect(dials[1]?.hasAttribute("data-team-spin")).toBe(true);
  });

  it("locks team dials and drops pending club commits", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const menu = paint(false);
    let commits = 0;
    menu.onClubChange = () => {
      commits += 1;
    };
    menu.unlockTeamSelect();
    menu.lockTeamSelect();
    expect(menu.root.querySelector(".team-dials")?.classList.contains("team-dials-locked")).toBe(true);
    menu.root.querySelector<HTMLElement>("[data-team-spin]")?.click();
    expect(commits).toBe(0);
    menu.hide();
    host.remove();
  });

  it("shows Classic Era date roll after Team, without nicknames on the dials", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const menu = new MainMenu(host);
    const chelsea0405 = {
      id: "classic_chelsea_2004_05",
      name: "Chelsea — 2004/05 Mourinho",
      abbreviation: "CHE",
      shortName: "Chelsea",
      defaultStadiumId: "stamford_bridge",
      primaryColor: "#034694",
      secondaryColor: "#fff",
      defaultKit: { shirt: "#034694", shorts: "#034694", socks: "#fff" },
      teamType: "HISTORIC_TEAM" as const,
      historicSeason: "2004/05",
    };
    const chelsea1112 = {
      ...chelsea0405,
      id: "classic_chelsea_2011_12",
      name: "Chelsea — 2011/12",
      historicSeason: "2011/12",
    };
    const ground = { id: "stamford_bridge", name: "Stamford Bridge", capacity: 40000, city: "London" };
    menu.render(
      {
        id: "f1",
        homeTeamId: chelsea0405.id,
        awayTeamId: "away",
        competition: "FRIENDLY",
        date: "2024-01-01",
        kickOffTime: "15:00",
        status: "SCHEDULED",
      } as never,
      chelsea0405 as never,
      { ...chelsea0405, id: "away", name: "Away" } as never,
      {
        timeOfDay: "EVENING",
        gameplayMode: "REAL",
        playMode: "REAL",
        showLeague: false,
        kickOffTime: "15:00",
        matchDuration: 600,
      },
      {
        team: chelsea0405 as never,
        homeGround: ground as never,
        matchGround: ground as never,
        teams: [chelsea0405, chelsea1112] as never,
      },
      { teams: [chelsea0405, chelsea1112] } as never,
    );

    const teamSelect = menu.root.querySelector(".team-select-fixture")!;
    expect(teamSelect.querySelector(".team-dials")?.classList.contains("has-era")).toBe(true);
    const fields = [...teamSelect.querySelectorAll(".team-dial-field")];
    expect(fields).toHaveLength(3);
    expect(fields[1]?.querySelector(".team-dial-label")?.textContent).toBe("Club");
    expect(fields[2]?.querySelector(".team-dial-label")?.textContent).toBe("Team");
    expect(menu.root.querySelector("[data-team-spin] strong")?.textContent).toBe("Chelsea");
    expect(menu.root.querySelector("[data-era-spin] strong")?.textContent).toBe("04-05");
    expect(menu.root.querySelector("[data-team-spin]")?.textContent).not.toContain("Mourinho");
    expect(menu.root.querySelector("[data-era-spin]")?.textContent).not.toContain("Mourinho");
    // Full display name stays on the club line / Formation title source.
    expect(menu.root.querySelector(".club-team")?.textContent).toBe("Chelsea — 2004/05 Mourinho");

    menu.dispose();
    host.remove();
  });

  it("uses a single League Fixtures menu item and remembers the last tab", () => {
    const menu = paint(false);
    expect(menu.root.querySelector('[data-id="league"]')).toBeNull();
    expect(menu.root.querySelector('[data-id="fixtures"]')).toBeNull();
    expect(menu.root.querySelector('[data-id="league-fixtures"]')?.textContent).toContain("League Fixtures");
    expect(menu.root.querySelector('[data-id="predictions"]')?.textContent).toContain("Predictions");
    const ids = [...menu.root.querySelectorAll(".menu-item")].map((el) => el.getAttribute("data-id"));
    expect(ids.indexOf("predictions")).toBeGreaterThan(ids.indexOf("spot")!);
    expect(ids.indexOf("predictions")).toBeLessThan(ids.indexOf("database")!);

    menu.openLeagueFixtures("LEAGUE_ONE");
    menu.render(
      {
        id: "f1",
        homeTeamId: "home",
        awayTeamId: "away",
        venueId: "ground",
        competition: "League One",
        date: "2026-09-08",
        time: "15:00",
        played: false,
      } as FixtureRecord,
      team("home", "Home", "HOM"),
      team("away", "Away", "AWY"),
      {
        timeOfDay: "EVENING",
        gameplayMode: "REAL",
        playMode: "REAL",
        showLeague: false,
        kickOffTime: "15:00",
        matchDuration: 600,
      },
      {
        team: team("home", "Home", "HOM"),
        homeGround: stadium("ground", "Home Park"),
        matchGround: stadium("ground", "Home Park"),
        teams: [team("home", "Home", "HOM"), team("away", "Away", "AWY")],
      },
      {
        fixtures: [],
        teams: new Map([
          ["home", team("home", "Home", "HOM")],
          ["away", team("away", "Away", "AWY")],
        ]),
      } as unknown as GameDatabase,
    );
    expect(menu.panel).toBe("league");
    expect(menu.root.querySelector('[data-lf="league"]')?.classList.contains("on")).toBe(true);
    expect(menu.root.querySelector('[data-lf="fixtures"]')?.classList.contains("on")).toBe(false);

    menu.setLeagueTab("PREMIER_LEAGUE");
    menu.setLeagueFixturesTab("fixtures");
    expect(menu.fixtureLeague).toBe("PREMIER_LEAGUE");

    menu.setLeagueFixturesTab("fixtures", "LEAGUE_ONE");
    expect(menu.leagueFixturesTab).toBe("fixtures");
    expect(menu.panel).toBe("fixtures");
    // Still Premier — currently viewed league, not club default.
    expect(menu.fixtureLeague).toBe("PREMIER_LEAGUE");

    menu.setPanel("menu", false);
    menu.openLeagueFixtures("LEAGUE_ONE");
    expect(menu.panel).toBe("fixtures");
  });

  it("opens Options as a menu panel with section buttons then an embed host", () => {
    const menu = paint(false);
    menu.openOptions();
    menu.render(
      {
        id: "f1",
        homeTeamId: "home",
        awayTeamId: "away",
        venueId: "ground",
        competition: "League One",
        date: "2026-09-08",
        time: "15:00",
        played: false,
      } as FixtureRecord,
      team("home", "Home", "HOM"),
      team("away", "Away", "AWY"),
      {
        timeOfDay: "EVENING",
        gameplayMode: "REAL",
        playMode: "REAL",
        showLeague: false,
        kickOffTime: "15:00",
        matchDuration: 600,
      },
      {
        team: team("home", "Home", "HOM"),
        homeGround: stadium("ground", "Home Park"),
        matchGround: stadium("ground", "Home Park"),
        teams: [team("home", "Home", "HOM"), team("away", "Away", "AWY")],
      },
      {
        fixtures: [],
        teams: new Map([
          ["home", team("home", "Home", "HOM")],
          ["away", team("away", "Away", "AWY")],
        ]),
      } as unknown as GameDatabase,
    );
    expect(menu.panel).toBe("options");
    expect(menu.optionsSection).toBeNull();
    expect(menu.root.querySelector('[data-options-section="match"]')?.textContent).toContain("Match Settings");
    expect(menu.root.querySelectorAll("[data-options-section]").length).toBe(6);

    menu.openOptionsSection("controls");
    menu.render(
      {
        id: "f1",
        homeTeamId: "home",
        awayTeamId: "away",
        venueId: "ground",
        competition: "League One",
        date: "2026-09-08",
        time: "15:00",
        played: false,
      } as FixtureRecord,
      team("home", "Home", "HOM"),
      team("away", "Away", "AWY"),
      {
        timeOfDay: "EVENING",
        gameplayMode: "REAL",
        playMode: "REAL",
        showLeague: false,
        kickOffTime: "15:00",
        matchDuration: 600,
      },
      {
        team: team("home", "Home", "HOM"),
        homeGround: stadium("ground", "Home Park"),
        matchGround: stadium("ground", "Home Park"),
        teams: [team("home", "Home", "HOM"), team("away", "Away", "AWY")],
      },
      {
        fixtures: [],
        teams: new Map([
          ["home", team("home", "Home", "HOM")],
          ["away", team("away", "Away", "AWY")],
        ]),
      } as unknown as GameDatabase,
    );
    expect(menu.optionsSection).toBe("controls");
    expect(menu.root.querySelector("[data-options-embed]")).toBeTruthy();
    expect(menu.root.querySelector('[data-act="options-back"]')).toBeTruthy();
  });
});
