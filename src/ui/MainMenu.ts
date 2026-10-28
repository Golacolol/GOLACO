import type { StadiumRecord, TeamRecord, FixtureRecord, EnglishLeague } from "../data/schema";
import type { TimeOfDay } from "../football/environment/Environment";
import type { GameplayMode } from "../football/gameplay/GameplayTuning";
import type { GameDatabase } from "../core/Database";
import { DEFAULT_KICK_OFF_TIME, HALF_LENGTH_CHOICES, formatKickCountdown, kickOffRemainingSeconds, type KickCountdownPhase } from "../football/constants";
import { todayIso } from "../data/leagueSchedule";
import { leagueForTeam } from "../football/league/Standings";
import {
  PREDICTION_SCORE_MAX,
  autoSelectPredictionFixtures,
  clampPredictionViewWeek,
  clampScore,
  ensurePredictionWeek,
  predictionFixtureIdSet,
  predictionWeekStart,
  setAdminPredictionFixtures,
  shiftPredictionWeek,
  updatePredictionPick,
  type PredictionsState,
} from "../football/predictions/Predictions";
import { OPTIONS_SECTIONS, type OptionsSection } from "./Settings";
import { leaguePanelHtml } from "./LeagueTable";
import { fixturePanelHtml, resolveFixtureDate, stepFixtureDate } from "./FixtureList";
import { predictionsPanelHtml, type PredictionsViewMode } from "./PredictionsPanel";
import {
  buildMenuTeamOptions,
  erasForClub,
  findTeamOption,
  MENU_TEAM_GROUP_LABEL,
  MENU_TEAM_GROUPS,
  uniqueClubsInGroup,
  type MenuTeamGroup,
  type MenuTeamOption,
} from "./menuTeamSelect";
import { teamBadgeHtml } from "./Portrait";

export type MenuPanel = "menu" | "league" | "fixtures" | "database" | "predictions" | "options";

export type MenuPlayMode = GameplayMode | "LEAGUE";

export interface MainMenuView {
  timeOfDay: TimeOfDay;
  gameplayMode: GameplayMode;
  playMode: MenuPlayMode;
  /** Only show LEAGUE once the user has career matches saved. */
  showLeague: boolean;
  kickOffTime: string;
  matchDuration: number;
}

