import type { GameDatabase, SquadPlayer } from "../core/Database";
import type { TeamMembership } from "../data/schema";
import {
  applyPhysicalToAppearance,
  deriveOverall,
  resolveAttributes,
} from "../football/players/PlayerStats";
import { nextProfileStatsMode, type ProfileStatsMode } from "./ProfileHex";
import { listPlayerImages, uploadPlayerImage } from "./playerImages";
import { titleAttr } from "./infoOverlays";
import { fitKitSurnameElements } from "./Portrait";
import {
  applyPlayerCardFlip,
  escapeAttr,
  escapeHtml,
  isPlayerCardShowingBack,
  nextPlayerCardFlipY,
  playerCardFlipSideFromClientX,
  playerCardShellHtml,
  readSquadPlayerEditFromHost,
  type PlayerCardTeamContext,
  type SquadPlayerEdit,
} from "./playerCardShared";

type IndexedPlayer = {
  id: string;
  search: string;
  label: string;
  meta: string;
  overall: number;
};

/**
 * Main Menu → Database → Player Database.
 * Searchable list + the same sports card / EDIT·CARD·SAVE flow as Formation.
 */
export class PlayerDatabaseEditor {
  readonly root: HTMLElement;
  private db: GameDatabase | null = null;
  private imagePaths: string[] = [];
  private query = "";
  private focusSearchOnPaint = false;
  private selectedId: string | null = null;
  private filteredIds: string[] = [];
  private cardEditing = false;
  private editDirty = false;
  private cardFlipped = false;
  private cardFlipY = 0;
  private profileView: ProfileStatsMode = "hex";
  /** Persist card SAVE into player + membership records (and save file). */
  onPlayerSave: ((edit: SquadPlayerEdit) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "editor-screen";
    parent.appendChild(this.root);
    this.hide();
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("input", (e) => this.onFieldEvent(e));
    this.root.addEventListener("change", (e) => {
      this.onFieldEvent(e);
      void this.onPortraitChange(e);
    });
  }

  async render(db: GameDatabase): Promise<void> {
    this.db = db;
    this.root.hidden = false;
    this.query = "";
    this.focusSearchOnPaint = true;
    this.cardEditing = false;
    this.editDirty = false;
    this.resetCardFlip();
    this.root.innerHTML = `
      <div class="editor-card player-db-shell">
        <h2>Player Database</h2>
        <p class="hint">Loading player images…</p>
      </div>
    `;
    try {
      this.imagePaths = await listPlayerImages();
    } catch {
      this.imagePaths = [];
    }
    const first = [...db.players.keys()].sort((a, b) => a.localeCompare(b))[0] ?? null;
    this.selectedId = first;
    this.paint();
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Global Save still flushes db → localStorage; card SAVE already mutates records. */
  apply(_db: GameDatabase): void {
    // no-op — edits commit through the card SAVE button
  }

  private paint(): void {
    const db = this.db;
    if (!db) return;
    const index = this.buildIndex(db);
    const tokens = this.query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const visible = index.filter((row) => tokens.every((t) => row.search.includes(t)));
    this.filteredIds = visible.map((v) => v.id);
    if (this.selectedId && !this.filteredIds.includes(this.selectedId)) {
      this.selectedId = this.filteredIds[0] ?? null;
      this.cardEditing = false;
      this.editDirty = false;
      this.resetCardFlip();
    } else if (!this.selectedId && this.filteredIds.length) {
      this.selectedId = this.filteredIds[0]!;
    }

    const countLabel = tokens.length
      ? `${visible.length} of ${index.length} players`
      : `${index.length} players`;

    const list = visible
      .map((row) => {
        const on = row.id === this.selectedId ? " on" : "";
        return `<button type="button" class="player-db-row${on}" data-player-pick="${escapeAttr(row.id)}">
          <span class="player-db-row-name">${escapeHtml(row.label)}</span>
          <span class="player-db-row-meta">${escapeHtml(row.meta)}</span>
          <span class="player-db-row-ovr">${row.overall}</span>
        </button>`;
      })
      .join("");

    const cardHost = this.selectedId
      ? this.cardHtml(db, this.selectedId)
      : `<div class="player-db-empty hint">No players match this search.</div>`;

    this.root.innerHTML = `
      <div class="editor-card player-db-shell">
        <h2>Player Database</h2>
        <p class="hint">Search a player, open their card, then EDIT details and statistics. SAVE writes to the player and team membership records.</p>
        <div class="player-db-layout">
          <aside class="player-db-sidebar">
            <div class="player-db-toolbar">
              <label class="player-db-search">
                <span>Search</span>
                <input id="player-db-search" type="search" placeholder="Name, ID, position, club…" value="${escapeAttr(this.query)}" autocomplete="off" />
              </label>
              <span class="player-db-count muted" data-player-count>${escapeHtml(countLabel)}</span>
            </div>
            <div class="player-db-results" role="listbox" aria-label="Players">${list || `<p class="hint">No matches.</p>`}</div>
          </aside>
          <section class="player-db-card-host" aria-label="Player card">${cardHost}</section>
        </div>
        <div class="row-btns">
          <button type="button" data-act="save">Save</button>
          <button type="button" data-act="back">Back</button>
        </div>
      </div>
    `;

    const input = this.root.querySelector<HTMLInputElement>("#player-db-search");
    if (input) {
      input.addEventListener("input", () => {
        this.query = input.value;
        this.paint();
        const again = this.root.querySelector<HTMLInputElement>("#player-db-search");
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          input.value = "";
          this.query = "";
          this.paint();
        }
      });
      if (this.focusSearchOnPaint) {
        this.focusSearchOnPaint = false;
        queueMicrotask(() => input.focus());
      }
    }
    requestAnimationFrame(() => fitKitSurnameElements(this.root));
  }

