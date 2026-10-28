import type { GameDatabase } from "../core/Database";
import type { FixtureRecord } from "../data/schema";
import { bindTimeWeatherSelects, groupedTeamOptionsHtml, weatherOptionsHtml } from "./MatchSetup";
import { clampWeatherForTime, type TimeOfDay, type Weather } from "../football/environment/Environment";

export class FixtureEditor {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "editor-screen";
    parent.appendChild(this.root);
    this.hide();
  }

  render(db: GameDatabase): void {
    this.root.hidden = false;
    const f = db.nextFixture();
    const teams = [...db.teams.values()];
    const venues = [...db.stadiums.values()].sort((a, b) => a.name.localeCompare(b.name));
    const opt = (id: string, label: string, cur: string) =>
      `<option value="${id}" ${id === cur ? "selected" : ""}>${label}</option>`;
    this.root.innerHTML = `
      <div class="editor-card">
        <h2>Fixture Editor</h2>
        <label>Home team
          <select id="home">${groupedTeamOptionsHtml(teams, f.homeTeamId)}</select>
        </label>
        <label>Away team
          <select id="away">${groupedTeamOptionsHtml(teams, f.awayTeamId)}</select>
        </label>
        <label>Venue
          <select id="venue">${venues.map((s) => opt(s.id, s.name, f.venueId)).join("")}</select>
        </label>
        <label>Competition <input id="comp" value="${f.competition}" /></label>
        <label>Date <input id="date" value="${f.date}" /></label>
        <label>Time <input id="time" value="${f.time}" /></label>
        <label>Duration (sec) <input id="dur" type="number" value="${f.durationSeconds}" /></label>
        <label>Gameplay default
          <select id="mode">
            <option value="REAL" ${f.gameplayModeDefault === "ARCADE" ? "" : "selected"}>REAL</option>
            <option value="ARCADE" ${f.gameplayModeDefault === "ARCADE" ? "selected" : ""}>ARCADE</option>
          </select>
        </label>
        <label>Time of day
          <select id="tod">${["DAY", "EVENING", "NIGHT"].map((t) => `<option ${ (f.timeOfDay ?? "EVENING") === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        </label>
        <label>Weather
          <select id="wx">${weatherOptionsHtml(f.timeOfDay ?? "EVENING", f.weather ?? "MILD")}</select>
        </label>
        <div class="row-btns">
          <button data-act="save">Save</button>
          <button data-act="back">Back</button>
        </div>
      </div>
    `;
    bindTimeWeatherSelects(
      this.root.querySelector("#tod") as HTMLSelectElement,
      this.root.querySelector("#wx") as HTMLSelectElement,
    );
  }

  hide(): void {
    this.root.hidden = true;
  }

  apply(db: GameDatabase): void {
    const f = db.nextFixture();
    f.homeTeamId = (this.root.querySelector("#home") as HTMLSelectElement).value;
    f.awayTeamId = (this.root.querySelector("#away") as HTMLSelectElement).value;
    f.venueId = (this.root.querySelector("#venue") as HTMLSelectElement).value;
    f.competition = (this.root.querySelector("#comp") as HTMLInputElement).value;
    f.date = (this.root.querySelector("#date") as HTMLInputElement).value;
    f.time = (this.root.querySelector("#time") as HTMLInputElement).value;
    f.durationSeconds = Number((this.root.querySelector("#dur") as HTMLInputElement).value);
    f.gameplayModeDefault = (this.root.querySelector("#mode") as HTMLSelectElement).value as FixtureRecord["gameplayModeDefault"];
    f.timeOfDay = (this.root.querySelector("#tod") as HTMLSelectElement).value as FixtureRecord["timeOfDay"];
    f.weather = clampWeatherForTime(
      (this.root.querySelector("#tod") as HTMLSelectElement).value as TimeOfDay,
      (this.root.querySelector("#wx") as HTMLSelectElement).value as Weather,
    );
    f.homeLineupId = db.defaultLineupId(f.homeTeamId) ?? f.homeLineupId;
    f.awayLineupId = db.defaultLineupId(f.awayTeamId) ?? f.awayLineupId;
  }
}
