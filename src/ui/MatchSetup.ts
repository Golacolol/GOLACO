import type { FixtureRecord, TeamRecord } from "../data/schema";
import type { GameDatabase } from "../core/Database";
import { MODE_BLURBS, type GameplayMode } from "../football/gameplay/GameplayTuning";
import { clampWeatherForTime, weatherAllowedAt, type TimeOfDay, type Weather } from "../football/environment/Environment";
import { clampMatchDuration } from "../football/constants";

export const LEAGUE_LABEL: Record<string, string> = {
  PREMIER_LEAGUE: "Premier League",
  CHAMPIONSHIP: "Championship",
  LEAGUE_ONE: "League One",
  LA_LIGA: "La Liga",
  SERIE_A: "Serie A",
  OTHER: "CLASSIC TEAMS",
};

export interface MatchSetupValues {
  homeTeamId: string;
  awayTeamId: string;
  venueId: string;
  gameplayMode: GameplayMode;
  timeOfDay: TimeOfDay;
  weather: Weather;
  durationSeconds: number;
}

export function groupedTeamOptionsHtml(teams: TeamRecord[], currentId: string): string {
  const groups: Record<string, TeamRecord[]> = {
    PREMIER_LEAGUE: [],
    CHAMPIONSHIP: [],
    LEAGUE_ONE: [],
    LA_LIGA: [],
    SERIE_A: [],
    OTHER: [],
  };
  for (const t of teams) {
    (groups[t.league ?? "OTHER"] ?? groups.OTHER).push(t);
  }
  for (const list of Object.values(groups)) list.sort((a, b) => a.name.localeCompare(b.name));
  return Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(
      ([key, list]) =>
        `<optgroup label="${LEAGUE_LABEL[key] ?? key}">${list
          .map((t) => `<option value="${t.id}" ${t.id === currentId ? "selected" : ""}>${t.name}</option>`)
          .join("")}</optgroup>`,
    )
    .join("");
}

export function weatherOptionsHtml(timeOfDay: TimeOfDay, weather: Weather): string {
  const cur = clampWeatherForTime(timeOfDay, weather);
  return weatherAllowedAt(timeOfDay)
    .map((w) => `<option ${w === cur ? "selected" : ""}>${w}</option>`)
    .join("");
}

export function bindTimeWeatherSelects(timeEl: HTMLSelectElement, weatherEl: HTMLSelectElement): void {
  timeEl.addEventListener("change", () => {
    const time = timeEl.value as TimeOfDay;
    weatherEl.innerHTML = weatherOptionsHtml(time, weatherEl.value as Weather);
  });
}

export class MatchSetup {
  readonly root: HTMLElement;
  values: MatchSetupValues | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "editor-screen";
    parent.appendChild(this.root);
    this.hide();
  }

  render(db: GameDatabase, seed: MatchSetupValues): void {
    this.root.hidden = false;
    this.values = { ...seed };
    const teams = [...db.teams.values()];
    const venues = [...db.stadiums.values()].sort((a, b) => a.name.localeCompare(b.name));
    const opt = (id: string, label: string, cur: string) =>
      `<option value="${id}" ${id === cur ? "selected" : ""}>${label}</option>`;
    this.root.innerHTML = `
      <div class="editor-card">
        <h2>Match Setup</h2>
        <label>Home team
          <select id="ms-home">${groupedTeamOptionsHtml(teams, seed.homeTeamId)}</select>
        </label>
        <label>Away team
          <select id="ms-away">${groupedTeamOptionsHtml(teams, seed.awayTeamId)}</select>
        </label>
        <label>Venue
          <select id="ms-venue">${venues.map((s) => opt(s.id, s.name, seed.venueId)).join("")}</select>
        </label>
        <label>Gameplay mode
          <select id="ms-mode">
            <option value="REAL" ${seed.gameplayMode === "REAL" ? "selected" : ""}>REAL FOOTBALL</option>
            <option value="ARCADE" ${seed.gameplayMode === "ARCADE" ? "selected" : ""}>ARCADE FOOTBALL</option>
          </select>
        </label>
        <p class="hint" id="ms-mode-blurb">${MODE_BLURBS[seed.gameplayMode === "ARCADE" ? "ARCADE" : "REAL"]}</p>
        <label>Time of day
          <select id="ms-time">
            ${["DAY", "EVENING", "NIGHT"].map((t) => `<option ${seed.timeOfDay === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
        <label>Weather
          <select id="ms-weather">
            ${weatherOptionsHtml(seed.timeOfDay, seed.weather)}
          </select>
        </label>
        <label>Match length (seconds, two halves)
          <input id="ms-dur" type="number" min="120" max="2700" step="30" value="${seed.durationSeconds}" />
        </label>
        <p class="hint">Two halves. Default 600 = 5 minutes each. Maximum 2700 (45 minutes).</p>
        <div class="row-btns">
          <button data-setup="go">Continue</button>
          <button data-act="back">Back</button>
        </div>
      </div>
    `;
    const mode = this.root.querySelector("#ms-mode") as HTMLSelectElement;
    const blurb = this.root.querySelector("#ms-mode-blurb") as HTMLElement;
    mode.onchange = () => {
      blurb.textContent = MODE_BLURBS[mode.value as GameplayMode];
    };
    const home = this.root.querySelector("#ms-home") as HTMLSelectElement;
    const venue = this.root.querySelector("#ms-venue") as HTMLSelectElement;
    home.onchange = () => {
      const team = db.teams.get(home.value);
      if (team && [...venue.options].some((o) => o.value === team.defaultStadiumId)) {
        venue.value = team.defaultStadiumId;
      }
    };
    bindTimeWeatherSelects(
      this.root.querySelector("#ms-time") as HTMLSelectElement,
      this.root.querySelector("#ms-weather") as HTMLSelectElement,
    );
  }

  read(): MatchSetupValues {
    return {
      homeTeamId: (this.root.querySelector("#ms-home") as HTMLSelectElement).value,
      awayTeamId: (this.root.querySelector("#ms-away") as HTMLSelectElement).value,
      venueId: (this.root.querySelector("#ms-venue") as HTMLSelectElement).value,
      gameplayMode: (this.root.querySelector("#ms-mode") as HTMLSelectElement).value as GameplayMode,
      timeOfDay: (this.root.querySelector("#ms-time") as HTMLSelectElement).value as TimeOfDay,
      weather: clampWeatherForTime(
        (this.root.querySelector("#ms-time") as HTMLSelectElement).value as TimeOfDay,
        (this.root.querySelector("#ms-weather") as HTMLSelectElement).value as Weather,
      ),
      durationSeconds: clampMatchDuration(Number((this.root.querySelector("#ms-dur") as HTMLInputElement).value)),
    };
  }

  hide(): void {
    this.root.hidden = true;
  }

  toFixture(base: FixtureRecord, values: MatchSetupValues, db: GameDatabase): FixtureRecord {
    return {
      ...base,
      homeTeamId: values.homeTeamId,
      awayTeamId: values.awayTeamId,
      venueId: values.venueId,
      durationSeconds: values.durationSeconds,
      gameplayModeDefault: values.gameplayMode === "ARCADE" ? "ARCADE" : "REAL",
      timeOfDay: values.timeOfDay,
      weather: values.weather,
      homeLineupId: db.defaultLineupId(values.homeTeamId) ?? base.homeLineupId,
      awayLineupId: db.defaultLineupId(values.awayTeamId) ?? base.awayLineupId,
    };
  }
}
