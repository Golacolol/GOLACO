/**
 * Optional AI decision telemetry for future analysis / training.
 * OFF by default — enable only in DEBUG / AI ANALYSIS mode.
 * Does not implement ML; only records structured decision events.
 */

export type DecisionEventType =
  | "PASS_DECISION"
  | "SHOT_DECISION"
  | "RUN_DECISION"
  | "PRESS_DECISION"
  | "TACKLE_DECISION"
  | "CLEARANCE_DECISION"
  | "FREE_KICK_DECISION"
  | "RECEIVE_DECISION"
  | "PASS_OUTCOME"
  | "SHOT_OUTCOME"
  | "TACKLE_OUTCOME";

export interface DecisionEvent {
  matchId: string;
  simulationTime: number;
  decisionId: string;
  type: DecisionEventType;
  playerId: string;
  teamId: string;
  playerPosition?: string;
  playerVelocity?: { x: number; z: number };
  playerFacing?: number;
  currentEnergy?: number;
  ballPosition?: { x: number; y: number; z: number };
  ballVelocity?: { x: number; y: number; z: number };
  ballPossession?: string | null;
  pressure?: number;
  availableActions?: string[];
  actionScores?: Record<string, number>;
  chosenAction?: string;
  targetPlayerId?: string | null;
  targetPosition?: { x: number; z: number };
  relevantAttributes?: Record<string, number>;
  /** Outcome linkage */
  relatedDecisionId?: string;
  completed?: boolean;
  progressiveDistance?: number;
  possessionRetained?: boolean;
  meta?: Record<string, number | string | boolean | null>;
}

export interface DecisionTelemetryOptions {
  enabled?: boolean;
  matchId?: string;
  maxEvents?: number;
}

export class DecisionTelemetry {
  enabled = false;
  matchId = "match";
  maxEvents = 4000;
  private events: DecisionEvent[] = [];
  private seq = 0;

  configure(opts: DecisionTelemetryOptions): void {
    if (opts.enabled !== undefined) this.enabled = opts.enabled;
    if (opts.matchId) this.matchId = opts.matchId;
    if (opts.maxEvents !== undefined) this.maxEvents = opts.maxEvents;
  }

  reset(matchId?: string): void {
    this.events.length = 0;
    this.seq = 0;
    if (matchId) this.matchId = matchId;
  }

  nextId(): string {
    this.seq += 1;
    return `D${String(this.seq).padStart(6, "0")}`;
  }

  record(partial: Omit<DecisionEvent, "matchId" | "decisionId"> & { decisionId?: string }): string | null {
    if (!this.enabled) return null;
    const decisionId = partial.decisionId ?? this.nextId();
    const event: DecisionEvent = {
      ...partial,
      matchId: this.matchId,
      decisionId,
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    return decisionId;
  }

  linkOutcome(
    relatedDecisionId: string,
    type: "PASS_OUTCOME" | "SHOT_OUTCOME" | "TACKLE_OUTCOME",
    simulationTime: number,
    extra: Partial<DecisionEvent> = {},
  ): string | null {
    if (!this.enabled || !relatedDecisionId) return null;
    return this.record({
      type,
      simulationTime,
      playerId: extra.playerId ?? "",
      teamId: extra.teamId ?? "",
      relatedDecisionId,
      ...extra,
    });
  }

  getEvents(): readonly DecisionEvent[] {
    return this.events;
  }

  dumpJson(): string {
    return JSON.stringify(this.events);
  }
}

/** Shared singleton — Match / Game enable when debug / AI analysis is on. */
export const decisionTelemetry = new DecisionTelemetry();