  private buildIndex(db: GameDatabase): IndexedPlayer[] {
    const rows: IndexedPlayer[] = [];
    for (const p of db.players.values()) {
      const memberships = db.membershipsForPlayer(p.id);
      const teams = memberships
        .map((m) => {
          const team = db.teams.get(m.teamId);
          return `${team?.abbreviation ?? m.teamId} #${m.shirtNumber}`;
        })
        .join(", ");
      const teamNames = memberships
        .map((m) => {
          const team = db.teams.get(m.teamId);
          return [team?.name, team?.abbreviation, m.teamId, String(m.shirtNumber)].filter(Boolean).join(" ");
        })
        .join(" ");
      const sp = this.resolvePlayer(db, p.id);
      const overall = sp ? Math.round(sp.overall) : 0;
      rows.push({
        id: p.id,
        search: [p.id, p.name, p.displayName, p.primaryPosition, teamNames, teams].join(" ").toLowerCase(),
        label: p.displayName || p.name,
        meta: `${p.primaryPosition}${teams ? ` · ${teams}` : ""}`,
        overall,
      });
    }
    rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return rows;
  }

  private resolvePlayer(db: GameDatabase, playerId: string): SquadPlayer | null {
    const memberships = db.membershipsForPlayer(playerId);
    if (memberships[0]) return db.resolveSquadPlayer(memberships[0]);
    const player = db.players.get(playerId);
    if (!player) return null;
    const membership: TeamMembership = {
      playerId,
      teamId: "",
      shirtNumber: 0,
      squadRole: "FIRST_TEAM",
    };
    const attrs = resolveAttributes(player);
    const overall = deriveOverall(player.primaryPosition, attrs);
    return {
      player,
      membership,
      attrs: { ...player, ...attrs, overall },
      overall,
      shirtNumber: 0,
    };
  }

  private teamContext(db: GameDatabase, sp: SquadPlayer): PlayerCardTeamContext {
    const teamId = sp.membership.teamId;
    const team = teamId ? db.teams.get(teamId) ?? null : null;
    return {
      teamName: team?.name ?? "Free agent",
      teamColor: team?.primaryColor ?? "#007A3D",
      teamSecondaryColor: team?.secondaryColor ?? "#C5A572",
      team,
    };
  }

  private cardHtml(db: GameDatabase, playerId: string): string {
    const sp = this.resolvePlayer(db, playerId);
    if (!sp) return `<div class="player-db-empty hint">Player not found.</div>`;
    const team = this.teamContext(db, sp);
    return playerCardShellHtml(sp, team, {
      editing: this.cardEditing,
      editDirty: this.editDirty,
      flipped: this.cardFlipped,
      flipY: this.cardFlipY,
      profileView: this.profileView,
      imagePaths: this.imagePaths,
    });
  }

  private resetCardFlip(): void {
    this.cardFlipped = false;
    this.cardFlipY = 0;
  }

