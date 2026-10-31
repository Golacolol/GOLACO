import {
  DEFAULT_FLICK_CONFIG,
  normalizeFlickConfig,
  type FlickAIDifficulty,
  type FlickMatchConfig,
  type FlickOpponent,
} from "../football/flick";

export class FlickSetupMenu {
  readonly root: HTMLElement;
  private cfg: FlickMatchConfig = { ...DEFAULT_FLICK_CONFIG };
  onStart: ((cfg: FlickMatchConfig) => void) | null = null;
  onCancel: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "flick-setup-menu";
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
    if (document.getElementById("flick-setup-css")) return;
    const style = document.createElement("style");
    style.id = "flick-setup-css";
    style.textContent = `
      .flick-setup-menu {
        position: absolute; inset: 0; z-index: 60;
        display: flex; align-items: center; justify-content: center;
        background: rgba(8,6,4,.72); backdrop-filter: blur(4px);
        font-family: "Segoe UI", system-ui, sans-serif; color: #f3efe6;
      }
      .flick-setup-menu[hidden] { display: none !important; }
      .flick-setup-card {
        width: min(440px, 92vw); padding: 1.4rem 1.5rem 1.2rem;
        background: linear-gradient(160deg, #1e2a22, #121814);
        border: 1px solid rgba(180,220,160,.18); border-radius: 10px;
        box-shadow: 0 18px 48px rgba(0,0,0,.45);
      }
      .flick-setup-card h2 { margin: 0 0 0.35rem; font-size: 1.35rem; letter-spacing: 0.06em; }
      .flick-setup-card .hint { opacity: 0.7; font-size: 0.82rem; margin-bottom: 1rem; }
      .flick-setup-card label { display: block; margin: 0.55rem 0 0.2rem; font-size: 0.78rem; opacity: 0.85; }
      .flick-setup-card select, .flick-setup-card input[type="number"] {
        width: 100%; padding: 0.4rem 0.5rem; border-radius: 6px;
        border: 1px solid rgba(255,255,255,.15); background: #0c100e; color: inherit;
      }
      .flick-setup-actions { display: flex; gap: 0.6rem; margin-top: 1.15rem; }
      .flick-setup-actions button {
        flex: 1; padding: 0.55rem; border-radius: 6px; cursor: pointer;
        border: 1px solid rgba(255,255,255,.2); background: #2a3a30; color: inherit; font-weight: 600;
      }
      .flick-setup-actions button.primary { background: #3d6a45; border-color: rgba(180,255,160,.35); }
    `;
    document.head.appendChild(style);
  }

  open(initial?: Partial<FlickMatchConfig>): void {
    this.cfg = normalizeFlickConfig(initial);
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
    this.root.innerHTML = `
      <div class="flick-setup-card">
        <h2>FLICKBALL</h2>
        <p class="hint">Subbuteo-style tabletop — pull back and flick. Vs AI you still play your own goalkeeper.</p>
        <label>Opponent
          <select id="fs-opp">
            <option value="AI" ${c.opponent === "AI" ? "selected" : ""}>Computer (AI)</option>
            <option value="HUMAN" ${c.opponent === "HUMAN" ? "selected" : ""}>Hotseat 2P</option>
          </select>
        </label>
        <label>AI difficulty
          <select id="fs-diff" ${c.opponent !== "AI" ? "disabled" : ""}>
            ${(["EASY", "NORMAL", "HARD", "EXPERT"] as FlickAIDifficulty[])
              .map((d) => `<option value="${d}" ${c.difficulty === d ? "selected" : ""}>${d}</option>`)
              .join("")}
          </select>
        </label>
        <label>First to (goals)
          <input id="fs-first" type="number" min="1" max="21" value="${c.firstTo}"/>
        </label>
        <div class="flick-setup-actions">
          <button type="button" data-act="cancel">Back</button>
          <button type="button" class="primary" data-act="start">Kick off</button>
        </div>
      </div>
    `;
    this.root.querySelector("#fs-opp")?.addEventListener("change", () => {
      this.cfg = this.read();
      this.render();
    });
  }

  read(): FlickMatchConfig {
    const opp = (this.root.querySelector("#fs-opp") as HTMLSelectElement | null)?.value as
      | FlickOpponent
      | undefined;
    const diff = (this.root.querySelector("#fs-diff") as HTMLSelectElement | null)?.value as
      | FlickAIDifficulty
      | undefined;
    const first = Number((this.root.querySelector("#fs-first") as HTMLInputElement | null)?.value ?? 5);
    return normalizeFlickConfig({
      opponent: opp ?? "AI",
      difficulty: diff ?? "NORMAL",
      firstTo: first,
      humanSide: "home",
    });
  }
}
