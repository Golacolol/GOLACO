import type { GameDatabase } from "../core/Database";
import {
  CLASSIC_STRESS_FIXTURES,
  type SimulationLabOptions,
  type SimulationRunReport,
  type LabProgress,
  isClassicTeamId,
} from "../football/simulation/MatchSimulationLab";
import { groupedTeamOptionsHtml } from "./MatchSetup";

export class MatchSimulationLabMenu {
  readonly root: HTMLElement;
  lastReport: SimulationRunReport | null = null;
  control = { stopAfterCurrent: false, stopNow: false };

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "editor-screen";
    parent.appendChild(this.root);
    this.hide();
  }

  hide(): void {
    this.root.hidden = true;
  }

  show(): void {
    this.root.hidden = false;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  render(db: GameDatabase, defaults: { includeClassic: boolean; matchDuration: number }): void {
    this.show();
    const teams = [...db.teams.values()].filter((t) => t.teamType !== "FANS_TEAM" && t.teamType !== "YOUTH_TEAM");
    const teamOpts = `<option value="AUTO">AUTO</option>${groupedTeamOptionsHtml(teams, "AUTO").replace(/selected/g, "")}`;
    this.root.innerHTML = `
      <div class="editor-card settings-card" style="max-width:720px">
        <h2>Match Simulation Lab</h2>
        <p class="hint">AI-v-AI batch runner using the real match engine. Classic Teams are <strong>OFF</strong> for random pools by default.</p>
        <label>Number of matches
          <select id="lab-count">
            ${[1, 5, 10, 25, 50, 100].map((n) => `<option value="${n}" ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </label>
        <label class="check"><input id="lab-current" type="checkbox" checked/> Current / default teams</label>
        <label class="check"><input id="lab-classic" type="checkbox" ${defaults.includeClassic ? "checked" : ""}/> Include Classic Teams in random simulations</label>
        <p class="hint" id="lab-classic-hint">Classic Teams included: <strong>${defaults.includeClassic ? "YES" : "NO"}</strong></p>
        <label>Home team
          <select id="lab-home">${teamOpts}</select>
        </label>
        <label>Away team
          <select id="lab-away">${teamOpts}</select>
        </label>
        <label class="check"><input id="lab-telemetry" type="checkbox"/> Record AI decision telemetry</label>
        <p class="hint">Telemetry default OFF. Seeded RNG is not fully wired through the match engine (Math.random); seeds are logged for run identity only.</p>
        <div class="settings-top-actions" style="flex-wrap:wrap;gap:8px">
          <button type="button" data-lab="start">Start run</button>
          <button type="button" data-lab="stop-after" disabled>Stop after current</button>
          <button type="button" data-lab="stop-now" disabled>Stop now</button>
          <button type="button" data-lab="stress">Classic stress suite</button>
          <button type="button" data-lab="baseline">Baseline current-only suite</button>
          <button type="button" data-lab="export-json" disabled>Export JSON</button>
          <button type="button" data-lab="export-csv" disabled>Export CSV</button>
          <button type="button" data-lab="back">Back</button>
        </div>
        <pre id="lab-progress" class="hint" style="white-space:pre-wrap;min-height:4em"></pre>
        <pre id="lab-results" class="hint" style="white-space:pre-wrap;max-height:280px;overflow:auto"></pre>
      </div>
    `;
    const classic = this.root.querySelector("#lab-classic") as HTMLInputElement;
    const hint = this.root.querySelector("#lab-classic-hint") as HTMLElement;
    classic.addEventListener("change", () => {
      hint.innerHTML = `Classic Teams included: <strong>${classic.checked ? "YES" : "NO"}</strong>`;
    });
    void defaults.matchDuration;
  }

  readOptions(matchDurationSeconds: number): SimulationLabOptions {
    const count = Number((this.root.querySelector("#lab-count") as HTMLSelectElement).value) || 10;
    return {
      matchCount: count,
      includeCurrentTeams: (this.root.querySelector("#lab-current") as HTMLInputElement).checked,
      includeClassicTeams: (this.root.querySelector("#lab-classic") as HTMLInputElement).checked,
      homeTeamId: (this.root.querySelector("#lab-home") as HTMLSelectElement).value as string | "AUTO",
      awayTeamId: (this.root.querySelector("#lab-away") as HTMLSelectElement).value as string | "AUTO",
      matchDurationSeconds: Math.min(300, Math.max(60, matchDurationSeconds)),
      recordTelemetry: (this.root.querySelector("#lab-telemetry") as HTMLInputElement).checked,
      seed: "AUTO",
      stepSeconds: 1 / 20,
      stepsPerYield: 120,
    };
  }

  setRunning(running: boolean): void {
    this.control.stopAfterCurrent = false;
    this.control.stopNow = false;
    for (const id of ["stop-after", "stop-now", "start", "stress", "baseline"]) {
      const btn = this.root.querySelector(`[data-lab="${id}"]`) as HTMLButtonElement | null;
      if (!btn) continue;
      if (id === "start" || id === "stress" || id === "baseline") btn.disabled = running;
      else btn.disabled = !running;
    }
  }

  setProgress(p: LabProgress): void {
    const el = this.root.querySelector("#lab-progress");
    if (!el) return;
    el.textContent = [
      `Match ${p.index} / ${p.total}`,
      `Fixture: ${p.fixtureLabel}`,
      `Elapsed wall: ${(p.elapsedWallMs / 1000).toFixed(1)}s`,
      `Completed: ${p.completed}  Errors: ${p.errors}`,
      `Classic Teams included: ${p.classicIncluded ? "YES" : "NO"}`,
      `Telemetry: ${p.telemetry ? "ON" : "OFF"}`,
    ].join("\n");
  }

  setReport(report: SimulationRunReport): void {
    this.lastReport = report;
    const exportJson = this.root.querySelector('[data-lab="export-json"]') as HTMLButtonElement | null;
    const exportCsv = this.root.querySelector('[data-lab="export-csv"]') as HTMLButtonElement | null;
    if (exportJson) exportJson.disabled = false;
    if (exportCsv) exportCsv.disabled = false;
    const el = this.root.querySelector("#lab-results");
    if (!el) return;
    const a = report.aggregates;
    el.textContent = [
      `Run ${report.simulationRunId} · mode ${report.simulationMode}`,
      `Completed ${report.matchesCompleted}/${report.matchesRequested} (failed ${report.matchesFailed})`,
      `Goals/match ${a.goalsPerMatch.toFixed(2)} · Home ${a.homeWinPct.toFixed(0)}% · Draw ${a.drawPct.toFixed(0)}% · Away ${a.awayWinPct.toFixed(0)}%`,
      `Pass% ${a.meanPassCompletion.toFixed(1)} · Shots ${a.meanShots.toFixed(1)} · Turnovers ${a.meanTurnovers.toFixed(1)} · Stuck ${a.meanStuckRecoveries.toFixed(1)}`,
      `Wall ms/match ${a.meanWallMsPerMatch.toFixed(0)} · Headless: ${report.headlessStatus}`,
      `CC ${a.currentVsCurrent} · XX ${a.classicVsClassic} · XC ${a.classicVsCurrent}`,
      ...report.matches.slice(0, 12).map(
        (m) =>
          `${m.homeTeamId.replace(/^classic_/, "")} ${m.homeScore}-${m.awayScore} ${m.awayTeamId.replace(/^classic_/, "")} [${m.result}]${m.error ? " ERR " + m.error : ""}`,
      ),
    ].join("\n");
  }

  confirmLargeRun(count: number): boolean {
    if (count < 50) return true;
    return window.confirm(`Start ${count} accelerated AI-v-AI simulations? This may take a while.`);
  }

  stressPairCount(): number {
    return CLASSIC_STRESS_FIXTURES.length;
  }

  download(filename: string, body: string, mime: string): void {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Fixed classic stress options — explicit teams, random Classic pool still OFF. */
  stressOptions(matchDurationSeconds: number, index: number): SimulationLabOptions & { label: string } {
    const f = CLASSIC_STRESS_FIXTURES[index]!;
    return {
      matchCount: 1,
      includeCurrentTeams: false,
      includeClassicTeams: false,
      homeTeamId: f.home,
      awayTeamId: f.away,
      matchDurationSeconds: Math.min(180, matchDurationSeconds),
      recordTelemetry: false,
      seed: "AUTO",
      stepSeconds: 1 / 20,
      stepsPerYield: 120,
      label: f.label,
    };
  }
}

export function assertClassicExcludedByDefault(opts: SimulationLabOptions): boolean {
  return opts.includeClassicTeams === false || (!opts.includeClassicTeams && opts.homeTeamId === "AUTO");
}

export function poolWouldSelectClassic(teamId: string, includeClassic: boolean): boolean {
  if (!isClassicTeamId(teamId)) return false;
  return includeClassic;
}
