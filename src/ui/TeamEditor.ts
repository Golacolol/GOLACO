import type { GameDatabase } from "../core/Database";
import type { TeamRecord } from "../data/schema";
import { portraitHtml } from "./Portrait";

export class TeamEditor {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "editor-screen";
    parent.appendChild(this.root);
    this.hide();
  }

  render(db: GameDatabase): void {
    this.root.hidden = false;
    const order = ["PREMIER_LEAGUE", "CHAMPIONSHIP", "LEAGUE_ONE", "OTHER"] as const;
    const labels: Record<string, string> = {
      PREMIER_LEAGUE: "Premier League",
      CHAMPIONSHIP: "Championship",
      LEAGUE_ONE: "League One",
      OTHER: "CLASSIC TEAMS",
    };
    const grouped = new Map<string, TeamRecord[]>();
    for (const key of order) grouped.set(key, []);
    for (const t of db.teams.values()) {
      const key = t.league && grouped.has(t.league) ? t.league : "OTHER";
      grouped.get(key)!.push(t);
    }
    const sections = order
      .map((key) => {
        const teams = (grouped.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name));
        if (!teams.length) return "";
        return `<h3 class="league-head">${labels[key]}</h3>${teams
          .map((t) => {
            const squad = db.getSquad(t.id);
            return `<section class="team-block">
              <header>
                <input data-team="${t.id}" data-field="name" value="${t.name}" />
                <input data-team="${t.id}" data-field="abbreviation" value="${t.abbreviation}" class="abbr" />
                <input data-team="${t.id}" data-field="primaryColor" type="color" value="${t.primaryColor}" />
                <input data-team="${t.id}" data-field="secondaryColor" type="color" value="${t.secondaryColor}" />
                <select data-team="${t.id}" data-field="defaultFormation">
                  ${["4-2-3-1", "4-3-3", "4-4-2", "4-4-2-W", "3-4-2-1"].map((f) => `<option ${t.defaultFormation === f ? "selected" : ""}>${f}</option>`).join("")}
                </select>
              </header>
              <div class="squad-mini">
                ${squad
                  .map(
                    (p) =>
                      `<span class="squad-chip">${portraitHtml(p.player, p.shirtNumber, t.primaryColor)} #${p.shirtNumber} ${p.player.displayName} ${p.player.primaryPosition} ${p.overall}</span>`,
                  )
                  .join("")}
              </div>
            </section>`;
          })
          .join("")}`;
      })
      .join("");
    this.root.innerHTML = `
      <div class="editor-card wide">
        <h2>Teams</h2>
        <p class="hint">Premier League, Championship and League One squads for 2026/27. Players live in the global database; teams reference memberships and shirt numbers.</p>
        ${sections}
        <div class="row-btns">
          <button data-act="save">Save</button>
          <button data-act="back">Back</button>
        </div>
      </div>
    `;
  }

  hide(): void {
    this.root.hidden = true;
  }

  apply(db: GameDatabase): void {
    this.root.querySelectorAll("input[data-team], select[data-team]").forEach((el) => {
      const input = el as HTMLInputElement;
      const team = db.teams.get(input.dataset.team ?? "");
      const field = input.dataset.field;
      if (!team || !field) return;
      (team as unknown as Record<string, string>)[field] = input.value;
    });
  }
}