export class MainMenu {
  readonly root: HTMLElement;
  selected = 0;
  attract = false;
  countdown = 60;
  timeOfDay: TimeOfDay = "EVENING";
  gameplayMode: GameplayMode = "REAL";
  kickOffTime = DEFAULT_KICK_OFF_TIME;
  matchDuration = 600;
  panel: MenuPanel = "menu";
  /** Remembers League vs Fixtures when reopening the combined menu entry. */
  leagueFixturesTab: "league" | "fixtures" = "league";
  /** null = Options hub (section buttons); set = detail with tabs. */
  optionsSection: OptionsSection | null = null;
  league: EnglishLeague = "LEAGUE_ONE";
  fixtureLeague: EnglishLeague = "LEAGUE_ONE";
  fixtureDate = todayIso();
  fadePanel = false;
  predictionsMode: PredictionsViewMode = "predict";
  /** Saturday ISO for the Predictions panel week browser. */
  predictionsViewWeek = predictionWeekStart();
  private predAdminDraft = new Set<string>();
  private predSpinAcc = new Map<string, number>();
  private halfSpinWheel = createSpinWheel();
  private teamSpinWheel = createSpinWheel();
  private leagueSpinWheel = createSpinWheel();
  private eraSpinWheel = createSpinWheel();
  private teamOptions: MenuTeamOption[] = [];
  private teamGroup: MenuTeamGroup = "LEAGUE_ONE";
  private pendingTeamId: string | null = null;
  private clubCommitTimer: ReturnType<typeof setTimeout> | null = null;
  onHalf: ((seconds: number) => void) | null = null;
  onClubChange: ((teamId: string) => void) | null = null;
  onPredictionsChange: ((state: PredictionsState) => void) | null = null;
  onPredictionsRefresh: (() => void) | null = null;
  readonly items = [
    { id: "sim", label: "Simulator", hint: "Your club vs a random side · autoplay" },
    { id: "next", label: "Play Next Fixture", hint: "Kick off the listed match" },
    { id: "league-fixtures", label: "League Fixtures", hint: "Tables and week-to-week matches" },
    { id: "quick", label: "Quick Match", hint: "Pick teams, weather and length" },
    { id: "spot", label: "Spot-kick Practice", hint: "Place a free kick or penalty on the pitch" },
    { id: "predictions", label: "Predictions", hint: "Ten gold fixtures · score rollers · weekly points" },
    { id: "database", label: "Database", hint: "Teams and player ratings" },
    { id: "settings", label: "Options", hint: "Match settings, controls, display, advanced" },
  ] as const;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "menu-screen";
    parent.appendChild(this.root);
    this.hide();
  }

  render(
    fixture: FixtureRecord,
    home: TeamRecord,
    away: TeamRecord,
    view: MainMenuView,
    club: { team: TeamRecord; homeGround: StadiumRecord; matchGround: StadiumRecord; teams: TeamRecord[] },
    db: GameDatabase,
    predictions?: PredictionsState,
  ): void {
    this.root.hidden = false;
    this.timeOfDay = view.timeOfDay;
    this.gameplayMode = view.gameplayMode;
    this.kickOffTime = DEFAULT_KICK_OFF_TIME;
    this.matchDuration = view.matchDuration;
    const secs = Math.max(0, Math.ceil(this.countdown));
    const tod = (id: TimeOfDay, label: string) =>
      `<button type="button" class="tod-opt ${view.timeOfDay === id ? "on" : ""}" data-tod="${id}">${label}</button>`;
    const mode = (id: MenuPlayMode, label: string) =>
      `<button type="button" class="tod-opt ${view.playMode === id ? "on" : ""}" data-mode="${id}">${label}</button>`;
    const simHint = `${club.team.abbreviation} vs a random side · autoplay`;
    const embed = this.panel !== "menu";
    const predState = predictions ?? { weeks: [], totalPoints: 0 };
    this.predictionsViewWeek = clampPredictionViewWeek(this.predictionsViewWeek, predState);
    this.teamOptions = buildMenuTeamOptions(club.teams);
    const selected = findTeamOption(this.teamOptions, this.pendingTeamId ?? club.team.id) ?? this.teamOptions[0];
    if (selected) this.teamGroup = selected.group;
    const clubs = uniqueClubsInGroup(this.teamOptions, this.teamGroup);
    const teamIdx = Math.max(0, clubs.findIndex((t) => t.clubKey === selected?.clubKey));
    const eras = selected ? erasForClub(this.teamOptions, selected.clubKey) : [];
    const eraIdx = Math.max(0, eras.findIndex((t) => t.id === selected?.id));
    const leagueIdx = Math.max(0, MENU_TEAM_GROUPS.indexOf(this.teamGroup));
    const leagueDialLabel = MENU_TEAM_GROUP_LABEL[this.teamGroup];
    const showEra = this.teamGroup === "CLASSIC";
    this.root.innerHTML = `
      <div class="menu-shell ${embed ? "panel-open" : ""}">
        <div class="menu-hero">
          <h1><span class="title-line">SD FOOTBALL</span></h1>
          <div class="club-wrap">
            <div class="club-meta" style="${clubBadgeStyle(club.team)}">
              ${teamBadgeHtml(club.team, { className: "club-crest", size: 52 })}
              <span class="club-line"><span class="club-ground">${escapeHtml(club.homeGround.name)}</span><span class="club-sep">·</span><span class="club-team">${escapeHtml(club.team.name)}</span></span>
            </div>
          </div>
          <div class="menu-fixture team-select-fixture">
            <span class="tod-row team-dials${showEra ? " has-era" : ""}">
              <span class="team-dial-field">
                <span class="team-dial-label">League</span>
                ${leagueSpinHtml(leagueIdx, leagueDialLabel)}
              </span>
              <span class="team-dial-field">
                <span class="team-dial-label">Team</span>
                ${teamSpinHtml(clubs, teamIdx)}
              </span>
              ${
                showEra
                  ? `<span class="team-dial-field" data-era-field>
                <span class="team-dial-label">Era</span>
                ${eraSpinHtml(eras, eraIdx)}
              </span>`
                  : ""
              }
            </span>
          </div>
          <div class="menu-fixture">
            <span class="tod-row">
              ${mode("REAL", "REAL")}
              <span class="vs">·</span>
              ${mode("ARCADE", "ARCADE")}
              ${
                view.showLeague === true
                  ? `<span class="vs">·</span>
              ${mode("LEAGUE", "LEAGUE")}`
                  : ""
              }
            </span>
            <span class="meta">Gameplay</span>
          </div>
          <div class="menu-fixture">
            <span class="tod-row">
              ${tod("DAY", "DAY")}
              <span class="vs">·</span>
              ${tod("EVENING", "EVENING")}
              <span class="vs">·</span>
              ${tod("NIGHT", "NIGHT")}
            </span>
            <span class="meta">Lighting</span>
          </div>
          <div class="menu-fixture fixture-match">
            <button type="button" class="fixture-copy" data-id="next" aria-label="Play next fixture ${home.abbreviation} vs ${away.abbreviation}">
              <div class="fixture-teams">
                ${teamBadgeHtml(home, { className: "fixture-crest", size: 28 })}
                <strong>${home.abbreviation}</strong>
                <span class="vs">vs</span>
                ${teamBadgeHtml(away, { className: "fixture-crest", size: 28 })}
                <strong>${away.abbreviation}</strong>
                <span class="vs">·</span>
                ${kickCountdownHtml(fixture.date, view.kickOffTime || DEFAULT_KICK_OFF_TIME)}
              </div>
              <span class="meta">${fixture.competition} · ${view.kickOffTime || DEFAULT_KICK_OFF_TIME} · ${club.matchGround.name}</span>
            </button>
            ${halfSpinHtml(this.matchDuration)}
          </div>
          <button type="button" class="sim-timer" data-id="sim">
            Simulator auto-starts in <strong data-sim-count>${secs}</strong>s
          </button>
        </div>
        <div class="menu-list ${embed ? `menu-embed panel-${this.panel}` : ""} ${this.fadePanel ? "panel-in" : ""}">
          ${this.panelHtml(db, club.team.id, simHint, predState)}
        </div>
      </div>
    `;
    this.fadePanel = false;
    this.bindPointer();
    this.bindDurationSpin();
    this.bindTeamSelectSpin();
    if (this.panel === "predictions") this.bindPredictions(db, predState);
    scheduleFitMenuLabels(this.root);
  }

  setPanel(panel: MenuPanel, fade = true, clubLeague?: EnglishLeague): void {
    if (panel === "league" || panel === "fixtures") this.leagueFixturesTab = panel;
    if (panel === "menu") {
      this.predictionsMode = "predict";
      this.optionsSection = null;
    }
    if (panel === "league" && this.panel === "menu") this.league = "LEAGUE_ONE";
    if (panel === "fixtures" && this.panel === "menu") {
      this.fixtureLeague = clubLeague ?? leagueForTeam(undefined);
      this.fixtureDate = todayIso();
    }
    if (panel !== "options") this.optionsSection = null;
    this.panel = panel;
    this.fadePanel = fade;
  }

  openOptions(): void {
    this.optionsSection = null;
    this.setPanel("options", true);
  }

  openOptionsSection(section: OptionsSection): void {
    this.optionsSection = section;
    this.setPanel("options", true);
  }

  /** Open the combined League Fixtures panel on the last-used tab (defaults to League). */
  openLeagueFixtures(clubLeague?: EnglishLeague): void {
    if (this.leagueFixturesTab === "fixtures") {
      this.setPanel("fixtures", true, clubLeague);
      return;
    }
    this.setPanel("league", true);
  }

  setLeagueFixturesTab(tab: "league" | "fixtures", clubLeague?: EnglishLeague): void {
    this.leagueFixturesTab = tab;
    if (tab === "fixtures") {
      if (this.panel === "league") {
        // Keep the division currently shown on the League table.
        this.fixtureLeague = this.league;
      } else if (this.panel !== "fixtures") {
        this.fixtureLeague = this.fixtureLeague || clubLeague || leagueForTeam(undefined);
      }
      this.panel = "fixtures";
    } else {
      if (this.panel === "fixtures") this.league = this.fixtureLeague;
      this.panel = "league";
    }
    this.fadePanel = false;
  }

  setLeagueTab(league: EnglishLeague): void {
    if (this.panel === "league") this.league = league;
    if (this.panel === "fixtures") this.fixtureLeague = league;
    this.fadePanel = false;
  }

  stepWeek(db: GameDatabase, dir: "prev" | "next"): void {
    this.fixtureDate = stepFixtureDate(db, this.fixtureLeague, this.fixtureDate, dir);
    this.fadePanel = false;
  }

  syncFixtureDate(db: GameDatabase): void {
    this.fixtureDate = resolveFixtureDate(db, this.fixtureLeague, this.fixtureDate);
  }

  setCountdown(seconds: number): void {
    this.countdown = seconds;
    const el = this.root.querySelector("[data-sim-count]");
    if (el) el.textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  setKickOffCountdown(remainingSeconds: number): void {
    const cd = formatKickCountdown(remainingSeconds);
    const unit = kickCountdownUnit(cd.phase);
    const el = this.root.querySelector<HTMLElement>("[data-kick-count]");
    if (!el) return;
    el.className = `kick-countdown phase-${cd.phase}`;
    el.setAttribute("aria-label", `Kick-off in ${cd.value} ${cd.phase}`);
    const strong = el.querySelector("strong");
    if (strong) strong.textContent = cd.value;
    const mark = el.querySelector("[data-kick-unit]");
    if (mark) mark.textContent = unit;
  }

  hide(): void {
    this.root.hidden = true;
    this.panel = "menu";
    this.optionsSection = null;
    this.predictionsMode = "predict";
    this.fadePanel = false;
  }

  move(delta: number): void {
    if (this.panel !== "menu") return;
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.paintSelection();
  }

  currentId(): string {
    return this.items[this.selected].id;
  }

  private panelHtml(db: GameDatabase, highlightId: string, simHint: string, predictions: PredictionsState): string {
    if (this.panel === "league") return leaguePanelHtml(db, this.league, highlightId);
    if (this.panel === "fixtures") {
      this.syncFixtureDate(db);
      return fixturePanelHtml(db, this.fixtureLeague, this.fixtureDate, highlightId, predictionFixtureIdSet(predictions));
    }
    if (this.panel === "predictions") {
      return predictionsPanelHtml(
        db,
        predictions,
        this.predictionsMode,
        this.predictionsViewWeek,
        todayIso(),
        this.predAdminDraft,
      );
    }
    if (this.panel === "database") {
      return `
        <div class="panel-head">
          <button type="button" data-act="panel-back">Back</button>
          <h2>Database</h2>
        </div>
        <button type="button" class="menu-item" data-id="teams">
          <span class="menu-item-label">Teams</span>
          <span class="menu-item-hint">Line-ups and kits</span>
        </button>
        <button type="button" class="menu-item" data-id="players">
          <span class="menu-item-label">Player Database</span>
          <span class="menu-item-hint">Ratings and bios</span>
        </button>
      `;
    }
    if (this.panel === "options") {
      if (!this.optionsSection) {
        return `
          <div class="panel-head">
            <button type="button" data-act="panel-back">Back</button>
            <h2>Options</h2>
          </div>
          ${OPTIONS_SECTIONS.map(
            (s) => `
          <button type="button" class="menu-item" data-options-section="${s.id}">
            <span class="menu-item-label">${s.title}</span>
            <span class="menu-item-hint">${s.hint}</span>
          </button>`,
          ).join("")}
        `;
      }
      return `
        <div class="panel-head">
          <button type="button" data-act="options-back">Back</button>
          <h2>Options</h2>
        </div>
        <div class="options-embed" data-options-embed></div>
      `;
    }
    const sim = this.items[0];
    return this.items
      .map(
        (item, i) =>
          `<button type="button" class="menu-item ${i === this.selected ? "active" : ""} ${item.id === "sim" ? "featured" : ""}" data-id="${item.id}">
            <span class="menu-item-label">${item.label}</span>
            <span class="menu-item-hint">${item.id === sim.id ? simHint : item.hint}</span>
          </button>`,
      )
      .join("");
  }

  openPredictions(): void {
    this.predictionsMode = "predict";
    this.predictionsViewWeek = predictionWeekStart();
    this.setPanel("predictions", true);
  }

  private bindPredictions(_db: GameDatabase, state: PredictionsState): void {
    const weekStart = this.predictionsViewWeek;

    this.root.querySelectorAll<HTMLElement>("[data-pred-spin]").forEach((el) => {
      el.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          if (el.classList.contains("disabled")) return;
          const key = `${el.getAttribute("data-pred-spin")}:${el.getAttribute("data-side")}`;
          const acc = (this.predSpinAcc.get(key) ?? 0) + e.deltaY;
          if (Math.abs(acc) < 72) {
            this.predSpinAcc.set(key, acc);
            return;
          }
          const dir = acc > 0 ? 1 : -1;
          this.predSpinAcc.set(key, 0);
          this.nudgePredictionScore(state, weekStart, el, dir);
        },
        { passive: false },
      );
      el.addEventListener("click", (e) => {
        e.preventDefault();
        if (el.classList.contains("disabled")) return;
        this.nudgePredictionScore(state, weekStart, el, 1);
      });
    });

    this.root.querySelectorAll<HTMLInputElement>("[data-pred-pick]").forEach((input) => {
      input.addEventListener("change", () => {
        this.syncAdminDraftFromDom();
        this.onPredictionsRefresh?.();
      });
    });
  }

  handlePredictionAction(act: string, db: GameDatabase, state: PredictionsState, fixtureId?: string | null): PredictionsState {
    const weekStart = this.predictionsViewWeek;
    if (act === "week-prev") {
      this.predictionsViewWeek = clampPredictionViewWeek(shiftPredictionWeek(weekStart, -1), state);
      this.predAdminDraft = new Set(state.weeks.find((w) => w.weekStart === this.predictionsViewWeek)?.fixtureIds ?? []);
      return ensurePredictionWeek(state, db.fixtures, todayIso(), this.predictionsViewWeek);
    }
    if (act === "week-next") {
      this.predictionsViewWeek = clampPredictionViewWeek(shiftPredictionWeek(weekStart, 1), state);
      this.predAdminDraft = new Set(state.weeks.find((w) => w.weekStart === this.predictionsViewWeek)?.fixtureIds ?? []);
      return ensurePredictionWeek(state, db.fixtures, todayIso(), this.predictionsViewWeek);
    }
    if (act === "admin") {
      this.predictionsMode = "admin";
      this.predAdminDraft = new Set(state.weeks.find((w) => w.weekStart === weekStart)?.fixtureIds ?? []);
      return state;
    }
    if (act === "admin-back") {
      this.predictionsMode = "predict";
      return state;
    }
    if (act === "admin-clear") {
      this.predAdminDraft.clear();
      this.onPredictionsRefresh?.();
      return state;
    }
    if (act === "admin-auto") {
      const ids = autoSelectPredictionFixtures(db.fixtures, weekStart);
      this.predAdminDraft = new Set(ids);
      this.onPredictionsRefresh?.();
      return state;
    }
    if (act === "admin-save") {
      const next = setAdminPredictionFixtures(state, weekStart, [...this.predAdminDraft]);
      this.predictionsMode = "predict";
      this.onPredictionsChange?.(next);
      return next;
    }
    if (act === "lock" && fixtureId) {
      const week = state.weeks.find((w) => w.weekStart === weekStart);
      const pick = week?.picks.find((p) => p.fixtureId === fixtureId);
      const next = updatePredictionPick(state, weekStart, fixtureId, { locked: !pick?.locked });
      this.onPredictionsChange?.(next);
      return next;
    }
    return state;
  }

  /** Called when admin checkboxes change — sync draft into a temporary view via re-paint. */
  syncAdminDraftFromDom(): void {
    this.predAdminDraft.clear();
    this.root.querySelectorAll<HTMLInputElement>("[data-pred-pick]:checked").forEach((input) => {
      const id = input.getAttribute("data-pred-pick");
      if (id) this.predAdminDraft.add(id);
    });
  }

  private nudgePredictionScore(
    state: PredictionsState,
    weekStart: string,
    el: HTMLElement,
    dir: number,
  ): void {
    const fixtureId = el.getAttribute("data-pred-spin");
    const side = el.getAttribute("data-side") as "home" | "away" | null;
    if (!fixtureId || (side !== "home" && side !== "away")) return;
    const week = state.weeks.find((w) => w.weekStart === weekStart);
    const pick = week?.picks.find((p) => p.fixtureId === fixtureId);
    if (!pick || pick.locked) return;
    const cur = side === "home" ? pick.home : pick.away;
    const nextVal = clampScore((cur + dir + (PREDICTION_SCORE_MAX + 1)) % (PREDICTION_SCORE_MAX + 1));
    const next = updatePredictionPick(state, weekStart, fixtureId, side === "home" ? { home: nextVal } : { away: nextVal });
    this.onPredictionsChange?.(next);
  }

  private bindPointer(): void {
    this.root.querySelectorAll<HTMLButtonElement>(".menu-item").forEach((btn, i) => {
      btn.addEventListener("pointerenter", () => {
        if (this.panel !== "menu") return;
        this.selected = i;
        this.paintSelection();
      });
    });
  }

  private bindDurationSpin(): void {
    const half = this.root.querySelector<HTMLElement>("[data-half-spin]");
    if (!half) return;
    this.halfSpinWheel = createSpinWheel();
    half.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // Match length has few steps — need a high threshold + cooldown for trackpads.
        const dir = consumeSpinWheel(this.halfSpinWheel, e.deltaY, {
          threshold: 110,
          cooldownMs: 140,
          eventCap: 70,
        });
        if (dir) this.stepHalf(dir);
      },
      { passive: false },
    );
    half.addEventListener("click", (e) => {
      e.preventDefault();
      this.stepHalf(1);
    });
  }

  private bindTeamSelectSpin(): void {
    const teamSpin = this.root.querySelector<HTMLElement>("[data-team-spin]");
    if (teamSpin) {
      this.teamSpinWheel = createSpinWheel();
      teamSpin.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const dir = consumeSpinWheel(this.teamSpinWheel, e.deltaY, {
            threshold: 52,
            cooldownMs: 95,
            eventCap: 48,
          });
          if (dir) this.stepTeam(dir);
        },
        { passive: false },
      );
      teamSpin.addEventListener("click", (e) => {
        e.preventDefault();
        this.stepTeam(1);
      });
    }
    const leagueSpin = this.root.querySelector<HTMLElement>("[data-league-spin]");
    if (leagueSpin) {
      this.leagueSpinWheel = createSpinWheel();
      leagueSpin.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const dir = consumeSpinWheel(this.leagueSpinWheel, e.deltaY, {
            threshold: 58,
            cooldownMs: 110,
            eventCap: 48,
          });
          if (dir) this.stepLeague(dir);
        },
        { passive: false },
      );
      leagueSpin.addEventListener("click", (e) => {
        e.preventDefault();
        this.stepLeague(1);
      });
    }
    this.bindEraSpin();
  }

  private bindEraSpin(): void {
    const eraSpin = this.root.querySelector<HTMLElement>("[data-era-spin]");
    if (!eraSpin || eraSpin.dataset.bound === "1") return;
    eraSpin.dataset.bound = "1";
    this.eraSpinWheel = createSpinWheel();
    eraSpin.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const dir = consumeSpinWheel(this.eraSpinWheel, e.deltaY, {
          threshold: 52,
          cooldownMs: 95,
          eventCap: 48,
        });
        if (dir) this.stepEra(dir);
      },
      { passive: false },
    );
    eraSpin.addEventListener("click", (e) => {
      e.preventDefault();
      this.stepEra(1);
    });
  }

  private stepTeam(delta: number): void {
    const clubs = uniqueClubsInGroup(this.teamOptions, this.teamGroup);
    if (!clubs.length) return;
    const el = this.root.querySelector<HTMLElement>("[data-team-spin]");
    const curIdx = Number(el?.getAttribute("data-team-index") ?? 0);
    const nextIdx = (curIdx + delta + clubs.length * 8) % clubs.length;
    const club = clubs[nextIdx]!;
    const eras = erasForClub(this.teamOptions, club.clubKey);
    const next = eras[0] ?? club;
    this.pendingTeamId = next.id;
    this.paintTeamDials(nextIdx, 0);
    this.scheduleClubCommit(next.id);
  }

  private stepEra(delta: number): void {
    if (this.teamGroup !== "CLASSIC") return;
    const eraEl = this.root.querySelector<HTMLElement>("[data-era-spin]");
    const clubKey = eraEl?.getAttribute("data-club-key");
    if (!clubKey) return;
    const eras = erasForClub(this.teamOptions, clubKey);
    if (eras.length <= 1) return;
    const curIdx = Number(eraEl?.getAttribute("data-era-index") ?? 0);
    const nextIdx = (curIdx + delta + eras.length * 8) % eras.length;
    const next = eras[nextIdx]!;
    this.pendingTeamId = next.id;
    const clubs = uniqueClubsInGroup(this.teamOptions, this.teamGroup);
    const teamIdx = Math.max(0, clubs.findIndex((c) => c.clubKey === clubKey));
    this.paintTeamDials(teamIdx, nextIdx);
    this.scheduleClubCommit(next.id);
  }

  private stepLeague(delta: number): void {
    const curIdx = MENU_TEAM_GROUPS.indexOf(this.teamGroup);
    const nextIdx = (curIdx + delta + MENU_TEAM_GROUPS.length * 8) % MENU_TEAM_GROUPS.length;
    const nextGroup = MENU_TEAM_GROUPS[nextIdx]!;
    const clubs = uniqueClubsInGroup(this.teamOptions, nextGroup);
    if (!clubs.length) return;
    this.teamGroup = nextGroup;
    const eras = erasForClub(this.teamOptions, clubs[0]!.clubKey);
    const next = eras[0] ?? clubs[0]!;
    this.pendingTeamId = next.id;
    this.paintTeamDials(0, 0);
    this.scheduleClubCommit(next.id);
  }

  private paintTeamDials(teamIdx: number, eraIdx = 0): void {
    const clubs = uniqueClubsInGroup(this.teamOptions, this.teamGroup);
    const teamEl = this.root.querySelector<HTMLElement>("[data-team-spin]");
    const leagueEl = this.root.querySelector<HTMLElement>("[data-league-spin]");
    const dials = this.root.querySelector<HTMLElement>(".team-dials");
    const showEra = this.teamGroup === "CLASSIC";
    if (dials) dials.classList.toggle("has-era", showEra);

    if (teamEl && clubs.length) {
      const n = clubs.length;
      const i = ((teamIdx % n) + n) % n;
      const prev = clubs[(i - 1 + n) % n]!;
      const cur = clubs[i]!;
      const next = clubs[(i + 1) % n]!;
      teamEl.setAttribute("data-team-index", String(i));
      teamEl.setAttribute("aria-label", `Team select ${cur.label}`);
      teamEl.innerHTML = spinTriplet(prev.label, cur.label, next.label);

      if (showEra) {
        const eras = erasForClub(this.teamOptions, cur.clubKey);
        this.ensureEraField(dials, eras, eraIdx);
      } else {
        dials?.querySelector("[data-era-field]")?.remove();
      }
    }
    if (leagueEl) {
      const leagueIdx = MENU_TEAM_GROUPS.indexOf(this.teamGroup);
      const n = MENU_TEAM_GROUPS.length;
      const i = ((leagueIdx % n) + n) % n;
      const prev = MENU_TEAM_GROUP_LABEL[MENU_TEAM_GROUPS[(i - 1 + n) % n]!];
      const center = MENU_TEAM_GROUP_LABEL[this.teamGroup];
      const next = MENU_TEAM_GROUP_LABEL[MENU_TEAM_GROUPS[(i + 1) % n]!];
      leagueEl.setAttribute("data-league-index", String(i));
      leagueEl.setAttribute("aria-label", `League select ${center}`);
      leagueEl.innerHTML = spinTriplet(prev, center, next);
    }
  }

  private ensureEraField(
    dials: HTMLElement | null,
    eras: MenuTeamOption[],
    eraIdx: number,
  ): void {
    if (!dials) return;
    let field = dials.querySelector<HTMLElement>("[data-era-field]");
    if (!field) {
      field = document.createElement("span");
      field.className = "team-dial-field";
      field.setAttribute("data-era-field", "");
      field.innerHTML = `<span class="team-dial-label">Era</span>`;
      dials.appendChild(field);
    }
    let eraEl = field.querySelector<HTMLElement>("[data-era-spin]");
    if (!eraEl) {
      const wrap = document.createElement("span");
      field.appendChild(wrap);
      wrap.outerHTML = eraSpinHtml(eras, eraIdx);
      this.bindEraSpin();
      return;
    }
    paintEraSpin(eraEl, eras, eraIdx);
  }

  private scheduleClubCommit(teamId: string): void {
    if (this.clubCommitTimer) clearTimeout(this.clubCommitTimer);
    this.clubCommitTimer = setTimeout(() => {
      this.clubCommitTimer = null;
      this.pendingTeamId = null;
      this.onClubChange?.(teamId);
    }, 140);
  }

  private stepHalf(delta: number): void {
    const seconds = HALF_LENGTH_CHOICES.map((c) => c.seconds);
    this.matchDuration = cycleValue(seconds, this.matchDuration, delta);
    const el = this.root.querySelector("[data-half-spin]");
    if (el) el.innerHTML = halfSpinInner(this.matchDuration);
    this.onHalf?.(this.matchDuration);
  }

  private paintSelection(): void {
    this.root.querySelectorAll(".menu-item").forEach((btn, i) => {
      btn.classList.toggle("active", i === this.selected);
    });
  }

  dispose(): void {
    if (this.clubCommitTimer) clearTimeout(this.clubCommitTimer);
    this.root.remove();
  }
}

