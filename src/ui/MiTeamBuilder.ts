import type { SquadPlayer } from "../core/Database";
import type { GameDatabase } from "../core/Database";
import type { MiTeamRosterSlot, SaveManager } from "../core/SaveManager";
import type { TeamRecord } from "../data/schema";
import {
  MITEAM_DEFAULT_BADGE,
  MITEAM_DEFAULT_CLUB_NAME,
  MITEAM_DEFAULT_PRIMARY,
  MITEAM_DEFAULT_SECONDARY,
  MITEAM_FORMATION,
  MITEAM_TEAM_ID,
} from "../core/SaveManager";
import {
  applyMiTeamToDb,
  deleteMiTeam,
  ensureMiTeamSave,
  findMiTeamOriginTeam,
  miteamBenchSlotIds,
  miteamFillOrder,
  miteamXiSlots,
  nextEmptySlot,
  restartMiTeam,
  setMiTeamBadge,
  setMiTeamClubName,
  setMiTeamColors,
  setMiTeamRoster,
  xiComplete,
} from "../football/miteam/MiTeam";
import {
  clubsInPool,
  miteamCrestChoices,
  MITEAM_FILTER_LEAGUE_LABEL,
  MITEAM_FILTER_LEAGUES,
  parseFilter,
  pickRandomForSlot,
  serializeFilter,
  type MiTeamPoolFilter,
} from "../football/miteam/MiTeamPool";
import { getFormation } from "../football/teams/Formation";
import { contrastingKitText } from "./kitContrast";
import {
  burstConfetti,
  miteamFoilHtml,
  packTierForOverall,
  playFoilOpen,
  preloadMiTeamRevealAssets,
  waitForElementImages,
  type PackPhase,
  type PackTier,
} from "./MiTeamPack";
import {
  applyPlayerCardFlip,
  formatPlayerCardTeamName,
  nextPlayerCardFlipY,
  playerCardFlipSideFromClientX,
  playerCardShellHtml,
} from "./playerCardShared";
import { nextProfileStatsMode, profileStatsBlock, type ProfileStatsMode } from "./ProfileHex";
import { assetUrl } from "../core/assetUrl";
import {
  fitKitSurnameElements,
  kitMarkerHtml,
  kitSurnameFromName,
  portraitHtml,
  teamBadgeHtml,
} from "./Portrait";
import {
  formationToPitchPercent,
  separatePitchMarkers,
} from "./CharacterSelect";

const kitSurname = kitSurnameFromName;
const GK_MARKER_GREEN = "#1FAE5B";

type MiTeamControlMode = "PLAYER" | "TEAM" | "OPTIONS";

