import type { Match } from "../football/Match";

export type PauseView = "root";

export interface PauseItem {
  action: string;
  label: string;
  id?: string;
}

export class PauseMenu {
  readonly root: HTMLElement;
  selected = 0;
  view: PauseView = "root";
  items: PauseItem[] = [];
  note = "";
  audioEnabled = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "pause-menu";
    parent.appendChild(this.root);
    this.hide();
  }

  reset(): void {
    this.view = "root";
    this.selected = 0;
    this.note = "";
  }

  current(): PauseItem {
    return this.items[this.selected] ?? this.items[0] ?? { action: "resume", label: "Resume" };
  }

  render(match?: Match | null): void {
    this.root.hidden = false;
    this.items = this.buildItems(match ?? null);
    if (this.selected >= this.items.length) this.selected = 0;
    this.root.innerHTML = `
      <div class="pause-card">
        <div class="pause-brand" aria-label="GOLAÇO SOCCER">
          <span class="title-line">GOLAÇO SOCCER <span class="title-emoji" aria-hidden="true">⚽️</span></span>
        </div>
        ${this.note ? `<p class="pause-note">${this.note}</p>` : ""}
        ${this.items
          .map(
            (item, i) =>
              `<button type="button" class="menu-item ${i === this.selected ? "active" : ""}" data-pause="${item.action}" ${
                item.id ? `data-id="${item.id}"` : ""
              }>${item.label}</button>`,
          )
          .join("")}
      </div>
    `;
    this.root.querySelectorAll<HTMLButtonElement>(".menu-item").forEach((btn, i) => {
      btn.addEventListener("pointerenter", () => {
        this.selected = i;
        this.root.querySelectorAll(".menu-item").forEach((b, j) => b.classList.toggle("active", j === i));
      });
    });
  }

  hide(): void {
    this.root.hidden = true;
  }

  move(d: number): void {
    if (!this.items.length) return;
    this.selected = (this.selected + d + this.items.length) % this.items.length;
    this.root.querySelectorAll(".menu-item").forEach((b, j) => b.classList.toggle("active", j === this.selected));
  }

  /** @returns true if a nested view was closed (always false now — root only). */
  back(): boolean {
    return false;
  }

  private buildItems(match: Match | null): PauseItem[] {
    this.note = "";
    void match;
    const items: PauseItem[] = [
      { action: "resume", label: "Resume" },
      { action: "audio", label: this.audioEnabled ? "Audio: On" : "Audio: Off" },
      { action: "formation", label: "Formation" },
      { action: "settings", label: "Settings" },
      { action: "quit", label: "Quit to Menu" },
    ];
    return items;
  }
}