/** Accumulator + cooldown so trackpad inertia does not blast through dial options. */
interface SpinWheelState {
  acc: number;
  coolUntil: number;
}

function createSpinWheel(): SpinWheelState {
  return { acc: 0, coolUntil: 0 };
}

function consumeSpinWheel(
  state: SpinWheelState,
  deltaY: number,
  opts: { threshold: number; cooldownMs: number; eventCap: number },
): -1 | 0 | 1 {
  const now = performance.now();
  if (now < state.coolUntil) {
    // Swallow momentum during cooldown so a flick is one deliberate step.
    state.acc *= 0.35;
    return 0;
  }
  const capped = Math.max(-opts.eventCap, Math.min(opts.eventCap, deltaY));
  state.acc += capped;
  if (Math.abs(state.acc) < opts.threshold) return 0;
  const dir: -1 | 1 = state.acc > 0 ? 1 : -1;
  state.acc -= dir * opts.threshold;
  state.acc *= 0.25;
  state.coolUntil = now + opts.cooldownMs;
  return dir;
}

function cycleValue<T>(list: T[], current: T, delta: number): T {
  const i = list.indexOf(current);
  const idx = i < 0 ? 0 : i;
  return list[(idx + delta + list.length * 8) % list.length];
}

function halfIndex(durationSeconds: number): number {
  const i = HALF_LENGTH_CHOICES.findIndex((c) => c.seconds === durationSeconds);
  return i < 0 ? 1 : i;
}

