import type { Match } from "../Match";
import { FootballState } from "../FootballState";
import { isRestartState, restartLabel } from "../Restarts";
import { portraitHtml } from "../../ui/Portrait";
import { contrastingKitText } from "../../ui/kitContrast";
import type { Player } from "../players/Player";
import { hudFocusPlayers } from "./HudFocus";
import type { KeyBindings } from "../controls/KeyBindings";
import { HUD_CARD_RAISE_MS, hudSheetFading, hudSheetShowing } from "./HudCardRaise";
import { subAnnounceFading, type SubAnnouncement } from "../Substitution";
import { profileStatsBlock } from "../../ui/ProfileHex";

export class MatchHUD {
  readonly root: HTMLElement;
  private scoreEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private ftEl!: HTMLElement;
  private homeEl!: HTMLElement;
  private awayEl!: HTMLElement;
  private homeSheet!: HTMLElement;
  private awaySheet!: HTMLElement;
  private homeSubEl!: HTMLElement;
  private awaySubEl!: HTMLElement;
  private shotEl!: HTMLElement;
  private spotEl!: HTMLElement;
  private radarCanvas!: HTMLCanvasElement;
  private lastHomeId = "";
  private lastAwayId = "";
  private lastHomeSheetId = "";
  private lastAwaySheetId = "";
  private lastDom = 0;
  private built = false;
  private homeSheetUntil = 0;
  private awaySheetUntil = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.build();
  }

  setBindings(_bindings: KeyBindings): void {}

  hide(): void {
    this.root.hidden = true;
  }

  show(): void {
    this.root.hidden = false;
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="hud-score" hidden></div>
      <div class="hud-sub hud-sub-home" data-sub="home" hidden></div>
      <div class="hud-sub hud-sub-away" data-sub="away" hidden></div>
      <div class="hud-auto" hidden></div>
      <div class="hud-toast hud-auto" hidden></div>
      <div class="hud-ft" hidden>FULL TIME</div>
      <div class="hud-bottom">
        <div class="hud-slot hud-home-slot">
          <div class="hud-player-sheet" data-sheet="home" hidden></div>
          <div class="hud-card hud-home-card" data-kind="home" hidden></div>
        </div>
        <div class="radar" id="radar-wrap"><canvas id="radar-canvas" width="160" height="104"></canvas></div>
        <div class="hud-slot hud-opp-slot">
          <div class="hud-player-sheet" data-sheet="away" hidden></div>
          <div class="hud-card hud-opp-card" data-kind="away" hidden></div>
        </div>
      </div>
      <div class="hud-shot" hidden>SHOT TARGET</div>
      <div class="spot-hud" hidden>
        <span data-spot-kind>FREE KICK</span>
        <span>Click the pitch to place the kick</span>
        <button type="button" data-act="spot-reset">Reset spot</button>
      </div>
    `;
    this.scoreEl = this.root.querySelector(".hud-score")!;
    this.bannerEl = this.root.querySelector(".hud-auto")!;
    this.toastEl = this.root.querySelector(".hud-toast")!;
    this.ftEl = this.root.querySelector(".hud-ft")!;
    this.homeEl = this.root.querySelector(".hud-home-card")!;
    this.awayEl = this.root.querySelector(".hud-opp-card")!;
    this.homeSheet = this.root.querySelector('[data-sheet="home"]')!;
    this.awaySheet = this.root.querySelector('[data-sheet="away"]')!;
    this.homeSubEl = this.root.querySelector('[data-sub="home"]')!;
    this.awaySubEl = this.root.querySelector('[data-sub="away"]')!;
    this.shotEl = this.root.querySelector(".hud-shot")!;
    this.spotEl = this.root.querySelector(".spot-hud")!;
    this.radarCanvas = this.root.querySelector("#radar-canvas")!;
    this.homeEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleSheet("home");
    });
    this.awayEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleSheet("away");
    });
    this.homeSheet.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleSheet("home");
    });
    this.awaySheet.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleSheet("away");
    });
    this.built = true;
  }

  private toggleSheet(side: "home" | "away"): void {
    const now = performance.now();
    if (side === "home") {
      this.homeSheetUntil = hudSheetShowing(this.homeSheetUntil, now) ? 0 : now + HUD_CARD_RAISE_MS;
    } else {
      this.awaySheetUntil = hudSheetShowing(this.awaySheetUntil, now) ? 0 : now + HUD_CARD_RAISE_MS;
    }
    this.syncSheets(now);
  }

  private syncSheets(now: number): void {
    this.applySheet(this.homeSheet, this.homeSheetUntil, now);
    this.applySheet(this.awaySheet, this.awaySheetUntil, now);
  }

  private applySheet(el: HTMLElement, until: number, now: number): void {
    const showing = hudSheetShowing(until, now);
    const fading = hudSheetFading(until, now);
    el.hidden = !showing;
    el.classList.toggle("fade-out", fading);
  }

  render(match: Match, autoplay: boolean): void {
    if (!this.built) this.build();
    const now = performance.now();
    if (now - this.lastDom > 70) {
      this.lastDom = now;
      this.updateDom(match, autoplay);
    }
    this.syncSheets(now);
    this.drawRadar(match);
  }

  private updateDom(match: Match, autoplay: boolean): void {
    this.scoreEl.hidden = false;
    this.scoreEl.innerHTML = `
      <span class="clock">${match.clock.display()}</span>
      <span class="home">${match.home.record.abbreviation}</span>
      <strong>${match.homeScore} - ${match.awayScore}</strong>
      <span class="away">${match.away.record.abbreviation}</span>
      <span class="mode">${match.gameplayMode}${match.teamControl ? " · TEAM" : ""} · ${match.env.timeOfDay} ${match.env.weather}</span>
    `;
    let banner = "";
    if (isRestartState(match.state) && match.practice !== "spot") banner = restartLabel(match.state);
    else if (match.state === FootballState.FREE_KICK) banner = "FREE KICK";
    else if (match.state === FootballState.PENALTY) banner = "PENALTY";
    else if (match.state === FootballState.GOAL_CELEBRATION) {
      banner = autoplay ? "GOAL!" : "GOAL!  ·  Enter / Space to continue";
    } else if (autoplay && match.state !== FootballState.HALF_TIME && match.state !== FootballState.FULL_TIME) {
      banner = this.root.parentElement?.querySelector(".attract-banner") ? "" : "AUTO PLAY";
    }
    this.bannerEl.hidden = !banner;
    this.bannerEl.textContent = banner;
    this.toastEl.hidden = match.cameraToastT <= 0;
    this.toastEl.textContent = match.cameraToast;
    this.ftEl.hidden = true;
    this.shotEl.hidden = !match.shotTarget;
    this.spotEl.hidden = match.practice !== "spot";
    const kind = this.spotEl.querySelector("[data-spot-kind]");
    if (kind) kind.textContent = match.spotKick?.kind === "PENALTY" ? "PENALTY" : "FREE KICK";

    const focus = hudFocusPlayers(match.possessing, match.allPlayers(), match.ball.x, match.ball.z, match.userSide);
    this.fillCard(this.homeEl, focus.home, match, false);
    this.fillCard(this.awayEl, focus.away, match, true);
    this.fillSheet(this.homeSheet, focus.home, match, false);
    this.fillSheet(this.awaySheet, focus.away, match, true);
    this.syncSubBanner(this.homeSubEl, match.subAnnouncements.find((a) => a.side === "home") ?? null);
    this.syncSubBanner(this.awaySubEl, match.subAnnouncements.find((a) => a.side === "away") ?? null);
  }

  private syncSubBanner(el: HTMLElement, ann: SubAnnouncement | null): void {
    if (!ann) {
      el.hidden = true;
      el.classList.remove("fade-out");
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.classList.toggle("fade-out", subAnnounceFading(ann.age));
    const off = portraitHtml(
      { displayName: ann.offName, appearance: { portraitAsset: ann.offPortrait } },
      ann.offNumber,
      ann.teamColor,
    );
    const on = portraitHtml(
      { displayName: ann.onName, appearance: { portraitAsset: ann.onPortrait } },
      ann.onNumber,
      ann.teamColor,
    );
    el.innerHTML = `
      <div class="hud-sub-tag">SUBSTITUTION</div>
      <div class="hud-sub-row off">
        ${off}
        <div class="hud-sub-meta"><span class="num">${ann.offNumber}</span><span class="name">${ann.offName}</span><span class="dir">OFF</span></div>
      </div>
      <div class="hud-sub-row on">
        ${on}
        <div class="hud-sub-meta"><span class="num">${ann.onNumber}</span><span class="name">${ann.onName}</span><span class="dir">ON</span></div>
      </div>
    `;
  }

  private fillCard(el: HTMLElement, player: Player | null, match: Match, opp: boolean): void {
    if (!player) {
      el.hidden = true;
      if (opp) this.lastAwayId = "";
      else this.lastHomeId = "";
      return;
    }
    el.hidden = false;
    el.classList.toggle("away", opp);
    const cache = opp ? this.lastAwayId : this.lastHomeId;
    if (player.id !== cache) {
      if (opp) this.lastAwayId = player.id;
      else this.lastHomeId = player.id;
      const team = player.side === "home" ? match.home : match.away;
      el.innerHTML = `
        ${portraitHtml(
          { name: player.displayName, appearance: { portraitAsset: player.appearance.portraitAsset } },
          player.shirtNumber,
          team.record.primaryColor,
          { textColor: contrastingKitText(team.record.primaryColor, team.record.secondaryColor) },
        )}
        <div>
          <div class="tag">${team.record.abbreviation}</div>
          <div class="row">
            <span class="num">#${player.shirtNumber}</span>
            <span class="name">${escapeHtml(player.displayName.toUpperCase())}</span>
            <span class="pos">${player.position}</span>
            <span class="ovr">OVR ${player.overall}</span>
          </div>
          <div class="energy"><span></span></div>
          <div class="shot-power" hidden><span></span></div>
          <div class="stats"></div>
        </div>
      `;
    }
    const bar = el.querySelector(".energy span") as HTMLElement | null;
    const stats = el.querySelector(".stats");
    if (bar) {
      bar.style.width = `${player.energy.percent}%`;
      bar.classList.toggle("boost", player.boosting);
    }
    if (stats) {
      const book =
        player.yellowCards >= 1 ? ` · YELLOW${player.yellowCards > 1 ? `×${player.yellowCards}` : ""}` : "";
      stats.textContent = player.boosting
        ? `SPEED BURST · ENERGY ${player.energy.percent}%`
        : `PASS ${player.attrs.passing} · SHOT ${player.attrs.shooting} · PACE ${player.attrs.pace}${book}`;
    }
    const power = el.querySelector(".shot-power") as HTMLElement | null;
    if (power) {
      const show = !!player.hasBall && match.shootCharge > 0.04;
      power.hidden = !show;
      power.classList.toggle("hot", match.shootCharge >= 0.85);
      const fill = power.querySelector("span") as HTMLElement | null;
      if (fill) fill.style.width = `${Math.min(100, match.shootCharge * 80)}%`;
    }
  }

  private fillSheet(el: HTMLElement, player: Player | null, match: Match, opp: boolean): void {
    if (!player) {
      if (opp) this.lastAwaySheetId = "";
      else this.lastHomeSheetId = "";
      el.innerHTML = "";
      return;
    }
    const cache = opp ? this.lastAwaySheetId : this.lastHomeSheetId;
    if (player.id === cache && el.innerHTML) return;
    if (opp) this.lastAwaySheetId = player.id;
    else this.lastHomeSheetId = player.id;
    const team = player.side === "home" ? match.home : match.away;
    const a = player.attrs;
    el.innerHTML = `
      ${portraitHtml(
        { name: player.displayName, appearance: { portraitAsset: player.appearance.portraitAsset } },
        player.shirtNumber,
        team.record.primaryColor,
        { textColor: contrastingKitText(team.record.primaryColor, team.record.secondaryColor) },
      )}
      <div class="sheet-num">#${player.shirtNumber}</div>
      <div class="sheet-name">${escapeHtml(player.displayName.toUpperCase())}</div>
      <div class="sheet-meta">${team.record.abbreviation} · ${player.position} · OVR ${player.overall}</div>
      ${profileStatsBlock(a, { compact: true, mode: "hex", size: 112 })}
    `;
  }

  private drawRadar(match: Match): void {
    const canvas = this.radarCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 104);
    ctx.fillStyle = "rgba(8,40,22,0.85)";
    ctx.fillRect(0, 0, 160, 104);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(6, 6, 148, 92);
    const mapX = (x: number) => 80 + (x / 52.5) * 70;
    const mapZ = (z: number) => 52 + (z / 34) * 42;
    for (const p of match.allPlayers()) {
      ctx.fillStyle = p.side === "home" ? "#3dcc73" : "#e24b4b";
      if (p.id === match.controlled.id) ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(mapX(p.x), mapZ(p.z), p.id === match.controlled.id ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(mapX(match.ball.x), mapZ(match.ball.z), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  dispose(): void {
    this.root.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
