import * as THREE from "three";
import { AppState } from "./AppState";
import { AssetManager } from "./AssetManager";
import { AudioManager } from "./AudioManager";
import { GameDatabase } from "./Database";
import { EventBus } from "./EventBus";
import { GameLoop } from "./Loop";
import { GameMode } from "./GameMode";
import { SaveManager } from "./SaveManager";
import { SceneManager } from "./SceneManager";
import { AUTOPLAY_IDLE_SECONDS, AUTOPLAY_NEXT_MATCH_HOLD, DEFAULT_KICK_OFF_TIME, DEFAULT_TEAM_ID, HALF_LENGTH, HALF_WIDTH, PRE_MATCH_CARD_SECONDS, SIM_BANNER_DELAY_SECONDS, clampMatchDuration, kickOffRemainingSeconds } from "../football/constants";
import { MatchCamera } from "../football/camera/MatchCamera";
import { InputManager } from "../football/controls/InputManager";
import { Match } from "../football/Match";
import { FootballState } from "../football/FootballState";
import { MatchHUD } from "../football/ui/MatchHUD";
import { mergeKeyBindings } from "../football/controls/KeyBindings";
import { DebugOverlay } from "../football/ui/DebugOverlay";
import { decisionTelemetry } from "../football/ai/DecisionTelemetry";
import { FormationDebug } from "../football/ui/FormationDebug";
import { UnitLines, type UnitLineSettings } from "../football/ui/UnitLines";
import { resolveMatchKits } from "../football/teams/KitClash";
import { Stadium } from "../football/stadium/Stadium";
import { createPlayerVisual } from "../football/players/PlayerVisual";
import { DEFAULT_PLAYER_MODEL, preloadPlayerModels } from "../football/players/PlayerModelLoader";
import { Player } from "../football/players/Player";
import { applyPhysicalToAppearance } from "../football/players/PlayerStats";
import { applyClubNameAppearance, applyTitleFont } from "../ui/TitleFonts";
import { MainMenu } from "../ui/MainMenu";
import {
  CharacterSelect,
  type FormationSide,
  type FormationSideConfig,
  type SquadPlayerEdit,
} from "../ui/CharacterSelect";
import { KitPanelPreview } from "../ui/KitPanelPreview";
import { PauseMenu } from "../ui/PauseMenu";
import { SettingsMenu } from "../ui/Settings";
import { TeamEditor } from "../ui/TeamEditor";
import { PlayerDatabaseEditor } from "../ui/PlayerDatabaseEditor";
import { MatchSetup } from "../ui/MatchSetup";
import { MatchCard, shouldFadeMatchCard } from "../ui/MatchCard";
import { MatchSimulationLabMenu } from "../ui/MatchSimulationLabMenu";
import { TableSetupMenu } from "../ui/TableSetupMenu";
import { TableMatch, type TableMatchConfig } from "../football/table";
import {
  runSimulationLab,
  exportReportJson,
  exportReportCsv,
  CLASSIC_STRESS_FIXTURES,
  type SimulationLabOptions,
} from "../football/simulation/MatchSimulationLab";
import type { EnglishLeague, FixtureRecord } from "../data/schema";
import { clampWeatherForTime, resolveEnvironment, type TimeOfDay, type Weather } from "../football/environment/Environment";
import { defaultSpotKick } from "../football/practice/SpotKick";
import { todayIso } from "../data/leagueSchedule";
import { isEnglishLeagueCompetition, leagueForTeam } from "../football/league/Standings";
import { applyUserMatchweek, cachedStrength, simulateDatesBefore } from "../football/league/Simulate";
import { ensurePredictionWeek } from "../football/predictions/Predictions";

