import type { GameDatabase } from "../core/Database";
import type { EnglishLeague } from "../data/schema";
import { LEAGUE_TABS, standingsFor } from "../football/league/Standings";

export function leaguePanelHtml(db: GameDatabase, league: EnglishLeague, highlightId: string): string {
  const rows = standingsFor(db.fixtures, [...db.teams.values()], league);
  const label = LEAGUE_TABS.find((t) => t.id === league)?.label ?? "League One";
  return `
    <div class="panel-head">
      <button type="button" data-act="panel-back">Back</button>
      <div class="lf-tabs" role="tablist" aria-label="League or fixtures">
        <button type="button" class="on" data-act="lf-tab" data-lf="league" role="tab" aria-selected="true">League</button>
        <button type="button" data-act="lf-tab" data-lf="fixtures" role="tab" aria-selected="false">Fixtures</button>
      </div>
      <h2>${label}</h2>
    </div>
    <div class="league-tabs">
      ${LEAGUE_TABS.map(
        (tab) =>
          `<button type="button" class="${tab.id === league ? "on" : ""}" data-league="${tab.id}">${tab.label}</button>`,
      ).join("")}
    </div>
    <div class="table-wrap">
      <table class="league-table">
        <thead>
          <tr>
            <th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, i) =>
                `<tr class="${row.teamId === highlightId ? "user" : ""}">
                  <td>${i + 1}</td>
                  <td>${escapeHtml(row.name)}</td>
                  <td>${row.played}</td>
                  <td>${row.won}</td>
                  <td>${row.drawn}</td>
                  <td>${row.lost}</td>
                  <td>${row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                  <td>${row.pts}</td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
