import type { GameDatabase } from "../core/Database";
import { portraitHtml } from "./Portrait";
import { imageLabel, listPlayerImages, uploadPlayerImage } from "./playerImages";

export class PlayerDatabaseEditor {
  readonly root: HTMLElement;
  private imagePaths: string[] = [];
  private query = "";
  private focusSearchOnPaint = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "editor-screen";
    parent.appendChild(this.root);
    this.hide();
  }

  async render(db: GameDatabase): Promise<void> {
    this.root.hidden = false;
    this.query = "";
    this.focusSearchOnPaint = true;
    this.root.innerHTML = `
      <div class="editor-card wide">
        <h2>Player Database</h2>
        <p class="hint">Loading player images…</p>
      </div>
    `;
    try {
      this.imagePaths = await listPlayerImages();
    } catch {
      this.imagePaths = [];
    }
    this.paint(db);
  }

  private paint(db: GameDatabase): void {
    const players = [...db.players.values()];
    const rows = players
      .map((p) => {
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
        const search = [p.id, p.name, p.primaryPosition, teamNames, teams].join(" ").toLowerCase();
        const shirt = memberships[0]?.shirtNumber ?? 0;
        const current = p.appearance?.portraitAsset?.trim() || "";
        return `<tr data-player-row="${p.id}" data-search="${escapeAttr(search)}">
          <td class="player-portrait-cell">
            <div class="player-portrait-preview" data-preview-for="${p.id}">${portraitHtml(p, shirt)}</div>
            <select data-pid="${p.id}" data-field="portraitAsset" title="Portrait from images/">
              ${this.portraitOptions(current)}
            </select>
            <label class="portrait-upload-btn">
              Upload
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-pid="${p.id}" data-upload hidden />
            </label>
          </td>
          <td>${p.id}</td>
          <td><input data-pid="${p.id}" data-field="name" value="${escapeAttr(p.name)}" /></td>
          <td>${p.primaryPosition}</td>
          <td><input data-pid="${p.id}" data-field="passing" type="number" min="1" max="100" value="${p.passing}" /></td>
          <td><input data-pid="${p.id}" data-field="vision" type="number" min="1" max="100" value="${p.vision}" /></td>
          <td><input data-pid="${p.id}" data-field="finishing" type="number" min="1" max="100" value="${p.finishing}" /></td>
          <td><input data-pid="${p.id}" data-field="pace" type="number" min="1" max="100" value="${p.pace}" /></td>
          <td><input data-pid="${p.id}" data-field="acceleration" type="number" min="1" max="100" value="${p.acceleration ?? ""}" placeholder="~pace" /></td>
          <td><input data-pid="${p.id}" data-field="attackingAwareness" type="number" min="1" max="100" value="${p.attackingAwareness ?? ""}" placeholder="~vis" /></td>
          <td><input data-pid="${p.id}" data-field="defensiveAwareness" type="number" min="1" max="100" value="${p.defensiveAwareness ?? ""}" placeholder="~def" /></td>
          <td><input data-pid="${p.id}" data-field="heightCm" type="number" min="150" max="220" value="${p.heightCm ?? ""}" /></td>
          <td class="muted">${teams}</td>
        </tr>`;
      })
      .join("");
    this.root.innerHTML = `
      <div class="editor-card wide">
        <h2>Player Database</h2>
        <p class="hint">Canonical IDs. Full mental set (form, vision, composure, focus, awareness) is editable in Formation → right-click player. Blank optional fields use compatibility defaults.</p>
        <div class="player-db-toolbar">
          <label class="player-db-search">
            <span>Search</span>
            <input id="player-db-search" type="search" placeholder="Name, ID, position, club…" value="${escapeAttr(this.query)}" autocomplete="off" />
          </label>
          <span class="player-db-count muted" data-player-count></span>
        </div>
        <div class="table-wrap player-db-table">
          <table>
            <thead><tr><th>Portrait</th><th>ID</th><th>Name</th><th>Pos</th><th>Pass</th><th>Vis</th><th>Fin</th><th>Pace</th><th>Acc</th><th>AttAw</th><th>DefAw</th><th>Ht</th><th>Memberships</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="row-btns">
          <button data-act="save">Save</button>
          <button data-act="back">Back</button>
        </div>
      </div>
    `;
    this.bindPortraitControls(db);
    this.bindSearch(players.length);
    this.applyFilter();
  }

  private bindSearch(total: number): void {
    const input = this.root.querySelector("#player-db-search") as HTMLInputElement | null;
    if (!input) return;
    input.addEventListener("input", () => {
      this.query = input.value;
      this.applyFilter();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.value = "";
        this.query = "";
        this.applyFilter();
      }
    });
    const count = this.root.querySelector("[data-player-count]");
    if (count) count.setAttribute("data-total", String(total));
    if (this.focusSearchOnPaint) {
      this.focusSearchOnPaint = false;
      queueMicrotask(() => input.focus());
    }
  }

  private applyFilter(): void {
    const tokens = this.query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let visible = 0;
    this.root.querySelectorAll<HTMLTableRowElement>("tr[data-player-row]").forEach((row) => {
      const hay = row.dataset.search ?? "";
      const show = tokens.every((token) => hay.includes(token));
      row.hidden = !show;
      if (show) visible += 1;
    });
    const count = this.root.querySelector("[data-player-count]");
    const total = count?.getAttribute("data-total") ?? String(visible);
    if (count) {
      count.textContent = tokens.length
        ? `${visible} of ${total} players`
        : `${total} players`;
    }
  }

  private portraitOptions(current: string): string {
    const paths = [...this.imagePaths];
    if (current && !paths.includes(current)) paths.unshift(current);
    const opts = [`<option value="">(none)</option>`];
    for (const path of paths) {
      const selected = path === current ? " selected" : "";
      opts.push(`<option value="${escapeAttr(path)}"${selected}>${escapeHtml(imageLabel(path))}</option>`);
    }
    return opts.join("");
  }

  private bindPortraitControls(db: GameDatabase): void {
    this.root.querySelectorAll("select[data-field='portraitAsset']").forEach((el) => {
      const select = el as HTMLSelectElement;
      select.addEventListener("change", () => {
        const pid = select.dataset.pid ?? "";
        const player = db.players.get(pid);
        if (!player) return;
        const value = select.value.trim();
        if (!player.appearance) player.appearance = {};
        player.appearance.portraitAsset = value || null;
        this.refreshPreview(db, pid);
      });
    });

    this.root.querySelectorAll("input[data-upload]").forEach((el) => {
      const input = el as HTMLInputElement;
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        const pid = input.dataset.pid ?? "";
        if (!file || !pid) return;
        try {
          const path = await uploadPlayerImage(file);
          if (!this.imagePaths.includes(path)) this.imagePaths.push(path);
          this.imagePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          const player = db.players.get(pid);
          if (player) {
            if (!player.appearance) player.appearance = {};
            player.appearance.portraitAsset = path;
          }
          this.paint(db);
          const rowSelect = this.root.querySelector(
            `select[data-pid="${CSS.escape(pid)}"][data-field="portraitAsset"]`,
          ) as HTMLSelectElement | null;
          if (rowSelect) rowSelect.value = path;
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Image upload failed");
        } finally {
          input.value = "";
        }
      });
    });
  }

  private refreshPreview(db: GameDatabase, playerId: string): void {
    const player = db.players.get(playerId);
    const preview = this.root.querySelector(`[data-preview-for="${CSS.escape(playerId)}"]`);
    if (!player || !preview) return;
    const shirt = db.membershipsForPlayer(playerId)[0]?.shirtNumber ?? 0;
    preview.innerHTML = portraitHtml(player, shirt);
  }

  hide(): void {
    this.root.hidden = true;
  }

  apply(db: GameDatabase): void {
    this.root.querySelectorAll("input[data-pid]:not([data-upload])").forEach((el) => {
      const input = el as HTMLInputElement;
      const p = db.players.get(input.dataset.pid ?? "");
      const field = input.dataset.field;
      if (!p || !field) return;
      if (input.type === "number") {
        const raw = input.value.trim();
        if (!raw) {
          // Clear optional inferred fields so resolveAttributes can fill defaults.
          if (field !== "passing" && field !== "finishing" && field !== "pace" && field !== "vision" && field !== "name") {
            delete (p as unknown as Record<string, unknown>)[field];
          }
          return;
        }
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        (p as unknown as Record<string, number>)[field] = value;
        return;
      }
      (p as unknown as Record<string, string>)[field] = input.value;
    });
    this.root.querySelectorAll("select[data-field='portraitAsset']").forEach((el) => {
      const select = el as HTMLSelectElement;
      const p = db.players.get(select.dataset.pid ?? "");
      if (!p) return;
      if (!p.appearance) p.appearance = {};
      const value = select.value.trim();
      p.appearance.portraitAsset = value || null;
    });
  }
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