  private flipCardFromPointer(card: HTMLElement, clientX: number): void {
    if (this.cardEditing) return;
    this.cardFlipY = nextPlayerCardFlipY(this.cardFlipY, playerCardFlipSideFromClientX(card, clientX));
    this.cardFlipped = isPlayerCardShowingBack(this.cardFlipY);
    for (const el of this.root.querySelectorAll<HTMLElement>(".player-card")) {
      applyPlayerCardFlip(el, this.cardFlipY);
    }
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>("[data-player-pick]");
    if (pick && this.root.contains(pick)) {
      e.preventDefault();
      e.stopPropagation();
      const id = pick.getAttribute("data-player-pick");
      if (!id || id === this.selectedId) return;
      this.selectedId = id;
      this.cardEditing = false;
      this.editDirty = false;
      this.resetCardFlip();
      this.paint();
      return;
    }

    const flip = t.closest<HTMLElement>("[data-char='card-flip']");
    if (flip && this.root.contains(flip)) {
      e.preventDefault();
      e.stopPropagation();
      const dir = flip.getAttribute("data-dir") === "prev" ? -1 : 1;
      this.stepPlayer(dir);
      return;
    }

    const act = t.closest<HTMLElement>("[data-char='card-edit'], [data-char='card-view'], [data-char='card-save']");
    if (act && this.root.contains(act)) {
      e.preventDefault();
      e.stopPropagation();
      const kind = act.getAttribute("data-char");
      if (kind === "card-edit") {
        this.cardEditing = true;
        this.editDirty = false;
        this.resetCardFlip();
        this.paint();
      } else if (kind === "card-view") {
        this.cardEditing = false;
        this.editDirty = false;
        this.resetCardFlip();
        this.paint();
      } else if (kind === "card-save") {
        this.commitEdit();
      }
      return;
    }

    const toggle = t.closest<HTMLElement>("[data-char='profile-toggle']");
    if (toggle && this.root.contains(toggle)) {
      e.preventDefault();
      e.stopPropagation();
      this.profileView = nextProfileStatsMode(this.profileView);
      this.paint();
      return;
    }

    const face = t.closest<HTMLElement>("[data-char='card-face']");
    if (face && this.root.contains(face) && !this.cardEditing) {
      e.preventDefault();
      e.stopPropagation();
      this.flipCardFromPointer(face, e.clientX);
    }
  }

  private onFieldEvent(e: Event): void {
    if (!this.cardEditing || this.editDirty) return;
    const el = e.target as HTMLElement | null;
    if (!el?.closest?.("[data-edit-field], [data-edit-stat], [data-edit-upload]")) return;
    this.editDirty = true;
    const btn = this.root.querySelector(".player-card-action");
    if (btn) {
      btn.outerHTML = `<button type="button" class="player-card-action primary" data-char="card-save"${titleAttr("Save player changes")}>SAVE</button>`;
    }
  }

  private async onPortraitChange(e: Event): Promise<void> {
    const target = e.target as HTMLElement | null;
    if (!target || !this.db || !this.selectedId) return;
    const upload = target.closest<HTMLInputElement>("input[data-edit-upload]");
    if (upload?.files?.[0]) {
      try {
        const path = await uploadPlayerImage(upload.files[0]);
        if (!this.imagePaths.includes(path)) this.imagePaths.push(path);
        this.imagePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const player = this.db.players.get(this.selectedId);
        if (player) {
          if (!player.appearance) player.appearance = {};
          player.appearance.portraitAsset = path;
        }
        this.editDirty = true;
        this.paint();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Image upload failed");
      } finally {
        upload.value = "";
      }
      return;
    }
    const select = target.closest<HTMLSelectElement>("select[data-edit-field='portraitAsset']");
    if (select) {
      const player = this.db.players.get(this.selectedId);
      if (!player) return;
      if (!player.appearance) player.appearance = {};
      player.appearance.portraitAsset = select.value.trim() || null;
      this.editDirty = true;
      const btn = this.root.querySelector(".player-card-action");
      if (btn) {
        btn.outerHTML = `<button type="button" class="player-card-action primary" data-char="card-save"${titleAttr("Save player changes")}>SAVE</button>`;
      }
    }
  }

  private stepPlayer(delta: number): void {
    if (!this.filteredIds.length || !this.selectedId) return;
    const i = this.filteredIds.indexOf(this.selectedId);
    if (i < 0) return;
    const next = this.filteredIds[(i + delta + this.filteredIds.length) % this.filteredIds.length]!;
    this.selectedId = next;
    this.editDirty = false;
    this.resetCardFlip();
    this.paint();
  }

  private commitEdit(): void {
    const db = this.db;
    if (!db || !this.selectedId) return;
    const sp = this.resolvePlayer(db, this.selectedId);
    if (!sp) return;
    const edit = readSquadPlayerEditFromHost(this.root, sp, sp.membership.teamId || "");
    this.applyEditLocally(db, edit);
    this.onPlayerSave?.(edit);
    this.cardEditing = false;
    this.editDirty = false;
    this.resetCardFlip();
    this.paint();
  }

  private applyEditLocally(db: GameDatabase, edit: SquadPlayerEdit): void {
    const player = db.players.get(edit.playerId);
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
    player.overall = deriveOverall(player.primaryPosition, player);
    if (edit.teamId) {
      for (const m of db.memberships) {
        if (m.playerId === edit.playerId && m.teamId === edit.teamId) {
          m.shirtNumber = edit.shirtNumber;
        }
      }
    } else {
      const first = db.membershipsForPlayer(edit.playerId)[0];
      if (first) first.shirtNumber = edit.shirtNumber;
    }
  }
}
