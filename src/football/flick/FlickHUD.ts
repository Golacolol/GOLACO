export class FlickHUD {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "flick-hud";
    this.root.innerHTML = `
      <div class="flick-hud-score">
        <span data-home>0</span>
        <span class="flick-hud-sep">–</span>
        <span data-away>0</span>
      </div>
      <div class="flick-hud-meta" data-meta></div>
      <div class="flick-hud-help" data-help></div>
    `;
    parent.appendChild(this.root);
    this.ensureStyles();
  }

  private ensureStyles(): void {
    if (document.getElementById("flick-hud-css")) return;
    const style = document.createElement("style");
    style.id = "flick-hud-css";
    style.textContent = `
      .flick-hud {
        position: absolute; left: 50%; top: 12px; transform: translateX(-50%);
        z-index: 40; pointer-events: none; text-align: center;
        font-family: "Segoe UI", system-ui, sans-serif; color: #f4f0e6;
        text-shadow: 0 1px 3px rgba(0,0,0,.75);
      }
      .flick-hud-score { font-size: 2rem; font-weight: 700; letter-spacing: 0.08em; }
      .flick-hud-sep { opacity: 0.55; margin: 0 0.35rem; }
      .flick-hud-meta { margin-top: 4px; font-size: 0.85rem; opacity: 0.9; }
      .flick-hud-help { margin-top: 6px; font-size: 0.72rem; opacity: 0.7; max-width: 560px; }
      .flick-hud-meta .gk-cue { color: #ffe08a; font-weight: 600; }
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
    turn: string;
    turnBased?: boolean;
    gkWindow?: boolean;
    winner?: "home" | "away" | null;
    phase?: string;
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
      const win = opts.winner ? ` · ${opts.winner.toUpperCase()} wins` : "";
      const gk = opts.gkWindow ? ` · <span class="gk-cue">Your GK — flick to save</span>` : "";
      const turnBit =
        opts.turnBased === false ? "OPEN PLAY" : `${opts.turn} flick`;
      meta.innerHTML = `First to ${opts.firstTo} · ${opp} · ${turnBit} · ${opts.view}${gk}${win}`;
    }
    if (help) {
      const gkHint = "GK: WASD/arrows or drag to position (no flick)";
      help.textContent =
        opts.turnBased === false
          ? `Open play — flick anytime settled; AI reacts on its timer · ${gkHint} · V view · Esc pause`
          : `Click outfield, pull back, release to flick · ${gkHint} · V view · Esc pause`;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