function kitMarkerColors(
  primaryPosition: string,
  teamColor: string,
  teamSecondary: string,
): { primaryColor: string; textColor: string } {
  if (primaryPosition === "GK") {
    return { primaryColor: GK_MARKER_GREEN, textColor: "#FFFFFF" };
  }
  return {
    primaryColor: teamColor,
    textColor: contrastingKitText(teamColor, teamSecondary),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

export type MiTeamBuilderAction = "back" | "start" | "deleted";

/**
 * Formation-like MiTeam pack builder: PLAYER SELECT / TEAM SELECT / MITEAM options.
 */
export class MiTeamBuilder {
  readonly root: HTMLElement;
  private db!: GameDatabase;
  private save!: SaveManager;
  private filter: MiTeamPoolFilter = { kind: "all" };
  private phase: PackPhase = "foil";
  private candidate: SquadPlayer | null = null;
  private targetSlot: string | null = null;
  private cardFlipY = 0;
  private controlMode: MiTeamControlMode = "PLAYER";
  private crestPickerOpen = false;
  private selectedPlayerId: string | null = null;
  private cardEditing = false;
  private packing = false;
  private profileView: ProfileStatsMode = "hex";
  onAction: ((act: MiTeamBuilderAction) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "char-select miteam-builder";
    parent.appendChild(this.root);
    this.hide();
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.root.addEventListener("change", (e) => this.onChange(e));
  }

  show(): void {
    this.root.classList.add("open");
    this.root.style.display = "";
  }

  hide(): void {
    this.root.classList.remove("open");
    this.root.style.display = "none";
  }

  open(db: GameDatabase, save: SaveManager): void {
    this.db = db;
    this.save = save;
    ensureMiTeamSave(save);
    applyMiTeamToDb(db, save);
    this.filter = { kind: "all" };
    this.controlMode = "PLAYER";
    this.crestPickerOpen = false;
    this.cardEditing = false;
    this.selectedPlayerId = null;
    this.resetPack();
    this.packing = !!this.targetSlot;
    if (!this.targetSlot && this.roster().length) {
      this.controlMode = "TEAM";
      this.selectedPlayerId = this.roster()[0]?.playerId ?? null;
    }
    this.render();
    this.show();
  }

  private roster(): MiTeamRosterSlot[] {
    return this.save.data.miteam?.roster ?? [];
  }

  private clubName(): string {
    return this.save.data.miteam?.clubName ?? MITEAM_DEFAULT_CLUB_NAME;
  }

  private team() {
    return this.db.getTeam(MITEAM_TEAM_ID);
  }

  private excludeIds(): Set<string> {
    return new Set(this.roster().map((r) => r.playerId));
  }

  private resetPack(): void {
    this.targetSlot = nextEmptySlot(this.roster());
    this.candidate = null;
    this.cardFlipY = 0;
    this.cardEditing = false;
    if (!this.targetSlot) {
      this.phase = "revealed";
      this.packing = false;
      return;
    }
    this.phase = "foil";
    this.drawCandidate();
  }

  private drawCandidate(): void {
    if (!this.targetSlot) {
      this.candidate = null;
      return;
    }
    this.candidate = pickRandomForSlot(this.db, {
      slot: this.targetSlot,
      filter: this.filter,
      excludePlayerIds: this.excludeIds(),
    });
    // Warm portrait / crest while the pack is still sealed.
    if (this.candidate) {
      const source = this.sourceTeamContext(this.candidate.player.id);
      void preloadMiTeamRevealAssets(this.candidate, source.team);
    }
  }

  private sealedTier(): PackTier {
    if (!this.candidate) return "silver";
    return packTierForOverall(this.candidate.overall);
  }

  private beginPack(slot?: string | null): void {
    const next = slot && !this.roster().some((r) => r.slot === slot) ? slot : nextEmptySlot(this.roster());
    if (!next) {
      // Full squad — repack the selected player's slot when possible.
      const row = this.roster().find((r) => r.playerId === this.selectedPlayerId);
      if (!row) return;
      const roster = this.roster().filter((r) => r.playerId !== row.playerId);
      setMiTeamRoster(this.save, this.db, roster);
      this.targetSlot = row.slot;
    } else {
      this.targetSlot = next;
    }
    this.packing = true;
    this.controlMode = "PLAYER";
    this.cardEditing = false;
    this.cardFlipY = 0;
    this.phase = "foil";
    this.drawCandidate();
    this.render();
  }

  private attrsForProfilePatch(): SquadPlayer["attrs"] | null {
    if (this.packing && this.candidate) return this.candidate.attrs;
    return this.selectedSquadPlayer()?.attrs ?? null;
  }

  /** Cycle hex → full → bars in place (same as Formation Panel). */
  private toggleProfileView(): void {
    const attrs = this.attrsForProfilePatch();
    if (!attrs) return;
    this.profileView = nextProfileStatsMode(this.profileView);
    const hosts = [...this.root.querySelectorAll<HTMLElement>("[data-char='profile-toggle']")];
    if (!hosts.length) {
      this.render();
      return;
    }
    for (const host of hosts) {
      if (host.closest(".miteam-pack-under:not(.miteam-pack-revealed)")) continue;
      const size = Number(host.getAttribute("data-size") || 148);
      const compact = host.classList.contains("profile-stats-compact");
      host.outerHTML = profileStatsBlock(attrs, {
        compact,
        mode: this.profileView,
        size,
      });
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Enter" && e.key !== " ") return;
    const toggle = (e.target as HTMLElement).closest?.("[data-char='profile-toggle']");
    if (toggle && this.root.contains(toggle as Node)) {
      e.preventDefault();
      this.toggleProfileView();
      return;
    }
    const face = (e.target as HTMLElement).closest?.("[data-char='card-face']") as HTMLElement | null;
    if (
      face &&
      this.root.contains(face) &&
      !this.cardEditing &&
      this.controlMode === "PLAYER" &&
      !face.closest(".miteam-pack-under:not(.miteam-pack-revealed)")
    ) {
      e.preventDefault();
      this.cardFlipY = nextPlayerCardFlipY(this.cardFlipY, "right");
      applyPlayerCardFlip(face, this.cardFlipY);
    }
  }

  private onClick(e: MouseEvent): void {
    const profileToggle = (e.target as HTMLElement).closest<HTMLElement>("[data-char='profile-toggle']");
    if (
      profileToggle &&
      this.root.contains(profileToggle) &&
      !profileToggle.closest(".miteam-pack-under:not(.miteam-pack-revealed)")
    ) {
      e.preventDefault();
      e.stopPropagation();
      this.toggleProfileView();
      return;
    }

    const slotEl = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (slotEl && this.root.contains(slotEl) && this.controlMode === "TEAM") {
      const slot = slotEl.getAttribute("data-slot");
      const row = this.roster().find((r) => r.slot === slot);
      if (row) {
        this.selectedPlayerId = row.playerId;
        this.controlMode = "PLAYER";
        this.packing = false;
        this.cardEditing = false;
        this.cardFlipY = 0;
        this.profileView = "hex";
        this.render();
        return;
      }
      if (slot && !row) {
        this.beginPack(slot);
        return;
      }
    }

    const rosterRow = (e.target as HTMLElement).closest<HTMLElement>("[data-miteam-player]");
    if (rosterRow && this.root.contains(rosterRow)) {
      const id = rosterRow.getAttribute("data-miteam-player");
      if (id) {
        this.selectedPlayerId = id;
        this.controlMode = "PLAYER";
        this.packing = false;
        this.cardEditing = false;
        this.cardFlipY = 0;
        this.profileView = "hex";
        this.render();
      }
      return;
    }

    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-miteam]");
    if (!t || !this.root.contains(t)) {
      // Same as Formation Panel: tap card face (not hex) to flip from that side.
      const face = (e.target as HTMLElement).closest<HTMLElement>("[data-char='card-face']");
      if (
        face &&
        this.root.contains(face) &&
        !this.cardEditing &&
        this.controlMode === "PLAYER" &&
        // Allow flip once unwrapped; only block the still-sealed under-card.
        !face.closest(".miteam-pack-under:not(.miteam-pack-revealed)")
      ) {
        e.preventDefault();
        e.stopPropagation();
        const side = playerCardFlipSideFromClientX(face, e.clientX);
        this.cardFlipY = nextPlayerCardFlipY(this.cardFlipY, side);
        applyPlayerCardFlip(face, this.cardFlipY);
        return;
      }
      if (this.crestPickerOpen && !(e.target as HTMLElement).closest(".miteam-crest-wrap")) {
        this.crestPickerOpen = false;
        this.render();
      }
      return;
    }
    const act = t.getAttribute("data-miteam");
    if (act === "crest-toggle") {
      this.crestPickerOpen = !this.crestPickerOpen;
      this.render();
      return;
    }
    if (act === "crest-pick") {
      const url = t.getAttribute("data-crest") ?? MITEAM_DEFAULT_BADGE;
      setMiTeamBadge(this.save, this.db, url);
      this.crestPickerOpen = false;
      this.render();
      return;
    }
    if (act === "crest-close") {
      this.crestPickerOpen = false;
      this.render();
      return;
    }
    if (act === "mode-player") {
      this.controlMode = "PLAYER";
      this.crestPickerOpen = false;
      if (!this.packing && !this.selectedPlayerId && this.roster()[0]) {
        this.selectedPlayerId = this.roster()[0]!.playerId;
      }
      this.render();
      return;
    }
    if (act === "mode-team") {
      this.controlMode = "TEAM";
      this.packing = false;
      this.crestPickerOpen = false;
      this.cardEditing = false;
      this.render();
      return;
    }
    if (act === "mode-options") {
      this.controlMode = "OPTIONS";
      this.packing = false;
      this.cardEditing = false;
      this.render();
      return;
    }
    if (act === "back") {
      this.onAction?.("back");
      return;
    }
    if (act === "open-pack") {
      this.openPack(t);
      return;
    }
    if (act === "card-pack") {
      this.beginPack();
      return;
    }
    if (act === "card-edit") {
      this.cardEditing = true;
      this.render();
      return;
    }
    if (act === "card-view") {
      this.cardEditing = false;
      this.render();
      return;
    }
    if (act === "discard") {
      this.discard();
      return;
    }
    if (act === "keep") {
      this.keep();
      return;
    }
    if (act === "fill") {
      this.fillRemaining();
      return;
    }
    if (act === "restart") {
      restartMiTeam(this.save);
      applyMiTeamToDb(this.db, this.save);
      this.selectedPlayerId = null;
      this.resetPack();
      this.packing = !!this.targetSlot;
      this.controlMode = "PLAYER";
      this.render();
      return;
    }
    if (act === "delete") {
      deleteMiTeam(this.save, this.db);
      this.onAction?.("deleted");
      return;
    }
    if (act === "start") {
      if (!xiComplete(this.roster())) return;
      this.onAction?.("start");
      return;
    }
  }

  private onChange(e: Event): void {
    const t = e.target as HTMLElement;
    if (t.matches("[data-miteam-filter]")) {
      this.filter = parseFilter((t as HTMLSelectElement).value);
      if (this.packing && (this.phase === "foil" || this.phase === "opening" || this.phase === "revealed")) {
        this.drawCandidate();
        this.cardFlipY = 0;
        if (this.phase === "opening") this.phase = "foil";
      }
      this.render();
      return;
    }
    if (t.matches("[data-miteam-name]")) {
      setMiTeamClubName(this.save, this.db, (t as HTMLInputElement).value);
      this.render();
      return;
    }
    if (t.matches("[data-miteam-primary]")) {
      setMiTeamColors(this.save, this.db, { primaryColor: (t as HTMLInputElement).value });
      this.render();
      return;
    }
    if (t.matches("[data-miteam-secondary]")) {
      setMiTeamColors(this.save, this.db, { secondaryColor: (t as HTMLInputElement).value });
      this.render();
      return;
    }
    if (t.matches("[data-miteam-crest-upload]")) {
      const input = t as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file || !file.type.startsWith("image/")) return;
      if (file.size > 750_000) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (!dataUrl.startsWith("data:image/")) return;
        setMiTeamBadge(this.save, this.db, dataUrl);
        this.crestPickerOpen = false;
        this.render();
      };
      reader.readAsDataURL(file);
    }
  }

  private openPack(foilBtn: HTMLElement): void {
    if (this.phase !== "foil" || !this.targetSlot) return;
    if (!this.candidate) this.drawCandidate();
    if (!this.candidate) return;
    const tier = this.sealedTier();
    const candidate = this.candidate;
    const source = this.sourceTeamContext(candidate.player.id);
    this.phase = "opening";
    if (foilBtn instanceof HTMLButtonElement) foilBtn.disabled = true;
    const layered = this.root.querySelector(".miteam-pack-layered");
    const under = this.root.querySelector<HTMLElement>(".miteam-pack-under");
    layered?.classList.add("is-opening");
    void preloadMiTeamRevealAssets(candidate, source.team)
      .then(() => waitForElementImages(under))
      .then(() => {
        if (this.phase !== "opening" || this.candidate !== candidate) return;
        // Confetti shortly after the wrapper starts dissolving — above the foil.
        const confettiHost =
          (layered instanceof HTMLElement ? layered : null) ??
          foilBtn.closest<HTMLElement>(".miteam-pack-layered");
        playFoilOpen(foilBtn, () => {
          if (this.phase !== "opening" || this.candidate !== candidate) return;
          this.phase = "revealed";
          // Keep the preloaded under-card — do not remount a differently sized card.
          this.promotePackRevealInPlace();
        });
        window.setTimeout(() => {
          if (this.phase !== "opening" || this.candidate !== candidate || !confettiHost) return;
          burstConfetti(confettiHost, tier);
        }, 90);
      });
  }

  /** Strip foil and enable the already-rendered card + KEEP/DISCARD row. */
  private promotePackRevealInPlace(): void {
    const layered = this.root.querySelector<HTMLElement>(".miteam-pack-layered");
    const under = this.root.querySelector<HTMLElement>(".miteam-pack-under");
    const foilLayer = this.root.querySelector(".miteam-pack-foil-layer");
    if (!layered || !under) {
      this.render();
      return;
    }
    // Leave any confetti on `layered` — only remove the foil chrome.
    foilLayer?.remove();
    layered.classList.remove("is-opening");
    layered.classList.add("is-revealed");
    under.removeAttribute("aria-hidden");
    under.classList.add("miteam-pack-revealed");
    // Directly under the card box (absolute top:100%) so it stays flush without a layout pop.
    layered.querySelector(":scope > .miteam-keep-row")?.remove();
    if (!under.querySelector(":scope > .miteam-keep-row")) {
      under.insertAdjacentHTML("beforeend", this.keepDiscardRowHtml());
    }
    // Pack stays mounted — only now mirror the pull into Player Details.
    this.refreshRosterDetailsCard();
  }

  /** Left-rail details for the current selection / revealed pull (does not remount the pack). */
  private refreshRosterDetailsCard(): void {
    const host = this.root.querySelector(".team-roster-card");
    if (!host) return;
    const team = this.team();
    const selectedSp = this.selectedSquadPlayer();
    const roster = this.roster();
    const selectedRow = selectedSp ? roster.find((r) => r.playerId === selectedSp.player.id) : null;
    const selectedCols = selectedSp
      ? this.coloursForPlayer(selectedSp.player.id, selectedRow?.sourceTeamId)
      : { primary: team.primaryColor, secondary: team.secondaryColor };
    const slotLabel = this.targetSlot?.startsWith("BENCH_")
      ? `BENCH ${this.targetSlot.replace("BENCH_", "")}`
      : this.targetSlot ?? "FULL";
    host.innerHTML = this.rosterDetailsHtml(team, selectedSp, selectedCols, slotLabel);
    requestAnimationFrame(() => fitKitSurnameElements(host));
  }

  private discard(): void {
    if (!this.targetSlot) return;
    const prevId = this.candidate?.player.id ?? null;
    for (let i = 0; i < 8; i++) {
      this.drawCandidate();
      if (!this.candidate || this.candidate.player.id !== prevId) break;
    }
    this.cardFlipY = 0;
    this.profileView = "hex";
    this.phase = "foil";
    this.packing = true;
    this.render();
  }

  private keep(): void {
    if (!this.candidate || !this.targetSlot) return;
    const origin = this.sourceTeamContext(this.candidate.player.id);
    const roster = [...this.roster()];
    const shirt = nextShirt(roster, this.candidate.shirtNumber);
    roster.push({
      playerId: this.candidate.player.id,
      slot: this.targetSlot,
      shirtNumber: shirt,
      sourceTeamId: origin.team.id !== MITEAM_TEAM_ID ? origin.team.id : null,
    });
    this.selectedPlayerId = this.candidate.player.id;
    setMiTeamRoster(this.save, this.db, roster);
    this.profileView = "hex";
    this.resetPack();
    this.packing = !!this.targetSlot;
    if (!this.targetSlot) this.controlMode = "TEAM";
    this.render();
  }

  private fillRemaining(): void {
    const roster = [...this.roster()];
    const exclude = new Set(roster.map((r) => r.playerId));
    for (const slot of miteamFillOrder()) {
      if (roster.some((r) => r.slot === slot)) continue;
      const pick = pickRandomForSlot(this.db, {
        slot,
        filter: this.filter,
        excludePlayerIds: exclude,
      });
      if (!pick) continue;
      exclude.add(pick.player.id);
      const origin = findMiTeamOriginTeam(this.db, pick.player.id);
      roster.push({
        playerId: pick.player.id,
        slot,
        shirtNumber: nextShirt(roster, pick.shirtNumber),
        sourceTeamId: origin?.id ?? null,
      });
    }
    setMiTeamRoster(this.save, this.db, roster);
    this.resetPack();
    this.packing = false;
    this.controlMode = "TEAM";
    this.selectedPlayerId = roster[0]?.playerId ?? null;
    this.render();
  }

  /**
   * Player shown in the left details card.
   * Sealed / opening packs never leak the candidate — show the last kept player
   * instead (or the crest only when the roster is still empty). Once unwrapped,
   * the current pull is shown until KEEP / DISCARD.
   */
  private selectedSquadPlayer(): SquadPlayer | null {
    if (this.packing && this.phase === "revealed" && this.candidate) {
      return this.candidate;
    }
    const roster = this.roster();
    // Prefer the last kept selection; fall back to the most recently added squad row.
    const id =
      (this.selectedPlayerId && roster.some((r) => r.playerId === this.selectedPlayerId)
        ? this.selectedPlayerId
        : null) ??
      roster[roster.length - 1]?.playerId ??
      null;
    if (!id) return null;
    const row = roster.find((r) => r.playerId === id);
    if (!row) return null;
    return this.squadFor(row.playerId, row.shirtNumber);
  }

  private rosterDetailsHtml(
    team: TeamRecord,
    selectedSp: SquadPlayer | null,
    selectedCols: { primary: string; secondary: string },
    slotLabel: string,
  ): string {
    if (selectedSp) {
      return `${portraitHtml(selectedSp.player, selectedSp.shirtNumber, selectedCols.primary, {
        surnameOnly: true,
        className: "kit-marker-roster",
        textColor: contrastingKitText(selectedCols.primary, selectedCols.secondary),
      })}
      <h3>${selectedSp.shirtNumber}. ${escapeHtml(kitSurname(selectedSp.player.displayName || selectedSp.player.name))}</h3>
      <div class="char-meta">${selectedSp.player.primaryPosition} · OVR ${Math.round(selectedSp.overall)}</div>
      ${profileStatsBlock(selectedSp.attrs, { compact: true, mode: this.profileView, size: 168 })}`;
    }
    // Empty squad / sealed pack — show MiTeam crest + name, not the hidden pull.
    return `${teamBadgeHtml(team, { className: "char-team-crest miteam-roster-crest" })}
      <h3>${escapeHtml(formatPlayerCardTeamName(team.name))}</h3>
      <div class="char-meta">${
        this.packing && (this.phase === "foil" || this.phase === "opening")
          ? `Pack sealed for ${escapeHtml(slotLabel)}`
          : this.packing
            ? `Pull a pack for ${escapeHtml(slotLabel)}`
            : "Open a pack to build your XI"
      }</div>`;
  }

  private sourceTeamContext(
    playerId: string,
    preferredTeamId?: string | null,
  ): {
    teamName: string;
    teamColor: string;
    teamSecondaryColor: string;
    team: TeamRecord;
  } {
    const origin = findMiTeamOriginTeam(this.db, playerId, preferredTeamId);
    if (origin) {
      return {
        teamName: origin.name,
        teamColor: origin.primaryColor,
        teamSecondaryColor: origin.secondaryColor,
        team: origin,
      };
    }
    const fallback = this.team();
    return {
      teamName: fallback.name,
      teamColor: fallback.primaryColor,
      teamSecondaryColor: fallback.secondaryColor,
      team: fallback,
    };
  }

  private coloursForPlayer(playerId: string, preferredTeamId?: string | null): {
    primary: string;
    secondary: string;
  } {
    const ctx = this.sourceTeamContext(playerId, preferredTeamId);
    return { primary: ctx.teamColor, secondary: ctx.teamSecondaryColor };
  }

  render(): void {
    const team = this.team();
    const roster = this.roster();
    const xiSlots = miteamXiSlots();
    const bySlot = new Map(roster.map((r) => [r.slot, r]));
    const form = getFormation(MITEAM_FORMATION);
    const ready = xiComplete(roster);
    const slotLabel = this.targetSlot?.startsWith("BENCH_")
      ? `BENCH ${this.targetSlot.replace("BENCH_", "")}`
      : this.targetSlot ?? "FULL";
    const selectedSp = this.selectedSquadPlayer();
    const selectedRow = selectedSp
      ? roster.find((r) => r.playerId === selectedSp.player.id)
      : null;
    const selectedCols = selectedSp
      ? this.coloursForPlayer(selectedSp.player.id, selectedRow?.sourceTeamId)
      : { primary: team.primaryColor, secondary: team.secondaryColor };

    const rosterRows = xiSlots
      .map((slot) => {
        const row = bySlot.get(slot);
        if (!row) {
          return `<div class="roster-row empty"><span class="roster-num">—</span><span class="roster-name">${slot}</span><span class="roster-pos">EMPTY</span></div>`;
        }
        const sp = this.squadFor(row.playerId, row.shirtNumber);
        const name = kitSurname(sp.player.displayName || sp.player.name);
        const on = row.playerId === this.selectedPlayerId ? " on" : "";
        return `<button type="button" class="roster-row${on}" data-miteam-player="${escapeAttr(row.playerId)}"><span class="roster-num">${row.shirtNumber}</span><span class="roster-name">${escapeHtml(name)}</span><span class="roster-pos">${slot}</span><span class="roster-role">${Math.round(sp.overall)}</span></button>`;
      })
      .join("");

    const benchHtml = miteamBenchSlotIds()
      .map((slot) => {
        const row = bySlot.get(slot);
        if (!row) {
          return `<button type="button" class="bench-card empty" data-slot="${slot}" aria-label="Empty bench"><span class="bench-empty">+</span></button>`;
        }
        const sp = this.squadFor(row.playerId, row.shirtNumber);
        const cols = this.coloursForPlayer(row.playerId, row.sourceTeamId);
        return `<button type="button" class="bench-card" data-slot="${slot}" data-miteam-player="${escapeAttr(row.playerId)}" aria-label="${escapeAttr(sp.player.name)}">${kitMarkerHtml(sp.player, row.shirtNumber, {
          ...kitMarkerColors(sp.player.primaryPosition, cols.primary, cols.secondary),
          className: "kit-marker-bench",
        })}</button>`;
      })
      .join("");

    const pitchHtml = (() => {
      const raw = form.map((slot) => {
        const pos = formationToPitchPercent(slot.x, slot.z);
        return { id: slot.id, left: pos.left, bottom: pos.bottom, pinned: slot.id === "GK" };
      });
      const laidOut = separatePitchMarkers(raw);
      return form
        .map((slot) => {
          const pos = laidOut.get(slot.id) ?? formationToPitchPercent(slot.x, slot.z);
          const row = bySlot.get(slot.id);
          if (!row) {
            return `<div class="pitch-slot empty" data-slot="${slot.id}" style="left:${pos.left}%; bottom:${pos.bottom}%"><button type="button" class="pitch-empty-label" data-slot="${slot.id}">${slot.id}</button></div>`;
          }
          const sp = this.squadFor(row.playerId, row.shirtNumber);
          const cols = this.coloursForPlayer(row.playerId, row.sourceTeamId);
          const name = escapeHtml(sp.player.name);
          return `<div class="pitch-slot" data-slot="${slot.id}" style="left:${pos.left}%; bottom:${pos.bottom}%">
            <button type="button" class="pitch-token" data-slot="${slot.id}" data-miteam-player="${escapeAttr(row.playerId)}" aria-label="${name}">
              ${kitMarkerHtml(sp.player, row.shirtNumber, {
                ...kitMarkerColors(sp.player.primaryPosition, cols.primary, cols.secondary),
              })}
            </button>
          </div>`;
        })
        .join("");
    })();

    const center =
      this.controlMode === "OPTIONS"
        ? this.optionsPanelHtml(team)
        : this.controlMode === "TEAM"
          ? `<div class="team-pitch" aria-label="MiTeam formation">
            <span class="pitch-goal-mouth pitch-goal-mouth-own" aria-hidden="true"></span>
            <span class="pitch-goal-mouth pitch-goal-mouth-opp" aria-hidden="true"></span>
            <div class="team-pitch-markings" aria-hidden="true">
              <span class="pitch-penalty pitch-penalty-own"></span>
              <span class="pitch-penalty pitch-penalty-opp"></span>
              <span class="pitch-six pitch-six-own"></span>
              <span class="pitch-six pitch-six-opp"></span>
            </div>
            ${pitchHtml}
          </div>`
          : `<div class="team-pitch team-pitch-panel miteam-pack-well" aria-label="Player select">
            ${this.playerWellHtml(slotLabel)}
          </div>`;

    this.root.innerHTML = `
      <div class="char-panel char-panel-team miteam-panel">
        <div class="team-select-head">
          ${this.headerHtml(team)}
          <div class="formation-toolbar" role="toolbar" aria-label="MiTeam controls">
            <button type="button" class="formation-chip" data-miteam="fill">FILL</button>
            <button type="button" class="formation-chip" data-miteam="restart">RESTART</button>
            <button type="button" class="formation-chip danger" data-miteam="delete">DELETE</button>
          </div>
        </div>
        <div class="team-select-body">
          <aside class="team-roster">
            <div class="team-roster-card">
              ${this.rosterDetailsHtml(team, selectedSp, selectedCols, slotLabel)}
            </div>
            <div class="team-roster-list">${rosterRows}</div>
          </aside>
          ${center}
          <aside class="team-bench">
            <div class="team-bench-title">SUBSTITUTES</div>
            <div class="team-bench-list">${benchHtml}</div>
          </aside>
        </div>
        <div class="char-modes">
          <button type="button" data-miteam="mode-player" class="${this.controlMode === "PLAYER" ? "on" : ""}" aria-pressed="${this.controlMode === "PLAYER" ? "true" : "false"}">PLAYER SELECT</button>
          <button type="button" data-miteam="mode-team" class="${this.controlMode === "TEAM" ? "on" : ""}" aria-pressed="${this.controlMode === "TEAM" ? "true" : "false"}">TEAM SELECT</button>
          <button type="button" data-miteam="mode-options" class="${this.controlMode === "OPTIONS" ? "on" : ""}" aria-pressed="${this.controlMode === "OPTIONS" ? "true" : "false"}">MITEAM</button>
        </div>
        <div class="char-nav miteam-nav">
          <button type="button" data-miteam="back">BACK</button>
          <button type="button" class="primary ${ready ? "on" : ""}" data-miteam="start" ${ready ? "" : "disabled"}>START</button>
        </div>
      </div>
    `;

    if (this.controlMode === "PLAYER" && !this.cardEditing) {
      const card = this.root.querySelector<HTMLElement>(".player-card");
      if (card) applyPlayerCardFlip(card, this.cardFlipY);
    }
    requestAnimationFrame(() => fitKitSurnameElements(this.root));
  }

  private headerHtml(team: TeamRecord): string {
    if (this.controlMode === "OPTIONS") {
      return `<div class="char-team-title miteam-title-row">
        <div class="miteam-crest-wrap">
          <button type="button" class="miteam-crest-btn" data-miteam="crest-toggle" aria-label="Choose club emblem" aria-expanded="${this.crestPickerOpen ? "true" : "false"}" title="Club emblem">
            ${teamBadgeHtml(team, { className: "char-team-crest miteam-crest-preview" })}
          </button>
          ${this.crestPickerOpen ? this.crestPickerHtml() : ""}
        </div>
        <div class="miteam-name-row">
          <input id="miteam-club-name" data-miteam-name type="text" maxlength="28" value="${escapeAttr(this.clubName())}" aria-label="MiTeam name" placeholder="Name" />
        </div>
      </div>`;
    }
    return `<div class="char-team-title">
      ${teamBadgeHtml(team, { className: "char-team-crest" })}
      <div class="eyebrow">${escapeHtml(formatPlayerCardTeamName(team.name))}</div>
    </div>`;
  }

  private optionsPanelHtml(team: TeamRecord): string {
    const primary = this.save.data.miteam?.primaryColor ?? team.primaryColor ?? MITEAM_DEFAULT_PRIMARY;
    const secondary =
      this.save.data.miteam?.secondaryColor ?? team.secondaryColor ?? MITEAM_DEFAULT_SECONDARY;
    return `<div class="team-pitch team-pitch-panel miteam-options-panel" aria-label="MiTeam options">
      <div class="pitch-overlay-card miteam-options-card">
        <h3 class="miteam-options-title">MiTeam</h3>
        <p class="hint">Name, emblem, and club colours for your side. Player cards and pitch counters keep each player&rsquo;s original club colours.</p>
        <div class="miteam-options-row">
          <div class="miteam-crest-wrap">
            <button type="button" class="miteam-crest-btn" data-miteam="crest-toggle" aria-label="Choose club emblem" aria-expanded="${this.crestPickerOpen ? "true" : "false"}">
              ${teamBadgeHtml(team, { className: "char-team-crest miteam-crest-preview" })}
            </button>
            ${this.crestPickerOpen ? this.crestPickerHtml() : ""}
          </div>
          <input data-miteam-name type="text" maxlength="28" value="${escapeAttr(this.clubName())}" aria-label="MiTeam name" placeholder="Name" />
        </div>
        <div class="miteam-colour-row">
          <label class="miteam-colour-field">Primary
            <input type="color" data-miteam-primary value="${escapeAttr(primary)}" />
          </label>
          <label class="miteam-colour-field">Secondary
            <input type="color" data-miteam-secondary value="${escapeAttr(secondary)}" />
          </label>
        </div>
      </div>
    </div>`;
  }

  private playerWellHtml(slotLabel: string): string {
    if (this.packing && this.targetSlot) {
      return this.packWellHtml(slotLabel);
    }
    const sp = this.selectedSquadPlayer();
    if (!sp) {
      const empty = nextEmptySlot(this.roster());
      return `<div class="pitch-overlay-card miteam-full-msg">
        <p>${empty ? "Open a pack to build your XI." : "Squad complete."}</p>
        <div class="miteam-keep-row">
          <button type="button" class="player-card-action primary" data-miteam="card-pack" ${empty ? "" : "disabled"}>PACK</button>
        </div>
      </div>`;
    }
    const row = this.roster().find((r) => r.playerId === sp.player.id);
    const source = this.sourceTeamContext(sp.player.id, row?.sourceTeamId);
    const card = playerCardShellHtml(sp, source, {
      editing: this.cardEditing,
      editDirty: false,
      flipped: false,
      flipY: this.cardFlipY,
      profileView: this.profileView,
      profileSize: 148,
      imagePaths: [],
    });
    // Replace default single EDIT head with PACK (left) + EDIT/CARD (right).
    const head = `<div class="player-card-shell-head miteam-card-head">
      <button type="button" class="player-card-action" data-miteam="card-pack">PACK</button>
      <button type="button" class="player-card-action${this.cardEditing ? "" : ""}" data-miteam="${this.cardEditing ? "card-view" : "card-edit"}">${this.cardEditing ? "CARD" : "EDIT"}</button>
    </div>`;
    const withHead = card.replace(/<div class="player-card-shell-head">[\s\S]*?<\/div>/, head);
    const cleaned = withHead.replace(/<div class="player-card-flip-nav"[\s\S]*?<\/div>/, "");
    return `<div class="pitch-overlay-card player-pitch-select miteam-reveal">
      <div class="miteam-reveal-stage">
        <div class="miteam-reveal-card-wrap">
          ${cleaned}
        </div>
      </div>
    </div>`;
  }

  /** Revealed sports card HTML (no KEEP row) — also mounted under the sealed foil. */
  private packRevealCardHtml(candidate: SquadPlayer): string {
    const source = this.sourceTeamContext(candidate.player.id);
    const card = playerCardShellHtml(candidate, source, {
      editing: false,
      editDirty: false,
      flipped: false,
      flipY: this.cardFlipY,
      profileView: this.profileView,
      profileSize: 148,
      imagePaths: [],
    });
    return card
      .replace(/<div class="player-card-shell-head">[\s\S]*?<\/div>/, "")
      .replace(/<div class="player-card-flip-nav"[\s\S]*?<\/div>/, "");
  }

  private packWellHtml(slotLabel: string): string {
    const candidate = this.candidate;
    if (!candidate) {
      return `<div class="pitch-overlay-card miteam-full-msg">
        <p>No players left in this filter for ${escapeHtml(slotLabel)}.</p>
        ${this.filterSelectHtml()}
        <div class="miteam-keep-row">
          <button type="button" class="player-card-action" data-miteam="discard">TRY AGAIN</button>
        </div>
      </div>`;
    }
    if (this.phase === "foil" || this.phase === "opening") {
      const tier = packTierForOverall(candidate.overall);
      const opening = this.phase === "opening" ? " is-opening" : "";
      // Preload card under the foil (hidden while sealed — serrations must not show it).
      return `<div class="pitch-overlay-card miteam-pack-stage miteam-pack-layered${opening}">
        <div class="miteam-pack-under" aria-hidden="true">
          ${this.packRevealCardHtml(candidate)}
        </div>
        <div class="miteam-pack-foil-layer">
          <div class="miteam-slot-hint">Pack for <b>${escapeHtml(slotLabel)}</b></div>
          ${miteamFoilHtml(tier)}
        </div>
      </div>`;
    }
    // Same under-card footprint as the sealed pack — no size jump after open.
    return `<div class="pitch-overlay-card miteam-pack-stage miteam-pack-layered is-revealed">
      <div class="miteam-pack-under miteam-pack-revealed">
        ${this.packRevealCardHtml(candidate)}
        ${this.keepDiscardRowHtml()}
      </div>
    </div>`;
  }

  private crestPickerHtml(): string {
    const current = this.save.data.miteam?.badgeAsset?.trim() || MITEAM_DEFAULT_BADGE;
    const choices = miteamCrestChoices(this.db);
    const tiles = choices
      .map((c) => {
        const on = c.url === current ? " on" : "";
        const src = escapeAttr(assetUrl(c.url));
        return `<button type="button" class="miteam-crest-choice${on}" data-miteam="crest-pick" data-crest="${escapeAttr(c.url)}" title="${escapeAttr(c.label)}" aria-label="${escapeAttr(c.label)}">
          <img src="${src}" alt="" loading="lazy" onerror="this.closest('button')?.remove()" />
        </button>`;
      })
      .join("");
    return `<div class="miteam-crest-popover" role="dialog" aria-label="Club emblem">
      <div class="miteam-crest-popover-head">
        <span>Emblem</span>
        <button type="button" class="miteam-crest-close" data-miteam="crest-close" aria-label="Close">×</button>
      </div>
      <label class="miteam-crest-upload player-card-action">Upload
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-miteam-crest-upload hidden />
      </label>
      <div class="miteam-crest-grid">${tiles}</div>
    </div>`;
  }

  private keepDiscardRowHtml(): string {
    return `<div class="miteam-keep-row" role="group" aria-label="Keep or discard">
      <button type="button" class="player-card-action" data-miteam="discard">DISCARD</button>
      ${this.filterSelectHtml()}
      <button type="button" class="player-card-action primary" data-miteam="keep">KEEP</button>
    </div>`;
  }

  private filterSelectHtml(): string {
    const clubs = clubsInPool(this.db);
    const cur = serializeFilter(this.filter);
    const leagueOpts = MITEAM_FILTER_LEAGUES.map(
      (l) =>
        `<option value="league:${l}" ${cur === `league:${l}` ? "selected" : ""}>${MITEAM_FILTER_LEAGUE_LABEL[l]}</option>`,
    ).join("");
    const clubOpts = clubs
      .map(
        (c) =>
          `<option value="club:${escapeAttr(c.teamId)}" ${cur === `club:${c.teamId}` ? "selected" : ""}>${escapeHtml(c.label)}</option>`,
      )
      .join("");
    return `<select data-miteam-filter aria-label="Pool filter">
      <option value="all" ${cur === "all" ? "selected" : ""}>All</option>
      ${leagueOpts}
      <option value="classic" ${cur === "classic" ? "selected" : ""}>Classic</option>
      ${clubOpts}
    </select>`;
  }

  private squadFor(playerId: string, shirtNumber: number): SquadPlayer {
    const fromDb = this.db.getSquad(MITEAM_TEAM_ID).find((s) => s.player.id === playerId);
    if (fromDb) return fromDb;
    const player = this.db.players.get(playerId);
    if (!player) {
      throw new Error(`Missing player ${playerId}`);
    }
    for (const team of this.db.teams.values()) {
      const hit = this.db.getSquad(team.id).find((s) => s.player.id === playerId);
      if (hit) {
        return { ...hit, shirtNumber, membership: { ...hit.membership, shirtNumber, teamId: MITEAM_TEAM_ID } };
      }
    }
    return {
      player,
      membership: {
        playerId,
        teamId: MITEAM_TEAM_ID,
        shirtNumber,
        squadRole: "FIRST_TEAM",
      },
      attrs: player,
      overall: player.overall ?? 70,
      shirtNumber,
    };
  }
}

function nextShirt(roster: MiTeamRosterSlot[], preferred: number): number {
  const used = new Set(roster.map((r) => r.shirtNumber));
  let n = Math.max(1, Math.min(99, preferred || 1));
  for (let i = 0; i < 99; i++) {
    if (!used.has(n)) return n;
    n = (n % 99) + 1;
  }
  return preferred || 1;
}
