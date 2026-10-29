import {
  DEFAULT_TABLE_CONFIG,
  normalizeTableConfig,
  type TableAIDifficulty,
  type TableLayoutId,
  type TableMatchConfig,
  type TableOpponent,
} from "../football/table";

export class TableSetupMenu {
  readonly root: HTMLElement;
  private cfg: TableMatchConfig = { ...DEFAULT_TABLE_CONFIG };
  onStart: ((cfg: TableMatchConfig) => void) | null = null;
  onCancel: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "table-setup-menu";
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.ensureStyles();
    this.root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest("[data-act]")?.getAttribute("data-act");
      if (act === "start") {
        this.cfg = this.read();
        this.onStart?.(this.cfg);
      } else if (act === "cancel") {
        this.onCancel?.();
      }
    });
  }

  private ensureStyles(): void {
    if (document.getElementById("table-setup-css")) return;
    const style = document.createElement("style");
    style.id = "table-setup-css";
    style.textContent = `
      .table-setup-menu {
        position: absolute; inset: 0; z-index: 60;
        display: flex; align-items: center; justify-content: center;
        background: rgba(8,6,4,.72); backdrop-filter: blur(4px);
        font-family: "Segoe UI", system-ui, sans-serif; color: #f3efe6;
      }
      .table-setup-menu[hidden] { display: none !important; }
      .table-setup-card {
        width: min(440px, 92vw); padding: 1.4rem 1.5rem 1.2rem;
        background: linear-gradient(160deg, #2a2218, #1a1510);
        border: 1px solid rgba(255,220,160,.18); border-radius: 10px;
        box-shadow: 0 18px 48px rgba(0,0,0,.45);
      }
      .table-setup-card h2 { margin: 0 0 0.35rem; font-size: 1.35rem; letter-spacing: 0.06em; }
      .table-setup-card .hint { opacity: 0.7; font-size: 0.82rem; margin-bottom: 1rem; }
      .table-setup-card label { display: block; margin: 0.55rem 0 0.2rem; font-size: 0.78rem; opacity: 0.85; }
      .table-setup-card select, .table-setup-card input[type="number"] {
        width: 100%; padding: 0.4rem 0.5rem; border-radius: 6px;
        border: 1px solid rgba(255,255,255,.15); background: #12100c; color: inherit;
      }
      .table-setup-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
      .table-setup-actions { display: flex; gap: 0.6rem; margin-top: 1.15rem; }
      .table-setup-actions button {
        flex: 1; padding: 0.55rem; border-radius: 6px; cursor: pointer;
        border: 1px solid rgba(255,255,255,.2); background: #3a3024; color: inherit; font-weight: 600;
      }
      .table-setup-actions button.primary { background: #6a5230; border-color: rgba(255,210,120,.35); }
    `;
    document.head.appendChild(style);
  }

  open(initial?: Partial<TableMatchConfig>): void {
    this.cfg = normalizeTableConfig(initial);
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  private render(): void {
    const c = this.cfg;
    const menDisabled = c.layoutId !== "OPEN_CUSTOM" ? "disabled" : "";
    this.root.innerHTML = `
      <div class="table-setup-card">
        <h2>TABLE FOOTBALL</h2>
        <p class="hint">Rods, twist &amp; spin — French baby-foot or modern. AI or hotseat 2P.</p>
        <label>Table layout
          <select id="ts-layout">
            <option value="FRENCH_CLASSIC" ${c.layoutId === "FRENCH_CLASSIC" ? "selected" : ""}>French classic (1-2-5-3)</option>
            <option value="TOURNAMENT_MODERN" ${c.layoutId === "TOURNAMENT_MODERN" ? "selected" : ""}>Tournament modern</option>
            <option value="OPEN_CUSTOM" ${c.layoutId === "OPEN_CUSTOM" ? "selected" : ""}>Open custom men</option>
          </select>
        </label>
        <label>Men per rod (DEF / MID / ATT) — mirrored; GK always 1</label>
        <div class="table-setup-row">
          <input id="ts-def" type="number" min="1" max="5" value="${c.customMen[1]}" ${menDisabled}/>
          <input id="ts-mid" type="number" min="1" max="5" value="${c.customMen[2]}" ${menDisabled}/>
          <input id="ts-att" type="number" min="1" max="5" value="${c.customMen[3]}" ${menDisabled}/>
        </div>
        <label>Opponent
          <select id="ts-opp">
            <option value="AI" ${c.opponent === "AI" ? "selected" : ""}>Computer (AI)</option>
            <option value="HUMAN" ${c.opponent === "HUMAN" ? "selected" : ""}>Hotseat 2P</option>
          </select>
        </label>
        <label>AI difficulty
          <select id="ts-diff" ${c.opponent !== "AI" ? "disabled" : ""}>
            ${(["EASY", "NORMAL", "HARD", "EXPERT"] as TableAIDifficulty[])
              .map((d) => `<option value="${d}" ${c.difficulty === d ? "selected" : ""}>${d}</option>`)
              .join("")}
          </select>
        </label>
        <label>First to (goals)
          <input id="ts-first" type="number" min="1" max="21" value="${c.firstTo}"/>
        </label>
        <div class="table-setup-actions">
          <button type="button" data-act="cancel">Back</button>
          <button type="button" class="primary" data-act="start">Kick off</button>
        </div>
      </div>
    `;
    this.root.querySelector("#ts-layout")?.addEventListener("change", () => {
      this.cfg = this.read();
      this.render();
    });
    this.root.querySelector("#ts-opp")?.addEventListener("change", () => {
      this.cfg = this.read();
      this.render();
    });
  }

  read(): TableMatchConfig {
    const layout = (this.root.querySelector("#ts-layout") as HTMLSelectElement | null)?.value as
      | TableLayoutId
      | undefined;
    const opp = (this.root.querySelector("#ts-opp") as HTMLSelectElement | null)?.value as
      | TableOpponent
      | undefined;
    const diff = (this.root.querySelector("#ts-diff") as HTMLSelectElement | null)?.value as
      | TableAIDifficulty
      | undefined;
    const first = Number((this.root.querySelector("#ts-first") as HTMLInputElement | null)?.value ?? 5);
    const def = Number((this.root.querySelector("#ts-def") as HTMLInputElement | null)?.value ?? 2);
    const mid = Number((this.root.querySelector("#ts-mid") as HTMLInputElement | null)?.value ?? 5);
    const att = Number((this.root.querySelector("#ts-att") as HTMLInputElement | null)?.value ?? 3);
    return normalizeTableConfig({
      layoutId: layout ?? "FRENCH_CLASSIC",
      opponent: opp ?? "AI",
      difficulty: diff ?? "NORMAL",
      firstTo: first,
      customMen: [1, def, mid, att],
    });
  }
}