export class Game {
  readonly events = new EventBus();
  readonly save = new SaveManager();
  readonly assets = new AssetManager();
  readonly scenes = new SceneManager();
  readonly audio = new AudioManager();
  readonly input = new InputManager();
  db!: GameDatabase;
  appState: AppState = AppState.BOOT;
  match: Match | null = null;
  tableMatch: TableMatch | null = null;
  preferredPlayerId: string | null = null;
  private teamControl = false;
  /** Listed fixture started via SIMULATE (AI watch); do not chain attract matches. */
  private fixtureSim = false;
  /** True while the listed fixture is still AI-only; used to mark the league result simulated. */
  private watchSim = false;
  private charTeamId = DEFAULT_TEAM_ID;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: MatchCamera;
  private loop: GameLoop;
  private ui: HTMLElement;
  private menu!: MainMenu;
  private chars!: CharacterSelect;
  private pause!: PauseMenu;
  private pauseFormationOpen = false;
  private settings!: SettingsMenu;
  private teams!: TeamEditor;
  private players!: PlayerDatabaseEditor;
  private setup!: MatchSetup;
  private simLab!: MatchSimulationLabMenu;
  private tableSetup!: TableSetupMenu;
  private matchCard!: MatchCard;
  private hud: MatchHUD | null = null;
  private debug!: DebugOverlay;
  private formDebug = new FormationDebug();
  private unitLines = new UnitLines();
  private menuStadium: Stadium | null = null;
  private preview: THREE.Group | null = null;
  private kitPreview = new KitPanelPreview();
  private menuNav = 0;
  private frames = 0;
  private fps = 60;
  private fpsT = 0;
  private practice: "none" | "spot" = "none";
  private preMatchT = 0;
  private pendingFixture: FixtureRecord | null = null;
  private leagueFixtureId: string | null = null;
  private attractHold = 0;
  private simBannerPlayT = 0;
  private simBannerLabel = "SIMULATOR · ANY CONTROL TO TAKE OVER · ESC PAUSE";
  private lastExposure = 1.05;
  private escapeClosedOverlay = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new MatchCamera(innerWidth / innerHeight);
    this.loop = new GameLoop(this.update, this.render, this.ai);
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", () => this.audio.unlock());
    window.addEventListener("pointerdown", () => this.audio.unlock());
    window.addEventListener("pointerup", () => this.audio.unlock());
    window.addEventListener("touchend", () => this.audio.unlock(), { passive: true });
  }

  async start(): Promise<void> {
    this.db = await GameDatabase.load(this.save);
    // Shared skinned humanoid — procedural mannequin remains the fallback if this fails.
    await preloadPlayerModels([DEFAULT_PLAYER_MODEL]);
    this.menu = new MainMenu(this.ui);
    this.menu.onHalf = (seconds) => this.setMenuHalfLength(seconds);
    this.menu.onClubChange = (teamId) => this.setDefaultClub(teamId);
    this.menu.onPredictionsChange = (state) => {
      this.save.data.predictions = state;
      this.save.save();
      this.paintMainMenu();
    };
    this.menu.onPredictionsRefresh = () => this.paintMainMenu();
    this.chars = new CharacterSelect(this.ui);
    this.chars.onSquadPlayerSave = (edit) => this.persistSquadPlayerEdit(edit);
    this.pause = new PauseMenu(this.ui);
    this.settings = new SettingsMenu(this.ui);
    this.settings.onSectionChange = (section) => {
      if (this.menu.panel === "options") this.menu.optionsSection = section;
    };
    this.teams = new TeamEditor(this.ui);
    this.players = new PlayerDatabaseEditor(this.ui);
    this.setup = new MatchSetup(this.ui);
    this.simLab = new MatchSimulationLabMenu(this.ui);
    this.tableSetup = new TableSetupMenu(this.ui);
    this.tableSetup.onStart = (cfg) => this.beginTableMatch(cfg);
    this.tableSetup.onCancel = () => {
      this.tableSetup.hide();
      this.appState = AppState.MAIN_MENU;
      this.paintMainMenu();
    };
    this.matchCard = new MatchCard(this.ui);
    this.debug = new DebugOverlay(this.ui);
    this.applyGraphics();
    applyTitleFont(this.save.data.settings.titleFont);
    applyClubNameAppearance(this.save.data.settings);
    this.input.keyboard.setBindings(this.save.data.settings.keyBindings);
    this.audio.setVolume(this.save.data.settings.masterVolume);
    this.audio.setEnabled(this.save.data.settings.audioEnabled !== false);
    this.bindUi();
    this.canvas.addEventListener("pointerdown", this.onPitchPointer);
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Escape") return;
      if (this.settings.isListening) return;
      if (this.dismissOverlay()) {
        this.escapeClosedOverlay = true;
        e.preventDefault();
        return;
      }
      if (this.appState === AppState.MATCH && this.match) {
        this.appState = AppState.PAUSED;
        this.match.enterPause();
        this.audio.pauseStadiumAmbience();
        this.pause.reset();
        this.renderPause();
        this.escapeClosedOverlay = true;
        e.preventDefault();
      } else if (this.appState === AppState.MATCH && this.tableMatch) {
        this.appState = AppState.PAUSED;
        this.tableMatch.paused = true;
        this.pause.reset();
        this.renderPause();
        this.escapeClosedOverlay = true;
        e.preventDefault();
      }
    });
    this.events.on("GOAL", (e) => {
      this.audio.whistle();
      this.audio.goal(e.scoringTeam === "home" ? "HOME" : "AWAY");
    });
    this.events.on("SHOT", () => this.audio.kick());
    // Restarts (foul FK/pen, throw, corner, GK) — one blast via Match.beginRestart.
    this.events.on("REFEREE_WHISTLE", () => this.audio.whistle());
    this.events.on("FULL_TIME", (e) => {
      this.audio.whistle();
      this.recordLeagueResult(e.home, e.away);
    });
    this.events.on("HALF_TIME", () => this.audio.whistle());
    this.events.on("KICKOFF", () => {
      this.audio.whistle();
      if (this.appState !== AppState.PRE_MATCH) this.matchCard.hide();
    });
    if (!this.save.data.settings.leagueProgression) {
      this.catchUpLeague(false);
    } else if (!this.save.data.fixtures.length) {
      this.catchUpLeague(false);
    }
    this.normalizeLeagueMode();
    if (!this.save.data.settings.leagueProgression) {
      this.enterCasualFixtures();
    }
    this.goMenu();
    this.applyUrlParams();
    if (this.appState === AppState.MAIN_MENU) this.applyMenuEnvironment();
    this.loop.start();
  }

  private bindUi(): void {
    this.ui.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      this.audio.ui();
      this.input.lastInputAt = performance.now();
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      const tod = btn.getAttribute("data-tod");
      const mode = btn.getAttribute("data-mode");
      const clubId = btn.getAttribute("data-club-id");
      if (act === "spot-reset") {
        this.match?.resetSpotKick();
        return;
      }
      if (this.appState === AppState.MAIN_MENU && clubId) {
        this.setDefaultClub(clubId);
        return;
      }
      if (this.appState === AppState.MAIN_MENU && (tod === "DAY" || tod === "EVENING" || tod === "NIGHT")) {
        this.setMenuTimeOfDay(tod);
        return;
      }
      if (
        this.appState === AppState.MAIN_MENU &&
        (mode === "REAL" || mode === "ARCADE" || mode === "LEAGUE" || mode === "TABLE")
      ) {
        this.setMenuPlayMode(mode);
        return;
      }
      if (this.appState === AppState.MAIN_MENU && act === "panel-back") {
        this.settings.hide();
        this.menu.setPanel("menu", true);
        this.paintMainMenu();
        return;
      }
      if (this.appState === AppState.MAIN_MENU && act === "options-back") {
        this.settings.hide();
        this.menu.openOptions();
        this.paintMainMenu();
        return;
      }
      const optionsSection = btn.getAttribute("data-options-section") as
        | "match"
        | "gameplay"
        | "controls"
        | "audio"
        | "display"
        | "advanced"
        | null;
      if (this.appState === AppState.MAIN_MENU && optionsSection) {
        this.menu.openOptionsSection(optionsSection);
        this.paintMainMenu();
        return;
      }
      const lfTab = btn.getAttribute("data-lf") as "league" | "fixtures" | null;
      if (this.appState === AppState.MAIN_MENU && act === "lf-tab" && (lfTab === "league" || lfTab === "fixtures")) {
        this.menu.setLeagueFixturesTab(lfTab, leagueForTeam(this.db.getTeam(this.defaultClubId())));
        this.paintMainMenu();
        return;
      }
      const predAct = btn.getAttribute("data-pred");
      if (this.appState === AppState.MAIN_MENU && predAct) {
        const next = this.menu.handlePredictionAction(
          predAct,
          this.db,
          this.save.data.predictions,
          btn.getAttribute("data-fixture"),
        );
        this.save.data.predictions = next;
        this.save.save();
        this.paintMainMenu();
        return;
      }
      const leagueTab = btn.getAttribute("data-league") as EnglishLeague | null;
      if (this.appState === AppState.MAIN_MENU && leagueTab) {
        this.menu.setLeagueTab(leagueTab);
        this.paintMainMenu();
        return;
      }
      const week = btn.getAttribute("data-week");
      if (this.appState === AppState.MAIN_MENU && (week === "prev" || week === "next")) {
        this.menu.stepWeek(this.db, week);
        this.paintMainMenu();
        return;
      }
      if (this.appState === AppState.MAIN_MENU && id) this.menuAction(id);
      const labAct = btn.getAttribute("data-lab");
      if (labAct && this.simLab.isOpen) {
        void this.handleSimLabAction(labAct);
        return;
      }
      if (this.appState === AppState.CHARACTER_SELECT || this.pauseFormationOpen) {
        const char = btn.getAttribute("data-char");
        if (this.pauseFormationOpen) {
          if (char === "pause-back") {
            this.closePauseFormation(false);
            return;
          }
          if (char === "pause-apply") {
            this.closePauseFormation(true);
            return;
          }
          if (char === "form-side") {
            const side = btn.getAttribute("data-side");
            if (side === "home" || side === "away") {
              this.chars.setFormationSide(side);
              this.chars.render();
            }
            return;
          }
          if (char === "form") {
            const form = btn.getAttribute("data-form");
            if (form) {
              this.chars.setFormation(form);
              this.chars.render();
            }
            return;
          }
          if (char === "chalk") {
            this.chars.toggleChalkMode();
            return;
          }
          if (char === "play-style") {
            const style = btn.getAttribute("data-style");
            if (style === "auto" || style === "possession" || style === "balanced" || style === "counter" || style === "direct" || style === "routeOne") {
              this.chars.setPlayStyle(style);
              this.chars.render();
            }
            return;
          }
          if (char === "pick") {
            const id = btn.getAttribute("data-id");
            if (id) {
              this.chars.selectPlayerId(id);
              this.chars.refreshTeamSelection();
            }
            return;
          }
          return;
        }
        if (char === "prev") {
          this.chars.move(-1);
          this.chars.render();
          this.refreshCharacterPreview();
        }
        if (char === "next") {
          this.chars.move(1);
          this.chars.render();
          this.refreshCharacterPreview();
        }
        if (char === "mode-player") {
          this.chars.setControlMode("PLAYER");
          this.chars.render();
          this.refreshCharacterPreview();
        }
        if (char === "mode-team") {
          this.chars.setControlMode("TEAM");
          this.chars.render();
          this.refreshCharacterPreview();
        }
        if (char === "mode-kit") {
          this.chars.setControlMode("KIT");
          this.chars.render();
          this.refreshCharacterPreview();
        }
        if (char === "form-side") {
          const side = btn.getAttribute("data-side");
          if (side === "home" || side === "away") {
            this.chars.setFormationSide(side);
            this.chars.render();
          }
        }
        if (char === "form") {
          const form = btn.getAttribute("data-form");
          if (form) {
            this.chars.setFormation(form);
            this.chars.render();
          }
        }
        if (char === "chalk") {
          this.chars.toggleChalkMode();
        }
        if (char === "play-style") {
          const style = btn.getAttribute("data-style");
          if (style === "auto" || style === "possession" || style === "balanced" || style === "counter" || style === "direct" || style === "routeOne") {
            this.chars.setPlayStyle(style);
            this.chars.render();
          }
        }
        if (char === "kit") {
          const kit = btn.getAttribute("data-kit");
          if (kit === "auto" || kit === "home" || kit === "away") {
            this.chars.setKitChoice(kit);
            this.chars.render();
            this.refreshCharacterPreview();
          }
        }
        if (char === "pick") {
          const id = btn.getAttribute("data-id");
          if (id) {
            this.chars.selectPlayerId(id);
            this.chars.refreshTeamSelection();
            this.refreshCharacterPreview();
          }
        }
        if (char === "start") this.beginPreMatch();
        if (char === "back") {
          this.goMenu();
          return;
        }
        if (char === "simulate") this.simulatePendingFixture();
      }
      if (this.appState === AppState.MATCH_SETUP && btn.getAttribute("data-setup") === "go") {
        this.confirmMatchSetup();
      }
      if (act === "back") {
        if (this.match) {
          this.settings.hide();
          this.appState = AppState.PAUSED;
          this.match.enterPause();
          this.renderPause();
          return;
        }
        this.goMenu();
      }
      if (act === "save") this.saveCurrent();
      if (act === "sim-lab") {
        this.openSimLab();
        return;
      }
      if (act === "reset") {
        this.save.resetDefaults();
        this.input.keyboard.setBindings(this.save.data.settings.keyBindings);
        this.hud?.setBindings(this.save.data.settings.keyBindings);
        this.enterCasualFixtures();
        applyTitleFont(this.save.data.settings.titleFont);
        applyClubNameAppearance(this.save.data.settings);
        this.audio.setVolume(this.save.data.settings.masterVolume);
        this.audio.setEnabled(this.save.data.settings.audioEnabled !== false);
        if (this.match) {
          this.settings.render(this.save.data.settings, this.db.advertising);
        } else if (this.menu.panel === "options" && this.menu.optionsSection) {
          this.paintMainMenu();
        } else if (this.settings.isOpen && !this.settings.isEmbedded) {
          this.settings.render(this.save.data.settings, this.db.advertising);
        }
        if (!this.match) {
          this.buildMenuWorld();
          this.applyMenuEnvironment();
          if (!(this.menu.panel === "options" && this.menu.optionsSection)) {
            this.paintMainMenu();
          }
        }
      }
      if (this.appState === AppState.PAUSED) {
        const pauseAct = btn.getAttribute("data-pause");
        if (pauseAct) this.handlePauseAction(pauseAct, btn);
      }
    });
  }

  private saveCurrent(): void {
    if (this.settings.isOpen) {
      this.save.data.settings = { ...this.save.data.settings, ...this.settings.read() };
      this.save.data.settings.matchDuration = clampMatchDuration(this.save.data.settings.matchDuration);
      this.save.data.settings.keyBindings = mergeKeyBindings(this.save.data.settings.keyBindings);
      this.input.keyboard.setBindings(this.save.data.settings.keyBindings);
      this.hud?.setBindings(this.save.data.settings.keyBindings);
      const ads = this.settings.readAds();
      if (ads.length) {
        this.db.advertising = ads;
        this.match?.stadium.ads.applyRecords(ads);
        this.menuStadium?.ads.applyRecords(ads);
      }
      this.applyGraphics();
      applyTitleFont(this.save.data.settings.titleFont);
      applyClubNameAppearance(this.save.data.settings);
      this.audio.setVolume(this.save.data.settings.masterVolume);
      this.audio.setEnabled(this.save.data.settings.audioEnabled !== false);
      if (this.match) {
        this.match.homeHudRing = this.save.data.settings.homeHudRing;
        this.match.awayHudRing = this.save.data.settings.awayHudRing;
        this.match.homeShowPortraits = this.save.data.settings.homeShowPortraits;
        this.match.awayShowPortraits = this.save.data.settings.awayShowPortraits;
        this.match.homePortraitOpacity = this.save.data.settings.homePortraitOpacity ?? 0.85;
        this.match.awayPortraitOpacity = this.save.data.settings.awayPortraitOpacity ?? 0.85;
        this.match.homePortraitScale = this.save.data.settings.homePortraitScale ?? 1;
        this.match.awayPortraitScale = this.save.data.settings.awayPortraitScale ?? 1;
        this.match.homePortraitUpright = this.save.data.settings.homePortraitUpright;
        this.match.awayPortraitUpright = this.save.data.settings.awayPortraitUpright;
        this.match.homeHidePlayers = this.save.data.settings.homeHidePlayers;
        this.match.awayHidePlayers = this.save.data.settings.awayHidePlayers;
        this.match.ballGoldRing = this.save.data.settings.ballGoldRing;
        this.match.showPassTargetHighlight = this.save.data.settings.showPassTargetHighlight;
        this.chars.showOverlays = this.save.data.settings.formationOverlays === true;
        if (!this.chars.root.hidden) this.chars.render();
        this.unitLines.update(this.scene, this.match, this.unitLineSettings());
      }
      if (this.settings.isEmbedded && this.menu.optionsSection) {
        this.menu.optionsSection = this.settings.section;
      }
    }
    if (this.appState === AppState.TEAM_EDITOR) this.teams.apply(this.db);
    if (this.appState === AppState.PLAYER_DATABASE) this.players.apply(this.db);
    this.save.data.teams = [...this.db.teams.values()];
    this.save.data.players = [...this.db.players.values()];
    this.save.data.memberships = this.db.memberships;
    this.save.data.fixtures = this.db.fixtures;
    this.save.data.advertising = this.db.advertising;
    this.save.save();
    this.audio.ui();
  }

  private applyGraphics(): void {
    const preset = this.save.data.settings.graphicsPreset;
    const ratio = preset === "LOW" ? 1 : preset === "MEDIUM" ? 1.35 : Math.min(devicePixelRatio, preset === "VERY_HIGH" ? 2.5 : 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = preset !== "LOW";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMappingExposure = this.match?.env.exposure ?? (preset === "VERY_HIGH" ? 0.92 : 0.88);
    this.debug.enabled = this.save.data.settings.debug;
    if (this.match) {
      this.match.camera.setViewMode(this.save.data.settings.viewMode ?? "MEDIUM");
      this.match.camera.trackMode = this.save.data.settings.trackMode ?? "DYNAMIC";
      this.match.camera.setCameraZoom(this.save.data.settings.cameraZoom ?? 1);
      this.match.camera.mode = "BROADCAST";
      this.match.ball.setVisualScale(this.save.data.settings.ballScale ?? 1);
      this.match.ballGoldRing = this.save.data.settings.ballGoldRing;
    }
  }

  private goMenu(): void {
    this.ui.querySelectorAll(".attract-banner").forEach((el) => el.remove());
    this.attractHold = 0;
    this.simBannerPlayT = 0;
    this.fixtureSim = false;
    this.watchSim = false;
    // Always restart the 60s simulator idle clock when landing on the main menu —
    // time spent in formation / play-next must not immediately auto-start a match.
    this.input.lastInputAt = performance.now();
    this.menu.setCountdown(AUTOPLAY_IDLE_SECONDS);
    this.menu.attract = false;
    this.audio.stopStadiumAmbience();
    this.clearMatch();
    this.debug.el.hidden = true;
    this.hideEditors();
    this.pauseFormationOpen = false;
    this.chars.setContext("select");
    this.chars.hide();
    this.setup.hide();
    this.simLab.hide();
    this.tableSetup.hide();
    this.pause.hide();
    this.scenes.mode = GameMode.FOOTBALL;
    this.appState = AppState.MAIN_MENU;
    this.scenes.mode = GameMode.FOOTBALL;
    this.buildMenuWorld();
    this.db.userTeamId = this.defaultClubId();
    applyTitleFont(this.save.data.settings.titleFont);
    applyClubNameAppearance(this.save.data.settings);
    this.menu.selected = 0;
    this.menu.setPanel("menu", false);
    this.menu.unlockTeamSelect();
    this.paintMainMenu();
    this.matchCard.hide();
  }

  private defaultClubId(): string {
    const id = this.save.data.settings.defaultTeamId;
    return id && this.db.teams.has(id) ? id : DEFAULT_TEAM_ID;
  }

  private listedFixture(): FixtureRecord {
    return this.db.nextFixture(this.defaultClubId(), true);
  }

  private userSideFor(fixture: FixtureRecord): "home" | "away" {
    return fixture.awayTeamId === this.defaultClubId() && fixture.homeTeamId !== this.defaultClubId() ? "away" : "home";
  }

  private setDefaultClub(teamId: string): void {
    // Ignore late dial commits once a match / pre-match flow has begun.
    if (this.appState !== AppState.MAIN_MENU) return;
    if (!this.db.teams.has(teamId)) return;
    this.save.data.settings.defaultTeamId = teamId;
    this.db.userTeamId = teamId;
    this.save.save();
    this.buildMenuWorld();
    this.applyMenuEnvironment();
    this.paintMainMenu();
  }

  private paintMainMenu(): void {
    const f = this.listedFixture();
    const saved = this.save.data.settings;
    saved.kickOffTime = DEFAULT_KICK_OFF_TIME;
    f.time = DEFAULT_KICK_OFF_TIME;
    const club = this.db.getTeam(this.defaultClubId());
    this.save.data.predictions = ensurePredictionWeek(this.save.data.predictions, this.db.fixtures);
    this.save.data.predictions = ensurePredictionWeek(
      this.save.data.predictions,
      this.db.fixtures,
      todayIso(),
      this.menu.predictionsViewWeek,
    );
    this.menu.render(f, this.db.getTeam(f.homeTeamId), this.db.getTeam(f.awayTeamId), {
      timeOfDay: saved.timeOfDay,
      gameplayMode: saved.gameplayMode,
      playMode: saved.leagueProgression ? "LEAGUE" : saved.gameplayMode,
      showLeague: this.hasUserLeagueProgress(),
      kickOffTime: saved.kickOffTime,
      matchDuration: clampMatchDuration(saved.matchDuration),
    }, {
      team: club,
      homeGround: this.db.getStadium(club.defaultStadiumId),
      matchGround: this.db.getStadium(f.venueId),
      teams: [...this.db.teams.values()],
    }, this.db, this.save.data.predictions);
    if (this.menu.panel === "options" && this.menu.optionsSection) {
      const host = this.menu.root.querySelector<HTMLElement>("[data-options-embed]");
      if (host) {
        this.settings.render(this.save.data.settings, this.db.advertising, {
          embedHost: host,
          section: this.menu.optionsSection,
        });
      }
    } else if (this.settings.isEmbedded) {
      this.settings.hide();
    }
  }

  private menuEnvironment() {
    const saved = this.save.data.settings;
    return resolveEnvironment(saved.timeOfDay, saved.weather);
  }

  private applyMenuEnvironment(): void {
    const env = this.menuEnvironment();
    this.menuStadium?.setLighting(env, this.save.data.settings.graphicsPreset);
    this.renderer.toneMappingExposure = env.exposure;
    this.lastExposure = env.exposure;
  }

  private setMenuTimeOfDay(time: TimeOfDay): void {
    const saved = this.save.data.settings;
    saved.timeOfDay = time;
    saved.weather = clampWeatherForTime(time, saved.weather);
    this.save.save();
    this.applyMenuEnvironment();
    this.paintMainMenu();
  }

  private setMenuPlayMode(mode: "REAL" | "ARCADE" | "LEAGUE" | "TABLE"): void {
    if (mode === "LEAGUE" && !this.hasUserLeagueProgress()) {
      this.paintMainMenu();
      return;
    }
    if (mode === "TABLE") {
      const wasLeague = this.save.data.settings.leagueProgression;
      if (wasLeague && this.hasUserLeagueProgress()) this.snapshotCareerFixtures();
      this.save.data.settings.leagueProgression = false;
      this.save.data.settings.gameplayMode = "TABLE";
      this.save.save();
      this.openTableSetup();
      return;
    }
    const wasLeague = this.save.data.settings.leagueProgression;
    if (mode === "LEAGUE") {
      this.save.data.settings.leagueProgression = true;
      this.save.data.settings.gameplayMode = "REAL";
      this.restoreCareerFixtures();
    } else {
      if (wasLeague && this.hasUserLeagueProgress()) this.snapshotCareerFixtures();
      this.save.data.settings.leagueProgression = false;
      this.save.data.settings.gameplayMode = mode;
      this.enterCasualFixtures();
    }
    this.save.save();
    this.buildMenuWorld();
    this.applyMenuEnvironment();
    this.paintMainMenu();
  }

  private openTableSetup(): void {
    this.menu.hide();
    this.tableSetup.open({
      layoutId: this.save.data.settings.tableLayoutId,
      opponent: this.save.data.settings.tableOpponent,
      difficulty: this.save.data.settings.tableDifficulty,
      firstTo: this.save.data.settings.tableFirstTo,
      customMen: this.save.data.settings.tableCustomMen,
    });
    this.appState = AppState.MATCH_SETUP;
  }

  private beginTableMatch(cfg: TableMatchConfig): void {
    this.save.data.settings.tableLayoutId = cfg.layoutId;
    this.save.data.settings.tableOpponent = cfg.opponent;
    this.save.data.settings.tableDifficulty = cfg.difficulty;
    this.save.data.settings.tableFirstTo = cfg.firstTo;
    this.save.data.settings.tableCustomMen = cfg.customMen;
    this.save.data.settings.gameplayMode = "TABLE";
    this.save.save();
    this.tableSetup.hide();
    this.clearMatch();
    this.clearWorld();
    this.scenes.mode = GameMode.TABLE;
    this.tableMatch = new TableMatch(this.scene, innerWidth / innerHeight, this.ui, cfg);
    this.appState = AppState.MATCH;
    this.audio.ui();
  }

  private snapshotCareerFixtures(): void {
    this.save.data.fixtures = this.db.fixtures.map((f) => ({ ...f }));
  }

  private restoreCareerFixtures(): void {
    this.db.resetFixturesBaseline();
    if (this.hasUserLeagueProgress() && this.save.data.fixtures.length) {
      this.db.applyCareerFixtures(this.save.data.fixtures as FixtureRecord[]);
    } else {
      this.catchUpLeague(false);
    }
  }

  /** User has finished at least one Play Next Fixture that wrote into the career calendar. */
  private hasUserLeagueProgress(): boolean {
    return this.save.data.playedListedFixture === true;
  }

  /** Drop stale LEAGUE selection when no career matches have been played yet. */
  private normalizeLeagueMode(): void {
    if (!this.save.data.settings.leagueProgression) return;
    if (this.hasUserLeagueProgress()) return;
    this.save.data.settings.leagueProgression = false;
    this.save.data.fixtures = [];
    this.save.save();
  }

  private enterCasualFixtures(): void {
    this.db.resetFixturesBaseline();
    this.catchUpLeague(false);
  }

  private persistListedFixture(): void {
    this.save.save();
  }

  private catchUpLeague(persist: boolean): void {
    const strength = cachedStrength((id) => this.db.teamStrength(id));
    simulateDatesBefore(this.db.fixtures, todayIso(), strength);
    if (persist) {
      this.save.data.fixtures = this.db.fixtures.map((f) => ({ ...f }));
      this.save.save();
    }
  }

  private leagueMatchId(fixture: FixtureRecord): string | null {
    const found = this.db.fixtures.find((f) => f.id === fixture.id);
    if (!found || found.played || !isEnglishLeagueCompetition(found.competition)) return null;
    return found.id;
  }

  private recordLeagueResult(home: number, away: number): void {
    const id = this.leagueFixtureId;
    if (!id || this.practice !== "none") return;
    if (this.match?.autoplay && !this.fixtureSim) return;
    const inLeague = this.save.data.settings.leagueProgression;
    const firstCareer = !this.save.data.playedListedFixture;
    // Casual REAL/ARCADE after career exists does not advance the season.
    if (!inLeague && !firstCareer) return;
    const strength = cachedStrength((teamId) => this.db.teamStrength(teamId));
    const recorded = applyUserMatchweek(this.db.fixtures, id, home, away, strength, this.watchSim);
    if (!recorded) return;
    this.leagueFixtureId = null;
    this.save.data.playedListedFixture = true;
    this.snapshotCareerFixtures();
    // First unlock from REAL/ARCADE: keep the natural calendar on screen; resume via LEAGUE.
    if (!inLeague) this.enterCasualFixtures();
    this.save.save();
  }

  private simulatePendingFixture(): void {
    this.beginPreMatch({ autoplay: true });
  }

  private setMenuHalfLength(seconds: number): void {
    const duration = clampMatchDuration(seconds);
    this.save.data.settings.matchDuration = duration;
    this.persistListedFixture();
  }

  private hideEditors(): void {
    this.settings.hide();
    this.simLab.hide();
    this.teams.hide();
    this.players.hide();
    this.setup.hide();
  }

  private buildMenuWorld(): void {
    this.clearWorld();
    const f = this.listedFixture();
    const home = this.db.getTeam(f.homeTeamId);
    const away = this.db.getTeam(f.awayTeamId);
    const kits = resolveMatchKits(home, away);
    this.menuStadium = new Stadium(
      this.scene,
      this.db.getStadium(f.venueId),
      this.db.advertising,
      home.primaryColor,
      away.primaryColor,
      this.menuEnvironment(),
      { home: kits.home, away: kits.away },
    );
    this.camera.establish();
  }

  private clearWorld(): void {
    if (this.menuStadium) {
      this.scene.remove(this.menuStadium.group);
      this.menuStadium = null;
    }
    if (this.preview) {
      this.scene.remove(this.preview);
      this.preview = null;
    }
    this.kitPreview.dispose();
  }

  private menuAction(id: string): void {
    const f = this.listedFixture();
    // Lock dials before any leave-menu action so a late spin cannot rewrite the club mid-launch.
    if (id === "sim" || id === "next" || id === "quick" || id === "spot") {
      this.menu.lockTeamSelect();
    }
    if (id === "sim") {
      this.practice = "none";
      this.leagueFixtureId = null;
      this.startSimulator();
      return;
    }
    if (id === "next") {
      this.practice = "none";
      const fixture = { ...this.listedFixture() };
      this.pendingFixture = fixture;
      this.leagueFixtureId = this.leagueMatchId(fixture);
      const side = this.userSideFor(fixture);
      this.openCharacterSelect(side === "away" ? fixture.awayTeamId : fixture.homeTeamId);
      return;
    }
    if (id === "quick") {
      this.practice = "none";
      this.leagueFixtureId = null;
      if (this.save.data.settings.gameplayMode === "TABLE") {
        this.openTableSetup();
        return;
      }
      this.openMatchSetup("quick");
    }
    if (id === "spot") {
      this.pendingFixture = { ...f, durationSeconds: this.save.data.settings.matchDuration };
      this.practice = "spot";
      this.leagueFixtureId = null;
      this.openCharacterSelect(this.defaultClubId());
    }
    if (id === "league-fixtures") {
      this.menu.openLeagueFixtures(leagueForTeam(this.db.getTeam(this.defaultClubId())));
      this.paintMainMenu();
      return;
    }
    if (id === "predictions") {
      this.menu.openPredictions();
      this.paintMainMenu();
      return;
    }
    if (id === "database") {
      this.menu.setPanel("database");
      this.paintMainMenu();
      return;
    }
    if (id === "teams") {
      this.menu.hide();
      this.appState = AppState.TEAM_EDITOR;
      this.teams.render(this.db);
    }
    if (id === "players") {
      this.menu.hide();
      this.appState = AppState.PLAYER_DATABASE;
      this.players.render(this.db);
    }
    if (id === "settings") {
      this.menu.openOptions();
      this.paintMainMenu();
      return;
    }
  }

  private openSimLab(): void {
    this.menu.hide();
    this.settings.hide();
    this.appState = AppState.SETTINGS;
    this.simLab.render(this.db, {
      includeClassic: this.save.data.settings.includeClassicInSimulations === true,
      matchDuration: this.save.data.settings.matchDuration,
    });
  }

  private async handleSimLabAction(act: string): Promise<void> {
    if (act === "back") {
      this.simLab.hide();
      this.openSettings();
      return;
    }
    if (act === "stop-after") {
      this.simLab.control.stopAfterCurrent = true;
      return;
    }
    if (act === "stop-now") {
      this.simLab.control.stopNow = true;
      return;
    }
    if (act === "export-json" && this.simLab.lastReport) {
      this.simLab.download(`sim-${this.simLab.lastReport.simulationRunId}.json`, exportReportJson(this.simLab.lastReport), "application/json");
      return;
    }
    if (act === "export-csv" && this.simLab.lastReport) {
      this.simLab.download(`sim-${this.simLab.lastReport.simulationRunId}.csv`, exportReportCsv(this.simLab.lastReport), "text/csv");
      return;
    }
    if (act === "start") {
      const opts = this.simLab.readOptions(this.save.data.settings.matchDuration);
      this.save.data.settings.includeClassicInSimulations = opts.includeClassicTeams;
      this.save.save();
      if (!this.simLab.confirmLargeRun(opts.matchCount)) return;
      await this.executeSimLabRun(opts);
      return;
    }
    if (act === "baseline") {
      const opts: SimulationLabOptions = {
        ...this.simLab.readOptions(this.save.data.settings.matchDuration),
        matchCount: 10,
        includeCurrentTeams: true,
        includeClassicTeams: false,
        homeTeamId: "AUTO",
        awayTeamId: "AUTO",
        recordTelemetry: false,
      };
      await this.executeSimLabRun(opts);
      return;
    }
    if (act === "stress") {
      this.simLab.setRunning(true);
      this.clearWorld();
      const host = { scene: this.scene, camera: this.camera, db: this.db, events: this.events };
      const merged = [];
      const total = Math.min(5, CLASSIC_STRESS_FIXTURES.length);
      const wall0 = performance.now();
      for (let i = 0; i < total; i++) {
        const piece = this.simLab.stressOptions(this.save.data.settings.matchDuration, i);
        this.simLab.setProgress({
          index: i + 1,
          total,
          fixtureLabel: piece.label,
          classicIncluded: false,
          telemetry: false,
          completed: merged.filter((m) => m.result !== "FAILED").length,
          errors: merged.filter((m) => m.result === "FAILED").length,
          elapsedWallMs: performance.now() - wall0,
        });
        const report = await runSimulationLab(host, piece, undefined, this.simLab.control);
        merged.push(...report.matches);
        if (this.simLab.control.stopNow || this.simLab.control.stopAfterCurrent) break;
      }
      this.simLab.setRunning(false);
      const done = merged.filter((m) => m.result !== "FAILED");
      const goals = done.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
      this.simLab.setReport({
        simulationRunId: `stress_${Date.now().toString(36)}`,
        timestamp: new Date().toISOString(),
        gameVersion: "argyle-football",
        attributeModelVersion: "V1",
        teamDatabaseVersion: "classic-teams-2.0",
        classicTeamsIncluded: false,
        includeCurrentTeams: false,
        seed: "AUTO",
        simulationMode: "FIXED",
        telemetryEnabled: false,
        headlessStatus: "ACCELERATED_RENDERED",
        matchesRequested: merged.length,
        matchesCompleted: done.length,
        matchesFailed: merged.length - done.length,
        matches: merged,
        aggregates: {
          goalsPerMatch: done.length ? goals / done.length : 0,
          homeWinPct: done.length ? (100 * done.filter((m) => m.result === "HOME").length) / done.length : 0,
          drawPct: done.length ? (100 * done.filter((m) => m.result === "DRAW").length) / done.length : 0,
          awayWinPct: done.length ? (100 * done.filter((m) => m.result === "AWAY").length) / done.length : 0,
          meanPassCompletion: 0,
          meanShots: 0,
          meanTurnovers: 0,
          meanStuckRecoveries: 0,
          meanWallMsPerMatch: done.length ? done.reduce((s, m) => s + m.wallClockMs, 0) / done.length : 0,
          currentVsCurrent: 0,
          classicVsClassic: done.filter((m) => m.homeTeamClassic && m.awayTeamClassic).length,
          classicVsCurrent: 0,
        },
        teams: [],
      });
      this.clearWorld();
      return;
    }
  }

  private async executeSimLabRun(opts: SimulationLabOptions): Promise<void> {
    this.simLab.setRunning(true);
    this.clearWorld();
    try {
      const report = await runSimulationLab(
        { scene: this.scene, camera: this.camera, db: this.db, events: this.events },
        opts,
        (p) => this.simLab.setProgress(p),
        this.simLab.control,
      );
      this.simLab.setReport(report);
    } catch (err) {
      const el = this.simLab.root.querySelector("#lab-results");
      if (el) el.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      this.simLab.setRunning(false);
      this.clearWorld();
    }
  }

  private openSettings(): void {
    this.menu.hide();
    this.pause.hide();
    this.appState = this.match ? AppState.PAUSED : AppState.SETTINGS;
    if (this.match) this.match.enterPause();
    this.settings.render(this.save.data.settings, this.db.advertising);
    if (!this.match) this.appState = AppState.SETTINGS;
  }

  private attachHud(): void {
    this.hud?.dispose();
    this.hud = new MatchHUD(this.ui);
    this.hud.setBindings(this.save.data.settings.keyBindings);
  }

  private openMatchSetup(kind: "next" | "quick"): void {
    this.menu.hide();
    this.appState = AppState.MATCH_SETUP;
    const f = this.listedFixture();
    this.pendingFixture = { ...f };
    const saved = this.save.data.settings;
    this.setup.render(this.db, {
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      venueId: f.venueId,
      gameplayMode: saved.gameplayMode === "ARCADE" ? "ARCADE" : "REAL",
      timeOfDay: saved.timeOfDay,
      weather: clampWeatherForTime(
        saved.timeOfDay,
        kind === "quick" ? saved.weather : (f.weather ?? "MILD"),
      ),
      durationSeconds: clampMatchDuration(saved.matchDuration),
    });
  }

  private confirmMatchSetup(): void {
    const values = this.setup.read();
    // Fixture-specific overrides only — do not rewrite Options → Match Settings defaults.
    this.pendingFixture = this.setup.toFixture(this.pendingFixture ?? this.listedFixture(), values, this.db);
    this.setup.hide();
    this.openCharacterSelect(this.userSideFor(this.pendingFixture) === "away" ? values.awayTeamId : values.homeTeamId);
  }

  private applyUrlParams(): void {
    const q = new URLSearchParams(location.search);
    if (q.get("debug") === "1") this.save.data.settings.debug = true;
    const mode = q.get("mode");
    if (mode === "ARCADE" || mode === "REAL" || mode === "LEAGUE" || mode === "TABLE") this.setMenuPlayMode(mode);
    const time = q.get("time") as TimeOfDay | null;
    if (time === "DAY" || time === "EVENING" || time === "NIGHT") this.save.data.settings.timeOfDay = time;
    const weather = q.get("weather") as Weather | null;
    if (weather === "SUNNY" || weather === "MILD" || weather === "RAINY" || weather === "SNOWY") this.save.data.settings.weather = weather;
    this.save.data.settings.weather = clampWeatherForTime(this.save.data.settings.timeOfDay, this.save.data.settings.weather);
    if (q.get("autoplay") === "1") this.startAttract();
  }

  private persistSquadPlayerEdit(edit: SquadPlayerEdit): void {
    const player = this.db.players.get(edit.playerId);
    if (!player) return;
    player.name = edit.name;
    player.displayName = edit.displayName;
    player.primaryPosition = edit.primaryPosition;
    if (!player.appearance) player.appearance = {};
    player.appearance.portraitAsset = edit.portraitAsset;
    if (edit.heightCm == null) delete player.heightCm;
    else player.heightCm = edit.heightCm;
    if (edit.weightKg == null) delete player.weightKg;
    else player.weightKg = edit.weightKg;
    Object.assign(
      player.appearance,
      applyPhysicalToAppearance(player.appearance, edit.heightCm, edit.weightKg),
    );
    for (const [key, value] of Object.entries(edit.stats)) {
      if (value == null) delete (player as unknown as Record<string, unknown>)[key];
      else (player as unknown as Record<string, number>)[key] = value;
    }
    const teamId = edit.teamId || this.charTeamId;
    for (const m of this.db.memberships) {
      if (m.playerId === edit.playerId && (!teamId || m.teamId === teamId)) {
        m.shirtNumber = edit.shirtNumber;
      }
    }
    this.save.data.players = [...this.db.players.values()];
    this.save.data.memberships = this.db.memberships;
    this.save.save();
    this.audio.ui();
  }

  private formationSideConfig(
    teamId: string,
    lineupId: string | undefined,
    pauseSubsRemaining?: number | null,
  ): FormationSideConfig {
    const team = this.db.getTeam(teamId);
    const lineup = this.db.getLineup(lineupId, teamId);
    return {
      teamName: team.name,
      starters: this.db.getStartingSquad(lineup),
      teamColor: team.primaryColor,
      formation: lineup.formation,
      roster: this.db.getSquad(teamId),
      starterSlots: lineup.starters.map((s) => s.slot),
      secondaryColor: team.secondaryColor,
      team,
      playStyle: lineup.playStyle ?? null,
      slotOffsets: lineup.starters
        .filter((s) => s.offsetX || s.offsetZ)
        .map((s) => ({ slot: s.slot, dx: s.offsetX ?? 0, dz: s.offsetZ ?? 0 })),
      pauseSubsRemaining: pauseSubsRemaining ?? null,
    };
  }

  private openCharacterSelect(teamId: string): void {
    this.menu.hide();
    this.chars.showOverlays = this.save.data.settings.formationOverlays === true;
    this.charTeamId = teamId;
    const team = this.db.getTeam(teamId);
    const f = this.pendingFixture;
    const lineupId = f && f.awayTeamId === teamId ? f.awayLineupId : f?.homeLineupId;
    const opponentId = f ? (f.homeTeamId === teamId ? f.awayTeamId : f.homeTeamId) : null;
    const opponent = opponentId ? this.db.getTeam(opponentId) : null;
    const userIsAwaySide = !!f && f.awayTeamId === teamId;
    const purpose = this.practice === "spot" ? "spot" : "match";
    this.chars.setContext("select");
    if (f && purpose === "match") {
      const active: FormationSide = userIsAwaySide ? "away" : "home";
      this.chars.setDualFormationSides(
        {
          home: this.formationSideConfig(f.homeTeamId, f.homeLineupId),
          away: this.formationSideConfig(f.awayTeamId, f.awayLineupId),
        },
        active,
        {
          purpose,
          opponentHomeKit: opponent?.defaultKit ?? null,
          userIsAwaySide,
          kitChoice: "auto",
          userMatchTeam: team,
        },
      );
    } else {
      const lineup = this.db.getLineup(lineupId, teamId);
      this.chars.setSquad(team.name, this.db.getStartingSquad(lineup), team.primaryColor, {
        formation: lineup.formation,
        roster: this.db.getSquad(teamId),
        starterSlots: lineup.starters.map((s) => s.slot),
        secondaryColor: team.secondaryColor,
        purpose,
        team,
        opponentHomeKit: opponent?.defaultKit ?? null,
        userIsAwaySide,
        kitChoice: "auto",
        playStyle: lineup.playStyle ?? null,
        formationSide: userIsAwaySide ? "away" : "home",
      });
    }
    this.chars.render();
    this.appState = AppState.CHARACTER_SELECT;
    this.refreshCharacterPreview();
  }

  private refreshCharacterPreview(): void {
    if (this.chars.controlMode === "TEAM") {
      if (this.preview) {
        this.scene.remove(this.preview);
        this.preview = null;
      }
      this.kitPreview.dispose();
      return;
    }
    if (this.chars.controlMode === "KIT") {
      if (this.preview) {
        this.scene.remove(this.preview);
        this.preview = null;
      }
      this.refreshKitPanelPreview();
      return;
    }
    this.kitPreview.dispose();
    this.spawnPreview();
  }

  private refreshKitPanelPreview(): void {
    const host = this.chars.root.querySelector<HTMLElement>(".kit-preview-host");
    if (!host) {
      this.kitPreview.dispose();
      return;
    }
    this.kitPreview.mount(host);
    const team = this.db.getTeam(this.charTeamId);
    const side = this.pendingFixture ? this.userSideFor(this.pendingFixture) : "home";
    // Prefer an outfielder so HOME/AWAY shirt wraps are visible (not GK kit).
    const sp =
      this.chars.players.find((p) => p.player.primaryPosition !== "GK") ?? this.chars.current();
    const kit = this.chars.selectedMatchKit() ?? team.defaultKit;
    this.kitPreview.showPlayer(sp, kit, side);
  }

  private writeLineupEdit(
    teamId: string,
    lineupId: string | undefined,
    edit: ReturnType<CharacterSelect["getEditedLineup"]>,
  ): void {
    if (!edit.starters.length) return;
    const lineup = this.db.getLineup(lineupId, teamId);
    lineup.formation = edit.formation;
    lineup.starters = edit.starters.map((s) => ({
      playerId: s.playerId,
      slot: s.slot,
      ...(s.offsetX || s.offsetZ ? { offsetX: s.offsetX, offsetZ: s.offsetZ } : {}),
    }));
    if (edit.playStyle === "auto") delete lineup.playStyle;
    else lineup.playStyle = edit.playStyle;
  }

  private applyCharacterLineupEdits(): void {
    const f = this.pendingFixture;
    const edits = this.chars.getEditedLineups();
    if (f && (edits.home || edits.away)) {
      if (edits.home) this.writeLineupEdit(f.homeTeamId, f.homeLineupId, edits.home);
      if (edits.away) this.writeLineupEdit(f.awayTeamId, f.awayLineupId, edits.away);
      return;
    }
    const edit = this.chars.getEditedLineup();
    const teamId = this.charTeamId;
    const lineupId = f && f.awayTeamId === teamId ? f.awayLineupId : f?.homeLineupId;
    this.writeLineupEdit(teamId, lineupId, edit);
  }

  private spawnPreview(): void {
    if (this.preview) this.scene.remove(this.preview);
    const sp = this.chars.current();
    const team = this.db.getTeam(this.charTeamId);
    const side = this.pendingFixture ? this.userSideFor(this.pendingFixture) : "home";
    const p = new Player({
      id: sp.player.id,
      name: sp.player.name,
      displayName: sp.player.displayName,
      shirtNumber: sp.shirtNumber,
      position: sp.player.primaryPosition,
      slot: sp.player.primaryPosition,
      side,
      attrs: sp.attrs,
      overall: sp.overall,
      appearance: sp.player.appearance,
    });
    const previewKit = p.isGK ? team.goalkeeperKit : this.chars.selectedMatchKit() ?? team.defaultKit;
    const vis = createPlayerVisual(p, previewKit, p.isGK);
    vis.group.position.set(0, 0, 8);
    this.preview = vis.group;
    this.scene.add(vis.group);
    this.camera.camera.position.set(2.4, 1.8, 12.5);
    this.camera.camera.lookAt(0, 1.2, 8);
  }

  private beginPreMatch(options: { autoplay?: boolean } = {}): void {
    const autoplay = !!options.autoplay;
    // Arm stadium audio inside this click/gesture so kick-off isn't blocked by autoplay policy.
    this.audio.prepareStadiumAmbience();
    this.applyCharacterLineupEdits();
    this.preferredPlayerId = this.chars.current().player.id;
    // Spot practice always starts as the selected taker, not full team control.
    this.teamControl =
      autoplay || this.practice === "spot" || this.chars.purpose === "spot"
        ? false
        : this.chars.controlMode === "TEAM" || this.chars.controlMode === "KIT";
    this.fixtureSim = autoplay;
    this.watchSim = autoplay;
    this.chars.hide();
    this.ui.querySelectorAll(".attract-banner").forEach((el) => el.remove());
    this.input.lastInputAt = performance.now();
    this.clearWorld();
    this.appState = AppState.PRE_MATCH;
    this.preMatchT = 0;
    const fixture = this.pendingFixture ?? this.listedFixture();
    const saved = this.save.data.settings;
    const userSide = this.userSideFor(fixture);
    const userKitChoice = this.practice === "spot" ? "auto" : this.chars.kitChoice;
    this.match = new Match(
      this.scene,
      this.camera,
      this.db,
      {
        fixture: {
          ...fixture,
          durationSeconds: clampMatchDuration(fixture.durationSeconds || saved.matchDuration),
          time: DEFAULT_KICK_OFF_TIME,
        },
        preferredPlayerId: this.preferredPlayerId,
        userSide,
        autoplay,
        invertShotY: saved.invertShotY,
        gameplayMode: saved.gameplayMode === "TABLE" ? "REAL" : saved.gameplayMode,
        timeOfDay: saved.timeOfDay,
        weather: saved.weather,
        graphicsPreset: saved.graphicsPreset,
        teamControl: this.teamControl,
        homeHudRing: saved.homeHudRing,
        awayHudRing: saved.awayHudRing,
        homeShowPortraits: saved.homeShowPortraits,
        awayShowPortraits: saved.awayShowPortraits,
        homePortraitOpacity: saved.homePortraitOpacity,
        awayPortraitOpacity: saved.awayPortraitOpacity,
        homePortraitScale: saved.homePortraitScale,
        awayPortraitScale: saved.awayPortraitScale,
        homePortraitUpright: saved.homePortraitUpright,
        awayPortraitUpright: saved.awayPortraitUpright,
        homeHidePlayers: saved.homeHidePlayers,
        awayHidePlayers: saved.awayHidePlayers,
        ballGoldRing: saved.ballGoldRing,
        showPassTargetHighlight: saved.showPassTargetHighlight,
        homeKitChoice: userSide === "home" ? userKitChoice : "auto",
        awayKitChoice: userSide === "away" ? userKitChoice : "auto",
      },
      this.events,
    );
    this.match.camera.mode = "BROADCAST";
    this.match.camera.setViewMode(this.save.data.settings.viewMode ?? "MEDIUM");
    this.match.camera.trackMode = this.save.data.settings.trackMode ?? "DYNAMIC";
    this.match.camera.setCameraZoom(this.save.data.settings.cameraZoom ?? 1);
    this.match.ball.setVisualScale(this.save.data.settings.ballScale ?? 1);
    this.attachHud();
    this.exposeMatch();
    if (autoplay) {
      this.simBannerLabel = "SIMULATE · ANY CONTROL TO TAKE OVER · ESC PAUSE";
      this.simBannerPlayT = 0;
    }
    if (this.practice === "spot") {
      this.matchCard.hide();
      this.launchMatch();
      return;
    }
    this.matchCard.show(this.match, "kickoff");
    // Whistle fires once on KICKOFF when play actually starts (not here — avoids a double blast).
  }

  private launchMatch(): void {
    if (!this.match) return;
    this.matchCard.hide();
    this.appState = AppState.MATCH;
    this.simBannerPlayT = 0;
    this.syncSimulatorBanner(0);
    this.hud?.show();
    this.hud?.render(this.match, this.match.autoplay);
    void this.audio.startStadiumAmbience();
    if (this.practice === "spot") {
      const spot = defaultSpotKick(this.match.userSide);
      this.match.setupSpotKick(spot.x, spot.z);
      return;
    }
    this.match.startPlay();
  }

  private ensureSimulatorBanner(): HTMLElement {
    let banner = this.ui.querySelector(".attract-banner") as HTMLElement | null;
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "attract-banner";
      banner.hidden = true;
      this.ui.appendChild(banner);
    }
    banner.textContent = this.simBannerLabel;
    return banner;
  }

  private restartSimulatorBanner(): void {
    const banner = this.ui.querySelector(".attract-banner") as HTMLElement | null;
    if (!banner || banner.hidden) return;
    banner.style.animation = "none";
    void banner.offsetWidth;
    banner.style.animation = "";
  }

  /** Show the take-over banner only after a short delay, never under kick-off / HT / FT cards. */
  private syncSimulatorBanner(dt: number): void {
    const autoplay = !!this.match?.autoplay;
    if (!autoplay || this.appState === AppState.PRE_MATCH) {
      const existing = this.ui.querySelector(".attract-banner") as HTMLElement | null;
      if (existing) existing.hidden = true;
      return;
    }
    this.simBannerPlayT += dt;
    const banner = this.ensureSimulatorBanner();
    const state = this.match!.state;
    const ceremonial =
      state === FootballState.HALF_TIME ||
      state === FootballState.FULL_TIME ||
      state === FootballState.GOAL_CELEBRATION;
    const cardUp = !this.matchCard.root.hidden;
    const show =
      this.simBannerPlayT >= SIM_BANNER_DELAY_SECONDS && !ceremonial && !cardUp;
    if (show) {
      if (banner.hidden) {
        banner.hidden = false;
        this.restartSimulatorBanner();
      }
    } else {
      banner.hidden = true;
    }
  }

  private syncMatchCard(): void {
    if (!this.match || this.appState === AppState.PRE_MATCH) return;
    const state = this.match.state;
    if (state === FootballState.GOAL_CELEBRATION) {
      this.matchCard.show(this.match, "goal");
      if (shouldFadeMatchCard(this.match.celebrationTime)) this.matchCard.fadeOut();
      return;
    }
    if (state === FootballState.HALF_TIME) {
      this.matchCard.show(this.match, "half");
      if (shouldFadeMatchCard(this.match.halfTimeLeft)) this.matchCard.fadeOut();
      return;
    }
    if (state === FootballState.FULL_TIME) {
      this.matchCard.show(this.match, "full");
      return;
    }
    this.matchCard.hide();
  }

  private clearMatch(): void {
    this.unitLines.dispose(this.scene);
    this.match?.dispose();
    this.match = null;
    this.tableMatch?.dispose();
    this.tableMatch = null;
    this.tableSetup.hide();
    this.hud?.dispose();
    this.hud = null;
    this.clearWorld();
  }

  private unitLineSettings(): UnitLineSettings {
    const s = this.save.data.settings;
    return {
      home: {
        showDef: s.homeShowDefLine,
        showMid: s.homeShowMidLine,
        showAtt: s.homeShowAttLine,
        defColor: s.homeDefLineColor,
        midColor: s.homeMidLineColor,
        attColor: s.homeAttLineColor,
      },
      away: {
        showDef: s.awayShowDefLine,
        showMid: s.awayShowMidLine,
        showAtt: s.awayShowAttLine,
        defColor: s.awayDefLineColor,
        midColor: s.awayMidLineColor,
        attColor: s.awayAttLineColor,
      },
    };
  }

  private toggleMatchPortraits(side: "home" | "away"): void {
    const s = this.save.data.settings;
    if (side === "home") {
      s.homeShowPortraits = !s.homeShowPortraits;
      if (this.match) this.match.homeShowPortraits = s.homeShowPortraits;
    } else {
      s.awayShowPortraits = !s.awayShowPortraits;
      if (this.match) this.match.awayShowPortraits = s.awayShowPortraits;
    }
    this.save.save();
  }

  private toggleMatchPlayers(side: "home" | "away"): void {
    const s = this.save.data.settings;
    if (side === "home") {
      s.homeHidePlayers = !s.homeHidePlayers;
      if (this.match) this.match.homeHidePlayers = s.homeHidePlayers;
    } else {
      s.awayHidePlayers = !s.awayHidePlayers;
      if (this.match) this.match.awayHidePlayers = s.awayHidePlayers;
    }
    this.save.save();
  }

  private quitMatch(): void {
    this.pause.hide();
    this.goMenu();
  }

  private dismissOverlay(): boolean {
    if (this.pauseFormationOpen) {
      this.closePauseFormation(false);
      return true;
    }
    if (this.appState === AppState.MAIN_MENU && this.menu.panel !== "menu") {
      this.settings.hide();
      this.menu.setPanel("menu", true);
      this.paintMainMenu();
      return true;
    }
    if (this.settings.isOpen) {
      this.settings.hide();
      if (this.match) {
        this.appState = AppState.PAUSED;
        this.match.enterPause();
        this.renderPause();
      } else {
        this.goMenu();
      }
      return true;
    }
    if (this.simLab.isOpen) {
      this.simLab.hide();
      this.goMenu();
      return true;
    }
    if (
      this.appState === AppState.MATCH_SETUP ||
      this.appState === AppState.CHARACTER_SELECT ||
      this.appState === AppState.TEAM_EDITOR ||
      this.appState === AppState.PLAYER_DATABASE ||
      this.appState === AppState.FIXTURE_EDITOR ||
      this.appState === AppState.LEAGUE ||
      this.appState === AppState.SETTINGS
    ) {
      this.goMenu();
      return true;
    }
    return false;
  }

  private renderPause(): void {
    this.pause.audioEnabled = this.save.data.settings.audioEnabled !== false;
    this.hud?.hide();
    this.tableMatch?.hud.hide();
    this.pause.render(this.match);
  }

  private handlePauseAction(action: string, _btn?: HTMLElement): void {
    if (action === "resume") this.resumeMatch();
    else if (action === "quit") this.quitMatch();
    else if (action === "audio") this.togglePauseAudio();
    else if (action === "settings") this.openSettings();
    else if (action === "formation") {
      if (this.tableMatch) return;
      this.openPauseFormation();
    } else if (action === "back") {
      this.pause.back();
      this.renderPause();
    }
  }

  private pauseFormationSideConfig(side: "home" | "away"): FormationSideConfig {
    const match = this.match!;
    const team = side === "home" ? match.home : match.away;
    const byId = new Map(team.roster.map((s) => [s.player.id, s]));
    const starters = team.players
      .map((p) => byId.get(p.id))
      .filter((s): s is NonNullable<typeof s> => !!s);
    if (starters.length < team.players.length) {
      for (const p of team.players) {
        if (byId.has(p.id)) continue;
        const synth = team.roster.find((s) => s.player.id === p.id);
        if (synth) starters.push(synth);
      }
    }
    return {
      teamName: team.record.name,
      starters,
      teamColor: team.record.primaryColor,
      formation: team.lineup.formation,
      roster: team.roster,
      starterSlots: team.players.map((p) => p.slot),
      secondaryColor: team.record.secondaryColor,
      team: team.record,
      playStyle: team.lineup.playStyle ?? null,
      slotOffsets: team.lineup.starters
        .filter((row) => row.offsetX || row.offsetZ)
        .map((row) => ({ slot: row.slot, dx: row.offsetX ?? 0, dz: row.offsetZ ?? 0 })),
      pauseSubsRemaining: match.subsRemaining(side),
    };
  }

  private openPauseFormation(): void {
    if (!this.match) return;
    const team = this.match.userTeam();
    this.chars.showOverlays = this.save.data.settings.formationOverlays === true;
    this.charTeamId = team.record.id;
    const active: FormationSide = team.side;
    this.chars.setContext("pause", { subsRemaining: this.match.subsRemaining(team.side) });
    this.chars.setDualFormationSides(
      {
        home: this.pauseFormationSideConfig("home"),
        away: this.pauseFormationSideConfig("away"),
      },
      active,
      {
        purpose: "match",
        userMatchTeam: team.record,
        userIsAwaySide: team.side === "away",
      },
    );
    this.chars.setControlMode("TEAM");
    this.pause.hide();
    this.hud?.hide();
    this.chars.render();
    this.pauseFormationOpen = true;
  }

  private closePauseFormation(apply: boolean): void {
    if (!this.pauseFormationOpen) return;
    if (apply && this.match) {
      const edits = this.chars.getEditedLineups();
      if (edits.home) this.match.applyTacticalEdit(edits.home, "home");
      if (edits.away) this.match.applyTacticalEdit(edits.away, "away");
    }
    this.chars.setContext("select");
    this.chars.hide();
    this.pauseFormationOpen = false;
    this.renderPause();
  }

  private togglePauseAudio(): void {
    const next = !(this.save.data.settings.audioEnabled !== false);
    this.save.data.settings.audioEnabled = next;
    this.save.save();
    this.audio.setEnabled(next);
    this.renderPause();
  }

  private resumeMatch(): void {
    if (this.pauseFormationOpen) {
      this.chars.setContext("select");
      this.chars.hide();
      this.pauseFormationOpen = false;
    }
    this.pause.reset();
    this.pause.hide();
    this.settings.hide();
    this.hud?.show();
    this.appState = AppState.MATCH;
    if (this.match) this.match.leavePause();
    if (this.tableMatch) {
      this.tableMatch.paused = false;
      this.tableMatch.hud.show();
    }
    void this.audio.resumeStadiumAmbience();
  }

  private update = (dt: number): void => {
    const intent = this.input.update(dt);
    this.menuNav = Math.max(0, this.menuNav - dt);
    this.fpsT += dt;
    this.frames += 1;
    if (this.fpsT >= 0.5) {
      this.fps = this.frames / this.fpsT;
      this.frames = 0;
      this.fpsT = 0;
    }

    if (this.escapeClosedOverlay) {
      this.escapeClosedOverlay = false;
      intent.pause = false;
    }
    if (intent.pause && this.dismissOverlay()) return;

    if (this.appState === AppState.MAIN_MENU) {
      this.menuStadium?.update(dt);
      this.camera.preMatch(performance.now() / 1000);
      const listed = this.listedFixture();
      this.menu.setKickOffCountdown(kickOffRemainingSeconds(listed.date, listed.time || DEFAULT_KICK_OFF_TIME));
      if (this.menu.panel !== "menu") {
        // Sub-panels (league / options / etc.) pause the simulator idle clock.
        this.input.lastInputAt = performance.now();
        this.menu.setCountdown(AUTOPLAY_IDLE_SECONDS);
        this.menu.attract = false;
      } else {
        this.handleMenuNav(intent.moveZ, () => {
          this.menu.move(intent.moveZ < 0 ? -1 : 1);
        });
        if (intent.pass || intent.skip) this.menuAction(this.menu.currentId());
        const left = Math.max(0, AUTOPLAY_IDLE_SECONDS - this.input.idleSeconds());
        this.menu.setCountdown(left);
        this.menu.attract = left < 8;
        if (left <= 0) this.menuAction("sim");
      }
    }

    if (this.appState === AppState.MATCH_SETUP) {
      // Don't accrue idle toward auto-sim while configuring a fixture.
      this.input.lastInputAt = performance.now();
      if (this.tableSetup.isOpen) {
        if (intent.pause) {
          this.tableSetup.hide();
          this.goMenu();
        }
      } else {
        if (intent.pause) this.goMenu();
        if (intent.pass || intent.skip) this.confirmMatchSetup();
      }
    }

    if (this.appState === AppState.CHARACTER_SELECT) {
      // Formation / Play Next Fixture: freeze idle so Back can't instantly auto-sim.
      this.input.lastInputAt = performance.now();
      this.handleMenuNav(intent.moveX + intent.moveZ, () => {
        this.chars.move(intent.moveX + intent.moveZ > 0 ? 1 : -1);
        this.chars.render();
        this.refreshCharacterPreview();
      });
      if (intent.pass || intent.skip) this.beginPreMatch();
      if (intent.pause) this.goMenu();
      if (this.chars.controlMode === "KIT") this.kitPreview.tick(dt);
      else if (this.preview) this.preview.rotation.y += dt * 0.6;
    }

    if (this.appState === AppState.PRE_MATCH && this.match) {
      this.preMatchT += dt;
      this.camera.preMatch(this.preMatchT);
      this.match.stadium.update(dt, this.camera.camera.position);
      this.unitLines.update(this.scene, this.match, this.unitLineSettings());
      if (this.practice === "spot") {
        this.launchMatch();
        return;
      }
      if (this.preMatchT > PRE_MATCH_CARD_SECONDS || intent.skip || intent.anyGameplay) this.launchMatch();
    }

    if (this.appState === AppState.MATCH && this.tableMatch) {
      const { pauseRequested } = this.tableMatch.update(dt);
      if (pauseRequested || intent.pause) {
        this.appState = AppState.PAUSED;
        this.tableMatch.paused = true;
        this.pause.reset();
        this.renderPause();
        return;
      }
      return;
    }

    if (this.appState === AppState.MATCH && this.match) {
      if (intent.pause) {
        this.appState = AppState.PAUSED;
        this.match.enterPause();
        this.audio.pauseStadiumAmbience();
        this.pause.reset();
        this.renderPause();
        return;
      }
      if (intent.anyGameplay && this.match.autoplay) {
        this.match.autoplay = false;
        if (this.watchSim) this.watchSim = false;
        if (this.match.state === FootballState.AUTOPLAY) this.match.state = FootballState.PLAYING;
        void this.audio.retryStadiumIfNeeded();
      } else if (!this.match.autoplay && this.input.idleSeconds() > AUTOPLAY_IDLE_SECONDS) {
        this.match.autoplay = true;
      }
      if (intent.anyGameplay) void this.audio.retryStadiumIfNeeded();
      this.match.update(dt, intent);
      this.match.showPassDebug = this.save.data.settings.debug;
      decisionTelemetry.configure({
        enabled: !!(this.save.data.settings.debug && this.save.data.settings.aiAnalysisTelemetry),
        matchId: "live-match",
      });
      if (intent.cycleView || intent.cycleTrack) {
        this.save.data.settings.viewMode = this.match.camera.viewMode;
        this.save.data.settings.trackMode = this.match.camera.trackMode;
        this.save.save();
      }
      if (intent.zoomIn || intent.zoomOut) {
        this.save.data.settings.cameraZoom = this.match.camera.getCameraZoom();
      }
      if (intent.toggleHomePortraits) this.toggleMatchPortraits("home");
      if (intent.toggleAwayPortraits) this.toggleMatchPortraits("away");
      if (intent.toggleHomePlayers) this.toggleMatchPlayers("home");
      if (intent.toggleAwayPlayers) this.toggleMatchPlayers("away");
      this.hud?.render(this.match, this.match.autoplay);
      this.syncMatchCard();
      this.syncSimulatorBanner(dt);
      this.debug.enabled = this.save.data.settings.debug;
      this.debug.render(this.match, this.fps);
      this.formDebug.update(this.scene, this.match, this.save.data.settings.formationDebug);
      this.unitLines.update(this.scene, this.match, this.unitLineSettings());
      if (this.match.autoplay && this.match.state === FootballState.FULL_TIME) {
        if (this.fixtureSim) {
          this.attractHold = 0;
        } else {
          this.attractHold += dt;
          if (this.attractHold >= AUTOPLAY_NEXT_MATCH_HOLD) this.returnToMenuAfterSimulator();
        }
      } else if (this.match.state !== FootballState.FULL_TIME) {
        this.attractHold = 0;
      }
    }

    if (this.appState === AppState.PAUSED) {
      if (this.pauseFormationOpen) {
        if (intent.pause) this.closePauseFormation(false);
      } else {
        this.handleMenuNav(intent.moveZ, () => {
          this.pause.move(intent.moveZ < 0 ? -1 : 1);
          this.renderPause();
        });
        if (intent.pass || intent.skip) {
          const item = this.pause.current();
          this.handlePauseAction(item.action);
        }
        if (intent.pause) {
          if (this.pause.back()) this.renderPause();
          else this.resumeMatch();
        }
      }
    }

    if (this.appState === AppState.ATTRACT && this.match) {
      if (intent.anyGameplay || this.input.keyboard.hasAnyKey) {
        this.goMenu();
        return;
      }
      this.match.autoplay = true;
      this.match.update(dt, intent);
      this.hud?.render(this.match, true);
      this.syncMatchCard();
      this.syncSimulatorBanner(dt);
      this.debug.enabled = this.save.data.settings.debug;
      this.debug.render(this.match, this.fps);
      this.formDebug.update(this.scene, this.match, this.save.data.settings.formationDebug);
      this.unitLines.update(this.scene, this.match, this.unitLineSettings());
      if (this.match.state === FootballState.FULL_TIME) {
        this.attractHold += dt;
        if (this.attractHold >= AUTOPLAY_NEXT_MATCH_HOLD) this.returnToMenuAfterSimulator();
      } else {
        this.attractHold = 0;
      }
    }
  };

  private startAttract(): void {
    this.startSimulator();
  }

  private startSimulator(): void {
    this.practice = "none";
    // Arm bed in this call stack when Simulator was clicked; idle auto-start falls back to muted.
    this.audio.prepareStadiumAmbience();
    this.menu.hide();
    this.clearWorld();
    this.attractHold = 0;
    this.simBannerPlayT = 0;
    this.simBannerLabel = "SIMULATOR · ANY CONTROL TO TAKE OVER · ESC PAUSE";
    this.preMatchT = 0;
    this.appState = AppState.PRE_MATCH;
    this.spawnAutoplayMatch();
    if (this.match) this.matchCard.show(this.match, "kickoff");
  }

  /** After FT, return to the main menu so the 60s idle countdown can start another sim. */
  private returnToMenuAfterSimulator(): void {
    this.attractHold = 0;
    this.simBannerPlayT = 0;
    this.goMenu();
  }

  private spawnAutoplayMatch(): void {
    const saved = this.save.data.settings;
    const fixture = this.db.randomSimulatorFixture(clampMatchDuration(saved.matchDuration));
    fixture.time = DEFAULT_KICK_OFF_TIME;
    this.match = new Match(
      this.scene,
      this.camera,
      this.db,
      {
        fixture,
        userSide: "home",
        autoplay: true,
        gameplayMode: saved.gameplayMode === "TABLE" ? "REAL" : saved.gameplayMode,
        timeOfDay: saved.timeOfDay ?? fixture.timeOfDay,
        weather: saved.weather ?? fixture.weather,
        graphicsPreset: saved.graphicsPreset,
        homeHudRing: saved.homeHudRing,
        awayHudRing: saved.awayHudRing,
        homeShowPortraits: saved.homeShowPortraits,
        awayShowPortraits: saved.awayShowPortraits,
        homePortraitOpacity: saved.homePortraitOpacity,
        awayPortraitOpacity: saved.awayPortraitOpacity,
        homePortraitScale: saved.homePortraitScale,
        awayPortraitScale: saved.awayPortraitScale,
        homePortraitUpright: saved.homePortraitUpright,
        awayPortraitUpright: saved.awayPortraitUpright,
        homeHidePlayers: saved.homeHidePlayers,
        awayHidePlayers: saved.awayHidePlayers,
        ballGoldRing: saved.ballGoldRing,
        showPassTargetHighlight: saved.showPassTargetHighlight,
      },
      this.events,
    );
    this.match.camera.setViewMode(this.save.data.settings.viewMode ?? "MEDIUM");
    this.match.camera.trackMode = this.save.data.settings.trackMode ?? "DYNAMIC";
    this.match.camera.setCameraZoom(this.save.data.settings.cameraZoom ?? 1);
    this.match.ball.setVisualScale(this.save.data.settings.ballScale ?? 1);
    this.attachHud();
    this.exposeMatch();
  }

  private exposeMatch(): void {
    (window as unknown as { argyleMatch: Match | null }).argyleMatch = this.match;
  }

  private onPitchPointer = (e: PointerEvent): void => {
    if (this.appState !== AppState.MATCH || this.practice !== "spot" || !this.match) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera.camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
    if (Math.abs(hit.x) > HALF_LENGTH + 2 || Math.abs(hit.z) > HALF_WIDTH + 2) return;
    this.match.setupSpotKick(hit.x, hit.z);
  };

  private handleMenuNav(axis: number, fn: () => void): void {
    if (Math.abs(axis) > 0.5 && this.menuNav <= 0) {
      fn();
      this.menuNav = 0.22;
      this.audio.ui();
    }
  }

  private ai = (dt: number): void => {
    void dt;
  };

  private render = (alpha: number): void => {
    if (this.match && (this.appState === AppState.MATCH || this.appState === AppState.ATTRACT || this.appState === AppState.PRE_MATCH)) {
      if (this.appState !== AppState.PRE_MATCH) this.match.poseFrame(alpha);
    }
    const exposure = this.match?.env.exposure ?? this.menuEnvironment().exposure;
    if (exposure !== this.lastExposure) {
      this.lastExposure = exposure;
      this.renderer.toneMappingExposure = exposure;
    }
    const cam = this.tableMatch ? this.tableMatch.camera.camera : this.camera.camera;
    this.renderer.render(this.scene, cam);
  };

  private resize = (): void => {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.setAspect(innerWidth / innerHeight);
    this.tableMatch?.setAspect(innerWidth / innerHeight);
  };
}
