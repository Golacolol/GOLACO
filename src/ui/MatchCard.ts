import type { Match } from "../football/Match";
import { DEFAULT_KICK_OFF_TIME, MATCH_CARD_FADE_LEAD } from "../football/constants";
import { goalMinuteLabel } from "../football/GoalEvent";
import { teamBadgeHtml } from "./Portrait";

export type MatchCardPhase = "kickoff" | "goal" | "half" | "full";

export function matchCardLabel(phase: MatchCardPhase): string {
  if (phase === "kickoff") return "KICK-OFF";
  if (phase === "goal") return "GOAL";
  if (phase === "half") return "HALF TIME";
  return "FULL TIME";
}

export function matchCardShowsScorers(phase: MatchCardPhase): boolean {
  return phase !== "kickoff";
}

export function shouldFadeMatchCard(secondsLeft: number, lead = MATCH_CARD_FADE_LEAD): boolean {
  return secondsLeft <= lead;
}

export class MatchCard {
  readonly root: HTMLElement;
  private shownKey = "";

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "match-card";
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  show(match: Match, phase: MatchCardPhase): void {
    const key = `${phase}|${match.homeScore}|${match.awayScore}|${match.goals.length}`;
    if (!this.root.hidden && this.shownKey === key) return;
    this.shownKey = key;
    this.root.classList.remove("fade-out");
    this.root.hidden = false;
    const homeGoals = match.goals.filter((g) => g.scoringTeam === "home");
    const awayGoals = match.goals.filter((g) => g.scoringTeam === "away");
    const duration = match.clock.duration;
    const scorers = matchCardShowsScorers(phase)
      ? `<div class="match-card-scorers">
            <div>${scorerLines(homeGoals, duration) || "—"}</div>
            <div>${scorerLines(awayGoals, duration) || "—"}</div>
          </div>`
      : "";
    const home = match.home.record;
    const away = match.away.record;
    this.root.innerHTML = `
      <div class="match-card-phase">${matchCardLabel(phase)}</div>
      <div class="match-card-teams">
        <div class="match-card-club">
          <div class="match-card-club-text">
            <strong>${home.abbreviation}</strong>
            <span>${home.name}</span>
          </div>
          ${teamBadgeHtml(home, { className: "match-card-crest", size: 52 })}
        </div>
        <div class="match-card-score">
          <span class="match-card-num">${match.homeScore}</span>
          <span class="match-card-sep">–</span>
          <span class="match-card-num">${match.awayScore}</span>
        </div>
        <div class="match-card-club away">
          ${teamBadgeHtml(away, { className: "match-card-crest", size: 52 })}
          <div class="match-card-club-text">
            <strong>${away.abbreviation}</strong>
            <span>${away.name}</span>
          </div>
        </div>
      </div>
      <div class="match-card-meta">${match.stadium.record.name} · ${match.kickOffTime || DEFAULT_KICK_OFF_TIME}</div>
      ${scorers}
    `;
  }

  fadeOut(): void {
    if (this.root.hidden || this.root.classList.contains("fade-out")) return;
    this.root.classList.add("fade-out");
  }

  hide(): void {
    this.root.hidden = true;
    this.root.classList.remove("fade-out");
    this.shownKey = "";
  }

  dispose(): void {
    this.root.remove();
  }
}

function scorerLines(goals: Match["goals"], duration: number): string {
  return goals
    .map((g) => `<span>${g.scorerName} ${goalMinuteLabel(g.gameTime, duration)}</span>`)
    .join("");
}
