export class TableHUD {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "table-hud";
    this.root.innerHTML = `
      <div class="table-hud-score">
        <span data-home>0</span>
        <span class="table-hud-sep">–</span>
        <span data-away>0</span>
      </div>
      <div class="table-hud-meta" data-meta></div>
      <div class="table-hud-help" data-help></div>
    `;
    parent.appendChild(this.root);
    this.ensureStyles();
  }

  private ensureStyles(): void {
    if (document.getElementById("table-hud-css")) return;
    const style = document.createElement("style");
    style.id = "table-hud-css";
    style.textContent = `
      .table-hud {
        position: absolute; left: 50%; top: 12px; transform: translateX(-50%);
        z-index: 40; pointer-events: none; text-align: center;
        font-family: "Segoe UI", system-ui, sans-serif; color: #f4f0e6;
        text-shadow: 0 1px 3px rgba(0,0,0,.75);
      }
      .table-hud-score { font-size: 2rem; font-weight: 700; letter-spacing: 0.08em; }
      .table-hud-sep { opacity: 0.55; margin: 0 0.35rem; }
      .table-hud-meta { margin-top: 4px; font-size: 0.85rem; opacity: 0.9; }
      .table-hud-help { margin-top: 6px; font-size: 0.72rem; opacity: 0.7; max-width: 520px; }
    `;
    document.head.appendChild(style);
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(opts: {
    home: number;
    away: number;
    firstTo: number;
    opponent: string;
    difficulty?: string;
    view: string;
    serving?: string | null;
    winner?: "home" | "away" | null;
  }): void {
    const h = this.root.querySelector("[data-home]");
    const a = this.root.querySelector("[data-away]");
    const meta = this.root.querySelector("[data-meta]");
    const help = this.root.querySelector("[data-help]");
    if (h) h.textContent = String(opts.home);
    if (a) a.textContent = String(opts.away);
    if (meta) {
      const opp =
        opts.opponent === "AI" ? `vs AI · ${opts.difficulty ?? "NORMAL"}` : "2P hotseat";
      const serve = opts.serving ? ` · serve ${opts.serving}` : "";
      const win = opts.winner ? ` · ${opts.winner.toUpperCase()} wins` : "";
      meta.textContent = `First to ${opts.firstTo} · ${opp} · ${opts.view}${serve}${win}`;
    }
    if (help) {
      help.textContent =
        "Home: 1–4 select rod (stays selected, 5=all) · WASD/arrows slide · Space=strike (hold=spin, release=stop) · Away: 6–9 · IJKL · Enter · V view · Esc pause";
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
