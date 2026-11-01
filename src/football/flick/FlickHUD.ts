/**
 * Flickball score panel — same chrome as Real Football `.hud-score`.
 */
export class FlickHUD {
  readonly root: HTMLElement;
  private homeAbbr: string;
  private awayAbbr: string;

  constructor(parent: HTMLElement, opts?: { homeAbbr?: string; awayAbbr?: string }) {
    this.homeAbbr = (opts?.homeAbbr || "HOME").slice(0, 4).toUpperCase();
    this.awayAbbr = (opts?.awayAbbr || "AWAY").slice(0, 4).toUpperCase();
    this.root = document.createElement("div");
    this.root.className = "hud flick-hud";
    this.root.innerHTML = `
      <div class="hud-score">
        <span class="clock" data-turn>HOME</span>
        <span class="home" data-home-abbr>${escapeHud(this.homeAbbr)}</span>
        <strong><span data-home>0</span> - <span data-away>0</span></strong>
        <span class="away" data-away-abbr>${escapeHud(this.awayAbbr)}</span>
        <span class="mode" data-mode></span>
      </div>
      <div class="hud-auto" data-banner hidden></div>
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
      .flick-hud { pointer-events: none; }
      .flick-hud .hud-score { pointer-events: none; }
      .flick-hud-help {
        position: absolute; left: 50%; top: 64px; transform: translateX(-50%);
        margin-top: 0; font-size: 0.72rem; opacity: 0.7; max-width: 560px;
        text-align: center; color: #f4f0e6; text-shadow: 0 1px 3px rgba(0,0,0,.75);
        font-family: "Helvetica Neue", "Segoe UI", sans-serif;
      }
      .flick-hud .hud-auto { top: 64px; }
      .flick-hud .hud-auto:not([hidden]) ~ .flick-hud-help { top: 96px; }
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
    banner?: string | null;
  }): void {
    const h = this.root.querySelector("[data-home]");
    const a = this.root.querySelector("[data-away]");
    const turn = this.root.querySelector("[data-turn]");
    const mode = this.root.querySelector("[data-mode]");
    const help = this.root.querySelector("[data-help]");
    const banner = this.root.querySelector<HTMLElement>("[data-banner]");
    if (h) h.textContent = String(opts.home);
    if (a) a.textContent = String(opts.away);
    if (turn) {
      turn.textContent =
        opts.turnBased === false ? "OPEN" : opts.gkWindow ? "GK" : opts.turn;
    }
    if (mode) {
      const opp =
        opts.opponent === "AI" ? `AI · ${opts.difficulty ?? "NORMAL"}` : "2P";
      const win = opts.winner ? ` · ${opts.winner.toUpperCase()} WINS` : "";
      mode.textContent = `FIRST TO ${opts.firstTo} · ${opp} · ${opts.view}${win}`;
    }
    if (banner) {
      const text = opts.banner?.trim() || "";
      banner.hidden = !text;
      banner.textContent = text;
    }
    if (help) {
      const gkHint = "GK: WASD/arrows or drag (no flick)";
      help.textContent =
        opts.turnBased === false
          ? `Open play — flick anytime; AI on its timer · ${gkHint} · V view · Esc pause`
          : `Flick after the other side has moved — ball need not be still · ${gkHint} · V view · Esc pause`;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

function escapeHud(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