function halfLabelAt(index: number, delta: number): string {
  const n = HALF_LENGTH_CHOICES.length;
  const choice = HALF_LENGTH_CHOICES[(index + delta + n * 8) % n];
  return `${choice.minutes} min`;
}

function halfSpinInner(durationSeconds: number): string {
  const i = halfIndex(durationSeconds);
  return [
    `<span class="spin-ghost">${halfLabelAt(i, -1)}</span>`,
    `<strong>${halfLabelAt(i, 0)}</strong>`,
    `<span class="spin-ghost">${halfLabelAt(i, 1)}</span>`,
  ].join("");
}

function halfSpinHtml(durationSeconds: number): string {
  return `<span class="time-spin duration-spin" data-half-spin tabindex="0" role="button" aria-label="Half length">${halfSpinInner(durationSeconds)}</span>`;
}

function spinTriplet(prev: string, current: string, next: string): string {
  return [
    `<span class="spin-ghost">${escapeHtml(prev)}</span>`,
    `<strong>${escapeHtml(current)}</strong>`,
    `<span class="spin-ghost">${escapeHtml(next)}</span>`,
  ].join("");
}

function teamSpinHtml(teams: MenuTeamOption[], index: number): string {
  if (!teams.length) {
    return `<span class="time-spin team-spin" data-team-spin data-team-index="0" tabindex="0" role="button" aria-label="Team select">—</span>`;
  }
  const n = teams.length;
  const i = ((index % n) + n) % n;
  const prev = teams[(i - 1 + n) % n]!;
  const cur = teams[i]!;
  const next = teams[(i + 1) % n]!;
  return `<span class="time-spin team-spin" data-team-spin data-team-index="${i}" tabindex="0" role="button" aria-label="Team select ${cur.label}">${spinTriplet(prev.label, cur.label, next.label)}</span>`;
}

