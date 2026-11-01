import type { SavedSettings } from "../core/SaveManager";
import type { AdvertisingBoardRecord } from "../data/schema";
import { clampMatchDuration } from "../football/constants";
import { applyClubNameAppearance, applyTitleFont, DEFAULT_CLUB_NAME_FONT, DEFAULT_CLUB_NAME_GLOW, DEFAULT_CLUB_NAME_GLOW_DIFFUSION, DEFAULT_CLUB_NAME_INVERT_COLORS, TITLE_FONTS, clampClubNameGlowDiffusion } from "./TitleFonts";
import {
  BIND_LABELS,
  codeLabel,
  DEFAULT_KEY_BINDINGS,
  mergeKeyBindings,
  type BindAction,
  type KeyBindings,
} from "../football/controls/KeyBindings";

const BIND_ORDER: BindAction[] = [
  "up",
  "down",
  "left",
  "right",
  "pass",
  "shoot",
  "through",
  "cross",
  "tackle",
  "switch",
  "sprint",
  "boost",
  "jockey",
  "secondaryPress",
  "view",
  "track",
  "homePortraits",
  "awayPortraits",
  "homePlayers",
  "awayPlayers",
  "pause",
];

type OptionsSection = "match" | "gameplay" | "controls" | "audio" | "display" | "advanced";

export type { OptionsSection };

/** Short tab labels + menu-item titles/hints for the Options hub. */
export const OPTIONS_SECTIONS: { id: OptionsSection; label: string; title: string; hint: string }[] = [
  { id: "match", label: "Match", title: "Match Settings", hint: "Length, weather and time of day defaults" },
  { id: "gameplay", label: "Gameplay", title: "Gameplay", hint: "FOOTBALL / SOCCER mode and aim" },
  { id: "controls", label: "Controls", title: "Controls", hint: "Keyboard bindings" },
  { id: "audio", label: "Audio", title: "Audio", hint: "Master volume and mute" },
  { id: "display", label: "Display", title: "Display", hint: "Graphics, camera, HUD and boards" },
  { id: "advanced", label: "Advanced", title: "Advanced", hint: "Simulation Lab and diagnostics" },
];

export class SettingsMenu {
  readonly root: HTMLElement;
  bindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  private listening: BindAction | null = null;
  private ads: AdvertisingBoardRecord[] = [];
  /** Player-facing Options section (tabs). */
  section: OptionsSection = "match";
  private base: SavedSettings | null = null;
  /** Where the active Options UI is painted (overlay card or menu embed host). */
  private contentRoot: HTMLElement;
  private embedded = false;
  /** Fired when the active Options tab changes (embed or overlay). */
  onSectionChange: ((section: OptionsSection) => void) | null = null;

  get isListening(): boolean {
    return this.listening !== null;
  }

  get isOpen(): boolean {
    return this.embedded || !this.root.hidden;
  }

