export type AppEventMap = {
  MATCH_STARTED: { fixtureId: string };
  KICKOFF: { kickingTeam: "home" | "away" };
  SHOT: { playerId: string; power: number };
  SAVE: { keeperId: string };
  GOAL: { scoringTeam: "home" | "away"; scorerId: string };
  FOUL: { playerId: string; card?: "none" | "yellow" | "red" };
  RED_CARD: { playerId: string };
  HALF_TIME: Record<string, never>;
  FULL_TIME: { home: number; away: number };
  SUBSTITUTION: { outId: string; inId: string };
  STATE_CHANGED: { from: string; to: string };
  PLAYER_SELECTED: { playerId: string };
  INPUT: { kind: string };
  CROWD_REACT: { section: "HOME" | "AWAY" | "NEUTRAL"; intensity: number; mood: string };
};

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof AppEventMap>(event: K, handler: Handler<AppEventMap[K]>): () => void {
    const list = this.listeners.get(event) ?? new Set();
    list.add(handler as Handler<unknown>);
    this.listeners.set(event, list);
    return () => list.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof AppEventMap>(event: K, payload: AppEventMap[K]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const handler of list) handler(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