function eraSpinHtml(eras: MenuTeamOption[], index: number): string {
  if (!eras.length) {
    return `<span class="time-spin era-spin" data-era-spin data-era-index="0" data-club-key="" tabindex="0" role="button" aria-label="Era select">—</span>`;
  }
  const n = eras.length;
  const i = ((index % n) + n) % n;
  const cur = eras[i]!;
  const locked = n <= 1;
  const prev = locked ? cur : eras[(i - 1 + n) % n]!;
  const next = locked ? cur : eras[(i + 1) % n]!;
  return `<span class="time-spin era-spin${locked ? " era-locked" : ""}" data-era-spin data-era-index="${i}" data-club-key="${escapeHtml(cur.clubKey)}" tabindex="0" role="button" aria-label="Era select ${cur.eraLabel}">${spinTriplet(prev.eraLabel, cur.eraLabel, next.eraLabel)}</span>`;
}

function paintEraSpin(eraEl: HTMLElement, eras: MenuTeamOption[], eraIdx: number): void {
  if (!eras.length) {
    eraEl.setAttribute("data-era-index", "0");
    eraEl.setAttribute("data-club-key", "");
    eraEl.classList.add("era-locked");
    eraEl.setAttribute("aria-label", "Era select");
    eraEl.innerHTML = "—";
    return;
  }
  const n = eras.length;
  const i = ((eraIdx % n) + n) % n;
  const cur = eras[i]!;
  const locked = n <= 1;
  const prev = locked ? cur : eras[(i - 1 + n) % n]!;
  const next = locked ? cur : eras[(i + 1) % n]!;
  eraEl.setAttribute("data-era-index", String(i));
  eraEl.setAttribute("data-club-key", cur.clubKey);
  eraEl.classList.toggle("era-locked", locked);
  eraEl.setAttribute("aria-label", `Era select ${cur.eraLabel}`);
  eraEl.innerHTML = spinTriplet(prev.eraLabel, cur.eraLabel, next.eraLabel);
}