  get isEmbedded(): boolean {
    return this.embedded;
  }

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "editor-screen";
    parent.appendChild(this.root);
    this.contentRoot = this.root;
    this.hide();
    this.root.addEventListener("click", (e) => this.handleOptionsClick(e));
  }

  private handleOptionsClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const tab = target.closest("[data-options-tab]") as HTMLElement | null;
    if (tab && this.contentRoot.contains(tab)) {
      e.preventDefault();
      e.stopPropagation();
      const next = tab.getAttribute("data-options-tab") as OptionsSection | null;
        if (next && OPTIONS_SECTIONS.some((s) => s.id === next)) {
          this.captureAdsFromDom();
          this.section = next;
          this.onSectionChange?.(next);
          this.paint(this.snapshotSettings());
        }
      return;
    }
    const btn = target.closest("[data-bind]") as HTMLElement | null;
    if (!btn || !this.contentRoot.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    this.startListen(btn.getAttribute("data-bind") as BindAction);
  }

  render(
    settings: SavedSettings,
    ads: AdvertisingBoardRecord[] = [],
    opts?: { embedHost?: HTMLElement; section?: OptionsSection },
  ): void {
    this.bindings = mergeKeyBindings(settings.keyBindings);
    this.listening = null;
    this.base = { ...settings, keyBindings: { ...mergeKeyBindings(settings.keyBindings) } };
    if (ads.length) this.ads = ads.map((a) => ({ ...a }));
    if (opts?.section && OPTIONS_SECTIONS.some((s) => s.id === opts.section)) {
      this.section = opts.section;
    }
    if (opts?.embedHost) {
      this.embedded = true;
      this.root.hidden = true;
      this.root.innerHTML = "";
      this.contentRoot = opts.embedHost;
      this.contentRoot.onclick = (e) => this.handleOptionsClick(e);
    } else {
      this.embedded = false;
      this.contentRoot = this.root;
      this.root.hidden = false;
    }
    this.paint(settings);
  }

  private paint(settings: SavedSettings): void {
    if (this.embedded) {
      this.contentRoot.innerHTML = `
        <nav class="options-tabs" aria-label="Options sections">
          ${OPTIONS_SECTIONS.map(
            (s) =>
              `<button type="button" class="options-tab ${this.section === s.id ? "on" : ""}" data-options-tab="${s.id}">${s.label}</button>`,
          ).join("")}
        </nav>
        <div class="options-body options-body-embed">
          ${this.sectionHtml(settings)}
        </div>
        <div class="row-btns settings-footer-actions options-embed-actions">
          <button type="button" data-act="save">Save</button>
          <button type="button" class="settings-reset" data-act="reset">Reset all</button>
        </div>
      `;
      this.bindPaintHandlers(settings);
      return;
    }
    this.contentRoot.innerHTML = `
      <div class="editor-card settings-card options-card">
        <div class="settings-header">
          <div>
            <p class="settings-eyebrow">GOLAÇO SOCCER</p>
            <h2>Options</h2>
          </div>
          <button type="button" class="settings-reset" data-act="reset">Reset all options</button>
        </div>

        <nav class="options-tabs" aria-label="Options sections">
          ${OPTIONS_SECTIONS.map(
            (s) =>
              `<button type="button" class="options-tab ${this.section === s.id ? "on" : ""}" data-options-tab="${s.id}">${s.label}</button>`,
          ).join("")}
        </nav>

        <div class="options-body">
          ${this.sectionHtml(settings)}
        </div>

        <div class="row-btns settings-footer-actions">
          <button data-act="save">Save</button>
          <button data-act="back">Back</button>
        </div>
      </div>
    `;
    this.bindPaintHandlers(settings);
  }

  private sectionHtml(settings: SavedSettings): string {
    switch (this.section) {
      case "match":
        return `
        <section class="settings-section">
          <h3>Match Settings</h3>
          <p class="hint">Persistent defaults for new fixtures. Match Setup can override a single game without changing these.</p>
          <label>Match length (seconds, two halves)
            <input id="dur" type="number" min="120" max="2700" step="30" value="${settings.matchDuration}" />
          </label>
          <p class="hint">Default 600 = two 5-minute halves. Max 2700.</p>
          <label>Time of day
            <select id="tod">
              ${(["DAY", "EVENING", "NIGHT"] as const).map((t) => `<option value="${t}" ${settings.timeOfDay === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </label>
          <label>Weather
            <select id="weather">
              ${(["SUNNY", "MILD", "RAINY", "SNOWY"] as const).map((w) => `<option value="${w}" ${settings.weather === w ? "selected" : ""}>${w}</option>`).join("")}
            </select>
          </label>
        </section>`;
      case "gameplay":
        return `
        <section class="settings-section">
          <h3>Gameplay</h3>
          <label>Default gameplay mode
            <select id="gplay">
              <option value="REAL" ${settings.gameplayMode === "REAL" ? "selected" : ""}>FOOTBALL</option>
              <option value="ARCADE" ${settings.gameplayMode === "ARCADE" ? "selected" : ""}>SOCCER</option>
              <option value="TABLE" ${settings.gameplayMode === "TABLE" ? "selected" : ""}>TABLE</option>
              <option value="FLICK" ${settings.gameplayMode === "FLICK" ? "selected" : ""}>FLICK</option>
            </select>
          </label>
          <p class="hint">Also on the main menu. TABLE = foosball, FLICK = Flickball. Play Next opens Formation — settings live where PLAYER SELECT normally is (and below as defaults).</p>
          <label>TABLE layout
            <select id="table-layout">
              <option value="FRENCH_CLASSIC" ${settings.tableLayoutId === "FRENCH_CLASSIC" ? "selected" : ""}>French classic</option>
              <option value="TOURNAMENT_MODERN" ${settings.tableLayoutId === "TOURNAMENT_MODERN" ? "selected" : ""}>Tournament modern</option>
              <option value="OPEN_CUSTOM" ${settings.tableLayoutId === "OPEN_CUSTOM" ? "selected" : ""}>Open custom</option>
            </select>
          </label>
          <label>TABLE opponent
            <select id="table-opp">
              <option value="AI" ${settings.tableOpponent === "AI" ? "selected" : ""}>Computer (AI)</option>
              <option value="HUMAN" ${settings.tableOpponent === "HUMAN" ? "selected" : ""}>Hotseat 2P</option>
            </select>
          </label>
          <label>TABLE AI difficulty
            <select id="table-diff">
              ${(["EASY", "NORMAL", "HARD", "EXPERT"] as const)
                .map((d) => `<option value="${d}" ${settings.tableDifficulty === d ? "selected" : ""}>${d}</option>`)
                .join("")}
            </select>
          </label>
          <label>TABLE first to
            <input id="table-first" type="number" min="1" max="21" value="${settings.tableFirstTo}"/>
          </label>
          <label>FLICK opponent
            <select id="flick-opp">
              <option value="AI" ${settings.flickOpponent === "AI" ? "selected" : ""}>Computer (AI)</option>
              <option value="HUMAN" ${settings.flickOpponent === "HUMAN" ? "selected" : ""}>Hotseat 2P</option>
            </select>
          </label>
          <label>FLICK AI difficulty
            <select id="flick-diff">
              ${(["EASY", "NORMAL", "HARD", "EXPERT"] as const)
                .map((d) => `<option value="${d}" ${settings.flickDifficulty === d ? "selected" : ""}>${d}</option>`)
                .join("")}
            </select>
          </label>
          <label>FLICK first to
            <input id="flick-first" type="number" min="1" max="21" value="${settings.flickFirstTo}"/>
          </label>
          <label class="check"><input id="flick-turns" type="checkbox" ${settings.flickTurnBased !== false ? "checked" : ""}/> FLICK take turns</label>
          <p class="hint">Off = open play: flick anytime the pitch is settled. AI reacts and shoots on its difficulty timer.</p>
          <label class="check"><input id="invertY" type="checkbox" ${settings.invertShotY ? "checked" : ""}/> Invert vertical aim</label>
          <label class="check"><input id="pass-target" type="checkbox" ${settings.showPassTargetHighlight ? "checked" : ""}/> Highlight pass target</label>
          <p class="hint">Shows a ring under the intended receiver while you aim a pass. Off by default.</p>
        </section>`;
      case "controls":
        return `
        <section class="settings-section">
          <h3>Controls</h3>
          <p class="hint">Click a control, then press the new key. Arrow keys always move as well.</p>
          <div class="bind-grid">
            ${BIND_ORDER.map((act) => {
              const listening = this.listening === act;
              return `<button type="button" class="bind-row ${listening ? "listening" : ""}" data-bind="${act}">
                <span>${BIND_LABELS[act]}</span>
                <strong>${listening ? "Press a key…" : codeLabel(this.bindings[act])}</strong>
              </button>`;
            }).join("")}
          </div>
        </section>`;
      case "audio":
        return `
        <section class="settings-section">
          <h3>Audio</h3>
          <label class="check"><input id="audio-on" type="checkbox" ${settings.audioEnabled !== false ? "checked" : ""}/> Enable audio</label>
          <label class="settings-range">Master volume
            <input id="vol" type="range" min="0" max="100" step="1" value="${Math.round((settings.masterVolume ?? 0.7) * 100)}" />
            <span class="settings-range-value" data-vol>${Math.round((settings.masterVolume ?? 0.7) * 100)}%</span>
          </label>
          <p class="hint">Stadium ambience and effects share master volume in the current build.</p>
        </section>`;
      case "display":
        return `
        <section class="settings-section">
          <h3>Display</h3>
          <label>Graphics
            <select id="gfx">
              ${["LOW", "MEDIUM", "HIGH", "VERY_HIGH"].map((g) => `<option ${settings.graphicsPreset === g ? "selected" : ""}>${g}</option>`).join("")}
            </select>
          </label>
          <label>Camera view
            <select id="view">
              ${(["CLOSE", "MEDIUM", "WIDE", "BIRD", "BIRD_FAR", "PLAYER"] as const)
                .map(
                  (g) =>
                    `<option value="${g}" ${settings.viewMode === g ? "selected" : ""}>${
                      g === "BIRD" ? "BIRD'S EYE" : g === "BIRD_FAR" ? "BIRD'S EYE FAR" : g
                    }</option>`,
                )
                .join("")}
            </select>
          </label>
          <label>Track
            <select id="track">
              <option value="BALL" ${settings.trackMode === "BALL" ? "selected" : ""}>Ball</option>
              <option value="PLAYER" ${settings.trackMode === "PLAYER" ? "selected" : ""}>Player</option>
              <option value="DYNAMIC" ${settings.trackMode === "DYNAMIC" ? "selected" : ""}>Dynamic</option>
            </select>
          </label>
          <label class="settings-range">Zoom
            <input id="camera-zoom" type="range" min="70" max="185" step="5" value="${Math.round(clampZoomPercent(settings.cameraZoom))}" />
            <span class="settings-range-value" data-camera-zoom>${Math.round(clampZoomPercent(settings.cameraZoom))}%</span>
          </label>
          <label>Title font
            <select id="title-font">
              ${TITLE_FONTS.map((f) => `<option value="${f.id}" ${settings.titleFont === f.id ? "selected" : ""} style="font-family:${f.family}">${f.label}</option>`).join("")}
            </select>
          </label>
          <label>Stadium &amp; team name font
            <select id="club-name-font">
              ${TITLE_FONTS.map((f) => `<option value="${f.id}" ${settings.clubNameFont === f.id ? "selected" : ""} style="font-family:${f.family}">${f.label}</option>`).join("")}
            </select>
          </label>
          <label class="check"><input id="club-name-glow" type="checkbox" ${settings.clubNameGlow !== false ? "checked" : ""}/> Stadium &amp; team name glow</label>
          <label class="settings-range">Glow diffusion
            <input id="club-name-glow-diffusion" type="range" min="0" max="100" step="1" value="${clampClubNameGlowDiffusion(settings.clubNameGlowDiffusion)}" />
            <span class="settings-range-value" data-club-glow-diff>${clampClubNameGlowDiffusion(settings.clubNameGlowDiffusion)}</span>
          </label>
          <label class="check"><input id="club-name-invert" type="checkbox" ${settings.clubNameInvertColors ? "checked" : ""}/> Invert stadium &amp; team name colours</label>
          <label class="check"><input id="ball-ring" type="checkbox" ${settings.ballGoldRing ? "checked" : ""}/> Gold ring around the ball</label>
          <label class="check"><input id="formation-overlays" type="checkbox" ${settings.formationOverlays ? "checked" : ""}/> Formation overlays</label>
          <p class="hint">When on, hover a pitch or substitute counter to see the player name.</p>
          <label class="settings-range">Football size
            <input id="ball-scale" type="range" min="100" max="225" step="5" value="${Math.round(clampBallScalePercent(settings.ballScale))}" />
            <span class="settings-range-value" data-ball-scale>${Math.round(clampBallScalePercent(settings.ballScale))}%</span>
          </label>
          <div class="row-btns settings-inline-actions">
            <button type="button" data-act="reset-ball-scale">Reset ball size</button>
          </div>
        </section>
        ${teamVisualSection("Home HUD & pitch", "home", settings)}
        ${teamVisualSection("Away HUD & pitch", "away", settings)}
        <section class="settings-section">
          <h3>Advertising boards</h3>
          <p class="hint">Board text and colour around the pitch.</p>
          <div class="ad-edit">
            ${this.ads
              .map(
                (a, i) => `<label class="ad-row">Board ${i + 1}
                  <span>
                    <input data-ad-label="${i}" maxlength="18" value="${escapeAttr(a.label)}" />
                    <input data-ad-color="${i}" type="color" value="${toHex(a.color)}" />
                  </span>
                </label>`,
              )
              .join("")}
          </div>
        </section>`;
      case "advanced":
        return `
        <section class="settings-section settings-section-lab">
          <h3>Match Simulation Lab</h3>
          <p class="hint">Run automated AI-v-AI matches for gameplay analysis.</p>
          <label class="check"><input id="classicSim" type="checkbox" ${settings.includeClassicInSimulations ? "checked" : ""}/> Include Classic Teams in random simulations</label>
          <p class="hint">Default OFF. Fixed Classic fixtures still work when Classics are excluded from random pools.</p>
          <label class="check"><input id="aiTel" type="checkbox" ${settings.aiAnalysisTelemetry ? "checked" : ""}/> AI analysis telemetry</label>
          <button type="button" class="settings-lab-btn" data-act="sim-lab">Open Match Simulation Lab</button>
        </section>
        <section class="settings-section">
          <h3>Diagnostics</h3>
          <label class="check"><input id="dbg" type="checkbox" ${settings.debug ? "checked" : ""}/> Debug overlay</label>
          <label class="check"><input id="form" type="checkbox" ${settings.formationDebug ? "checked" : ""}/> Formation debug</label>
        </section>`;
      default:
        return "";
    }
  }

  private bindPaintHandlers(_settings: SavedSettings): void {
    const root = this.contentRoot;
    root.querySelector("#title-font")?.addEventListener("change", (e) => {
      applyTitleFont((e.target as HTMLSelectElement).value);
    });
    const syncClubNameAppearance = () => {
      applyClubNameAppearance({
        clubNameFont: (root.querySelector("#club-name-font") as HTMLSelectElement)?.value ?? DEFAULT_CLUB_NAME_FONT,
        clubNameGlow: (root.querySelector("#club-name-glow") as HTMLInputElement)?.checked ?? DEFAULT_CLUB_NAME_GLOW,
        clubNameGlowDiffusion: Number((root.querySelector("#club-name-glow-diffusion") as HTMLInputElement)?.value ?? DEFAULT_CLUB_NAME_GLOW_DIFFUSION),
        clubNameInvertColors: (root.querySelector("#club-name-invert") as HTMLInputElement)?.checked ?? DEFAULT_CLUB_NAME_INVERT_COLORS,
      });
    };
    root.querySelector("#club-name-font")?.addEventListener("change", syncClubNameAppearance);
    root.querySelector("#club-name-glow")?.addEventListener("change", syncClubNameAppearance);
    root.querySelector("#club-name-invert")?.addEventListener("change", syncClubNameAppearance);
    const glowDiff = root.querySelector<HTMLInputElement>("#club-name-glow-diffusion");
    glowDiff?.addEventListener("input", () => {
      const label = root.querySelector("[data-club-glow-diff]");
      if (label) label.textContent = glowDiff.value;
      syncClubNameAppearance();
    });
    root.querySelectorAll<HTMLInputElement>("input[type='range'][id$='-portrait-opacity'], input[type='range'][id$='-portrait-scale']").forEach((input) => {
      const label = input.parentElement?.querySelector(".settings-range-value");
      const sync = () => {
        if (!label) return;
        label.textContent = `${input.value}%`;
      };
      input.addEventListener("input", sync);
      sync();
    });
    const zoomInput = root.querySelector<HTMLInputElement>("#camera-zoom");
    zoomInput?.addEventListener("input", () => {
      const label = root.querySelector("[data-camera-zoom]");
      if (label) label.textContent = `${zoomInput.value}%`;
    });
    const ballScaleInput = root.querySelector<HTMLInputElement>("#ball-scale");
    ballScaleInput?.addEventListener("input", () => {
      const label = root.querySelector("[data-ball-scale]");
      if (label) label.textContent = `${ballScaleInput.value}%`;
    });
    const volInput = root.querySelector<HTMLInputElement>("#vol");
    volInput?.addEventListener("input", () => {
      const label = root.querySelector("[data-vol]");
      if (label) label.textContent = `${volInput.value}%`;
    });
    root.querySelector("[data-act='reset-ball-scale']")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ballScaleInput) return;
      ballScaleInput.value = "100";
      const label = root.querySelector("[data-ball-scale]");
      if (label) label.textContent = "100%";
    });
  }

  private startListen(act: BindAction): void {
    this.listening = act;
    this.captureAdsFromDom();
    this.paint(this.snapshotSettings());
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape" && act !== "pause") {
        this.listening = null;
        window.removeEventListener("keydown", onKey, true);
        this.captureAdsFromDom();
        this.paint(this.snapshotSettings());
        return;
      }
      const used = (Object.keys(this.bindings) as BindAction[]).find((k) => k !== act && this.bindings[k] === e.code);
      if (used) this.bindings[used] = this.bindings[act];
      this.bindings[act] = e.code;
      this.listening = null;
      window.removeEventListener("keydown", onKey, true);
      this.captureAdsFromDom();
      this.paint(this.snapshotSettings());
    };
    window.addEventListener("keydown", onKey, true);
  }

  private snapshotSettings(): SavedSettings {
    const patch = this.readVisible();
    const next = {
      ...(this.base ?? patch),
      ...patch,
      keyBindings: { ...this.bindings },
    } as SavedSettings;
    this.base = next;
    return next;
  }

  readAds(): AdvertisingBoardRecord[] {
    this.captureAdsFromDom();
    return this.ads.map((a) => ({ ...a }));
  }

  private captureAdsFromDom(): void {
    this.contentRoot.querySelectorAll<HTMLInputElement>("[data-ad-label]").forEach((input) => {
      const i = Number(input.getAttribute("data-ad-label"));
      if (!this.ads[i]) return;
      this.ads[i] = {
        ...this.ads[i],
        label: input.value.trim() || this.ads[i].label,
      };
    });
    this.contentRoot.querySelectorAll<HTMLInputElement>("[data-ad-color]").forEach((input) => {
      const i = Number(input.getAttribute("data-ad-color"));
      if (!this.ads[i]) return;
      this.ads[i] = { ...this.ads[i], color: toHex(input.value) };
    });
  }

  /** Only fields present on the active Options tab — avoids wiping other sections. */
  private readVisible(): Partial<SavedSettings> {
    const root = this.contentRoot;
    const out: Partial<SavedSettings> = { keyBindings: { ...this.bindings } };
    const dur = root.querySelector("#dur") as HTMLInputElement | null;
    if (dur) out.matchDuration = clampMatchDuration(Number(dur.value));
    const tod = root.querySelector("#tod") as HTMLSelectElement | null;
    if (tod && (tod.value === "DAY" || tod.value === "EVENING" || tod.value === "NIGHT")) {
      out.timeOfDay = tod.value;
    }
    const weather = root.querySelector("#weather") as HTMLSelectElement | null;
    if (weather && (weather.value === "SUNNY" || weather.value === "MILD" || weather.value === "RAINY" || weather.value === "SNOWY")) {
      out.weather = weather.value;
    }
    const gplay = root.querySelector("#gplay") as HTMLSelectElement | null;
    if (
      gplay &&
      (gplay.value === "REAL" || gplay.value === "ARCADE" || gplay.value === "TABLE" || gplay.value === "FLICK")
    ) {
      out.gameplayMode = gplay.value;
    }
    const tableLayout = root.querySelector("#table-layout") as HTMLSelectElement | null;
    if (
      tableLayout &&
      (tableLayout.value === "FRENCH_CLASSIC" ||
        tableLayout.value === "TOURNAMENT_MODERN" ||
        tableLayout.value === "OPEN_CUSTOM")
    ) {
      out.tableLayoutId = tableLayout.value;
    }
    const tableOpp = root.querySelector("#table-opp") as HTMLSelectElement | null;
    if (tableOpp && (tableOpp.value === "AI" || tableOpp.value === "HUMAN")) out.tableOpponent = tableOpp.value;
    const tableDiff = root.querySelector("#table-diff") as HTMLSelectElement | null;
    if (
      tableDiff &&
      (tableDiff.value === "EASY" ||
        tableDiff.value === "NORMAL" ||
        tableDiff.value === "HARD" ||
        tableDiff.value === "EXPERT")
    ) {
      out.tableDifficulty = tableDiff.value;
    }
    const tableFirst = root.querySelector("#table-first") as HTMLInputElement | null;
    if (tableFirst) out.tableFirstTo = Math.max(1, Math.min(21, Number(tableFirst.value) || 5));
    const flickOpp = root.querySelector("#flick-opp") as HTMLSelectElement | null;
    if (flickOpp && (flickOpp.value === "AI" || flickOpp.value === "HUMAN")) out.flickOpponent = flickOpp.value;
    const flickDiff = root.querySelector("#flick-diff") as HTMLSelectElement | null;
    if (
      flickDiff &&
      (flickDiff.value === "EASY" ||
        flickDiff.value === "NORMAL" ||
        flickDiff.value === "HARD" ||
        flickDiff.value === "EXPERT")
    ) {
      out.flickDifficulty = flickDiff.value;
    }
    const flickFirst = root.querySelector("#flick-first") as HTMLInputElement | null;
    if (flickFirst) out.flickFirstTo = Math.max(1, Math.min(21, Number(flickFirst.value) || 5));
    const flickTurns = root.querySelector("#flick-turns") as HTMLInputElement | null;
    if (flickTurns) out.flickTurnBased = flickTurns.checked;
    const invertY = root.querySelector("#invertY") as HTMLInputElement | null;
    if (invertY) out.invertShotY = invertY.checked;
    const passTarget = root.querySelector("#pass-target") as HTMLInputElement | null;
    if (passTarget) out.showPassTargetHighlight = passTarget.checked;
    const audioOn = root.querySelector("#audio-on") as HTMLInputElement | null;
    if (audioOn) out.audioEnabled = audioOn.checked;
    const vol = root.querySelector("#vol") as HTMLInputElement | null;
    if (vol) out.masterVolume = Math.min(1, Math.max(0, Number(vol.value) / 100));
    const gfx = root.querySelector("#gfx") as HTMLSelectElement | null;
    if (gfx) out.graphicsPreset = gfx.value as SavedSettings["graphicsPreset"];
    const view = root.querySelector("#view") as HTMLSelectElement | null;
    if (view) out.viewMode = view.value as SavedSettings["viewMode"];
    const track = root.querySelector("#track") as HTMLSelectElement | null;
    if (track) out.trackMode = track.value as SavedSettings["trackMode"];
    if (root.querySelector("#camera-zoom")) out.cameraZoom = readCameraZoom(root);
    if (root.querySelector("#ball-scale")) out.ballScale = readBallScale(root);
    const titleFont = root.querySelector("#title-font") as HTMLSelectElement | null;
    if (titleFont) out.titleFont = titleFont.value;
    const clubNameFont = root.querySelector("#club-name-font") as HTMLSelectElement | null;
    if (clubNameFont) out.clubNameFont = clubNameFont.value;
    const clubNameGlow = root.querySelector("#club-name-glow") as HTMLInputElement | null;
    if (clubNameGlow) out.clubNameGlow = clubNameGlow.checked;
    if (root.querySelector("#club-name-glow-diffusion")) {
      out.clubNameGlowDiffusion = clampClubNameGlowDiffusion(
        Number((root.querySelector("#club-name-glow-diffusion") as HTMLInputElement).value),
      );
    }
    const clubNameInvert = root.querySelector("#club-name-invert") as HTMLInputElement | null;
    if (clubNameInvert) out.clubNameInvertColors = clubNameInvert.checked;
    const ballRing = root.querySelector("#ball-ring") as HTMLInputElement | null;
    if (ballRing) out.ballGoldRing = ballRing.checked;
    const formationOverlays = root.querySelector("#formation-overlays") as HTMLInputElement | null;
    if (formationOverlays) out.formationOverlays = formationOverlays.checked;
    const dbg = root.querySelector("#dbg") as HTMLInputElement | null;
    if (dbg) out.debug = dbg.checked;
    const aiTel = root.querySelector("#aiTel") as HTMLInputElement | null;
    if (aiTel) out.aiAnalysisTelemetry = aiTel.checked;
    const classicSim = root.querySelector("#classicSim") as HTMLInputElement | null;
    if (classicSim) out.includeClassicInSimulations = classicSim.checked;
    const form = root.querySelector("#form") as HTMLInputElement | null;
    if (form) out.formationDebug = form.checked;
    if (root.querySelector("#home-ring")) {
      out.homeHudRing = (root.querySelector("#home-ring") as HTMLInputElement).checked;
      out.awayHudRing = (root.querySelector("#away-ring") as HTMLInputElement).checked;
      out.homeShowPortraits = (root.querySelector("#home-portraits") as HTMLInputElement).checked;
      out.awayShowPortraits = (root.querySelector("#away-portraits") as HTMLInputElement).checked;
      out.homePortraitOpacity = readOpacity(root, "home-portrait-opacity");
      out.awayPortraitOpacity = readOpacity(root, "away-portrait-opacity");
      out.homePortraitScale = readScale(root, "home-portrait-scale");
      out.awayPortraitScale = readScale(root, "away-portrait-scale");
      out.homePortraitUpright = (root.querySelector("#home-portrait-upright") as HTMLInputElement).checked;
      out.awayPortraitUpright = (root.querySelector("#away-portrait-upright") as HTMLInputElement).checked;
      out.homeHidePlayers = (root.querySelector("#home-hide") as HTMLInputElement).checked;
      out.awayHidePlayers = (root.querySelector("#away-hide") as HTMLInputElement).checked;
      out.homeShowDefLine = (root.querySelector("#home-line-def") as HTMLInputElement).checked;
      out.homeShowMidLine = (root.querySelector("#home-line-mid") as HTMLInputElement).checked;
      out.homeShowAttLine = (root.querySelector("#home-line-att") as HTMLInputElement).checked;
      out.awayShowDefLine = (root.querySelector("#away-line-def") as HTMLInputElement).checked;
      out.awayShowMidLine = (root.querySelector("#away-line-mid") as HTMLInputElement).checked;
      out.awayShowAttLine = (root.querySelector("#away-line-att") as HTMLInputElement).checked;
      out.homeDefLineColor = readColor(root, "home-line-def-color", "#3db7ff");
      out.homeMidLineColor = readColor(root, "home-line-mid-color", "#ffd24a");
      out.homeAttLineColor = readColor(root, "home-line-att-color", "#ff5a6a");
      out.awayDefLineColor = readColor(root, "away-line-def-color", "#7ad0ff");
      out.awayMidLineColor = readColor(root, "away-line-mid-color", "#ffc14d");
      out.awayAttLineColor = readColor(root, "away-line-att-color", "#ff8a9a");
    }
    return out;
  }

  read(): Partial<SavedSettings> {
    return this.readVisible();
  }

  hide(): void {
    this.listening = null;
    this.embedded = false;
    if (this.contentRoot !== this.root) {
      this.contentRoot.onclick = null;
      this.contentRoot.innerHTML = "";
    }
    this.contentRoot = this.root;
    this.root.hidden = true;
    this.root.innerHTML = "";
  }
}

function readColor(root: HTMLElement, id: string, fallback: string): string {
  const value = (root.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? fallback;
  return toHex(value);
}

function toHex(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#007A3D";
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function readOpacity(root: HTMLElement, id: string): number {
  const raw = Number((root.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? 85);
  if (!Number.isFinite(raw)) return 0.85;
  return Math.min(1, Math.max(0, raw / 100));
}

function clampZoomPercent(zoom: number): number {
  const z = Number.isFinite(zoom) ? zoom : 1;
  return Math.min(185, Math.max(70, Math.round(z * 100)));
}

function readCameraZoom(root: HTMLElement): number {
  const raw = Number((root.querySelector("#camera-zoom") as HTMLInputElement | null)?.value ?? 100);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1.85, Math.max(0.7, raw / 100));
}

function clampBallScalePercent(scale: number): number {
  const z = Number.isFinite(scale) ? scale : 1;
  return Math.min(225, Math.max(100, Math.round(z * 100)));
}

function readBallScale(root: HTMLElement): number {
  const raw = Number((root.querySelector("#ball-scale") as HTMLInputElement | null)?.value ?? 100);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(2.25, Math.max(1, raw / 100));
}

function readScale(root: HTMLElement, id: string): number {
  const raw = Number((root.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? 100);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(5, Math.max(0.4, raw / 100));
}

function teamVisualSection(label: string, side: "home" | "away", settings: SavedSettings): string {
  const ring = side === "home" ? settings.homeHudRing : settings.awayHudRing;
  const portraits = side === "home" ? settings.homeShowPortraits : settings.awayShowPortraits;
  const opacity = Math.round((side === "home" ? settings.homePortraitOpacity : settings.awayPortraitOpacity) * 100);
  const scale = Math.round((side === "home" ? settings.homePortraitScale : settings.awayPortraitScale) * 100);
  const upright = side === "home" ? settings.homePortraitUpright : settings.awayPortraitUpright;
  const hide = side === "home" ? settings.homeHidePlayers : settings.awayHidePlayers;
  return `
        <h3 class="league-head">${label}</h3>
        <div class="settings-team">
          <label class="check"><input id="${side}-ring" type="checkbox" ${ring ? "checked" : ""}/> Team ring on HUD player</label>
          <p class="hint">Ring in this team's colour under the player shown on the matching player-details card.</p>
          <label class="check"><input id="${side}-portraits" type="checkbox" ${portraits ? "checked" : ""}/> Show player PNG under players</label>
          <label class="check"><input id="${side}-portrait-upright" type="checkbox" ${upright ? "checked" : ""}/> PNG upright</label>
          <p class="hint">Off = flat on the pitch (best for bird's-eye). On = standing upright.</p>
          <label class="settings-range">PNG transparency
            <input id="${side}-portrait-opacity" type="range" min="0" max="100" step="1" value="${opacity}" />
            <span class="settings-range-value">${opacity}%</span>
          </label>
          <label class="settings-range">PNG size
            <input id="${side}-portrait-scale" type="range" min="40" max="500" step="5" value="${scale}" />
            <span class="settings-range-value">${scale}%</span>
          </label>
          <label class="check"><input id="${side}-hide" type="checkbox" ${hide ? "checked" : ""}/> Hide 3D players (PNG only)</label>
          <p class="hint">Hides the kit models so only each player's assigned portrait shows. Shortcut: ${codeLabel(mergeKeyBindings(settings.keyBindings)[side === "home" ? "homePlayers" : "awayPlayers"])}.</p>
          <p class="hint" style="margin-top:12px">Unit lines link players in each line (sorted across the pitch).</p>
          ${unitLineRow(side, "def", "Defence", settings)}
          ${unitLineRow(side, "mid", "Midfield", settings)}
          ${unitLineRow(side, "att", "Attack", settings)}
        </div>`;
}

function unitLineRow(
  side: "home" | "away",
  kind: "def" | "mid" | "att",
  label: string,
  settings: SavedSettings,
): string {
  const show =
    kind === "def"
      ? side === "home"
        ? settings.homeShowDefLine
        : settings.awayShowDefLine
      : kind === "mid"
        ? side === "home"
          ? settings.homeShowMidLine
          : settings.awayShowMidLine
        : side === "home"
          ? settings.homeShowAttLine
          : settings.awayShowAttLine;
  const color =
    kind === "def"
      ? side === "home"
        ? settings.homeDefLineColor
        : settings.awayDefLineColor
      : kind === "mid"
        ? side === "home"
          ? settings.homeMidLineColor
          : settings.awayMidLineColor
        : side === "home"
          ? settings.homeAttLineColor
          : settings.awayAttLineColor;
  return `<label class="unit-line-row check">
            <input id="${side}-line-${kind}" type="checkbox" ${show ? "checked" : ""}/> ${label} line
            <input id="${side}-line-${kind}-color" type="color" value="${toHex(color)}" title="${label} line colour" />
          </label>`;
}
