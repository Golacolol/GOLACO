export interface GoalEvent {
  scoringTeam: "home" | "away";
  scorerId: string;
  scorerName: string;
  scorerNumber: number;
  assistId?: string;
  gameTime: number;
  homeScore: number;
  awayScore: number;
  shotType: "open" | "header" | "setpiece";
  venueId: string;
}

export function createGoalEvent(partial: GoalEvent): GoalEvent {
  return { ...partial };
}

export function goalMinuteLabel(elapsed: number, duration: number): string {
  const mins = Math.max(1, Math.round((elapsed / Math.max(1, duration)) * 90));
  return `${mins}'`;
}