function leagueSpinHtml(index: number, centerLabel: string): string {
  const n = MENU_TEAM_GROUPS.length;
  const i = ((index % n) + n) % n;
  const prev = MENU_TEAM_GROUP_LABEL[MENU_TEAM_GROUPS[(i - 1 + n) % n]!];
  const next = MENU_TEAM_GROUP_LABEL[MENU_TEAM_GROUPS[(i + 1) % n]!];
  return `<span class="time-spin league-spin" data-league-spin data-league-index="${i}" tabindex="0" role="button" aria-label="League select ${centerLabel}">${spinTriplet(prev, centerLabel, next)}</span>`;
}

function kickCountdownUnit(phase: KickCountdownPhase): string {
  if (phase === "days") return "D";
  if (phase === "hours") return "H";
  if (phase === "minutes") return "M";
  return "S";
}

function kickCountdownHtml(date: string, time: string): string {
  const cd = formatKickCountdown(kickOffRemainingSeconds(date, time));
  const unit = kickCountdownUnit(cd.phase);
  return `<span class="kick-countdown phase-${cd.phase}" data-kick-count aria-label="Kick-off in ${cd.value} ${cd.phase}"><strong>${cd.value}</strong><span class="kick-unit" data-kick-unit>${unit}</span></span>`;
}

function clubBadgeStyle(team: TeamRecord): string {
  const primary = team.primaryColor || team.defaultKit?.shirt || "#333333";
  const secondary = team.secondaryColor || team.defaultKit?.trim || "#ffffff";
  return `--club-primary:${primary};--club-secondary:${secondary}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Double-rAF so flex widths / web fonts settle before measuring. */
function scheduleFitMenuLabels(root: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fitMenuLabels(root));
  });
}

/**
 * Shrink stadium·team club line to width — never ellipsize with "…".
 * Team/league dials use a fixed CSS size (no JS resize).
 */
export function fitMenuLabels(root: HTMLElement): void {
  const line = root.querySelector<HTMLElement>(".club-line");
  if (!line) return;
  const meta = line.closest<HTMLElement>(".club-meta");
  const crest = meta?.querySelector<HTMLElement>(".club-crest");
  const gap = 12;
  const avail =
    meta && crest
      ? Math.max(24, meta.clientWidth - crest.offsetWidth - gap)
      : line.clientWidth || meta?.clientWidth || 0;
  fitNowrapToWidth(line, avail, { minPx: 10, basePx: parseFloat(getComputedStyle(line).fontSize) || 20 });
}

function fitNowrapToWidth(
  el: HTMLElement,
  maxW: number,
  opts: { minPx: number; basePx: number },
): void {
  if (maxW < 8) return;
  el.style.overflow = "hidden";
  el.style.textOverflow = "clip";
  el.style.whiteSpace = "nowrap";
  el.style.fontSize = "";
  let size = opts.basePx;
  let tracking = 0.08;
  const trackingMatch = /^([\d.]+)(em|px)?$/.exec(getComputedStyle(el).letterSpacing.trim());
  if (trackingMatch?.[2] === "em") tracking = Number(trackingMatch[1]);
  else tracking = 0.06;
  el.style.fontSize = `${size}px`;
  el.style.letterSpacing = `${tracking}em`;
  let guard = 0;
  while (el.scrollWidth > maxW + 0.5 && size > opts.minPx && guard < 48) {
    size -= 0.5;
    el.style.fontSize = `${size}px`;
    guard += 1;
  }
  while (el.scrollWidth > maxW + 0.5 && tracking > 0 && guard < 72) {
    tracking = Math.max(0, tracking - 0.01);
    el.style.letterSpacing = `${tracking}em`;
    guard += 1;
  }
}
