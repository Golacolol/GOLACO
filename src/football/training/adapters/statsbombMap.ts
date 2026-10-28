/**
 * Thin mapper from StatsBomb-style open-data events → RealMatchEvent.
 * Import vendor JSON elsewhere; keep the app corpus in engine coords + RealMatchEvent.
 *
 * StatsBomb pitch: 120 x 80, attack left→right in event coordinates.
 * Engine pitch: 105 x 68, home attacks +x, centred at (0,0).
 */

import type { RealLabeledAction, RealMatchEvent, RealMatchEventType } from "../RealMatchEvent";

export interface StatsBombLikeEvent {
  id?: string;
  index?: number;
  minute?: number;
  second?: number;
  period?: number;
  team?: { id?: number; name?: string };
  player?: { id?: number; name?: string };
  position?: { name?: string };
  type?: { id?: number; name?: string };
  pass?: {
    length?: number;
    outcome?: { name?: string };
    cross?: boolean;
    switch?: boolean;
    end_location?: [number, number];
  };
  shot?: {
    outcome?: { name?: string };
    end_location?: [number, number, number?];
  };
  location?: [number, number];
}

export function statsBombToEngine(x: number, y: number): { x: number; z: number } {
  // SB: (0,0) own goal left, x→120 attack, y→80 top.
  // Engine: centre origin, home +x attack, z lateral.
  return {
    x: (x / 120) * 105 - 52.5,
    z: (y / 80) * 68 - 34,
  };
}

function mapType(name: string | undefined): RealMatchEventType | null {
  const n = (name ?? "").toLowerCase();
  if (n === "pass") return "pass";
  if (n === "shot") return "shot";
  if (n === "carry") return "carry";
  if (n === "ball receipt*") return "reception";
  if (n === "clearance") return "clearance";
  if (n.includes("free kick")) return "free_kick";
  return null;
}

function mapPassLabel(ev: StatsBombLikeEvent): RealLabeledAction {
  if (ev.pass?.cross) return "CROSS";
  if (ev.pass?.switch) return "LONG_PASS";
  const len = ev.pass?.length ?? 0;
  if (len >= 30) return "LONG_PASS";
  return "PASS";
}

/**
 * Map a StatsBomb-like event into our training schema.
 * `teamId` / `actingTeamIsHome` must be supplied by the caller (id map).
 */
export function mapStatsBombEvent(
  ev: StatsBombLikeEvent,
  opts: { teamId: string; actingTeamIsHome: boolean; idPrefix?: string },
): RealMatchEvent | null {
  const type = mapType(ev.type?.name);
  if (!type || !ev.location) return null;
  const start = statsBombToEngine(ev.location[0], ev.location[1]);
  const endLoc = ev.pass?.end_location ?? (ev.shot?.end_location as [number, number] | undefined);
  const end = endLoc ? statsBombToEngine(endLoc[0], endLoc[1]) : undefined;
  const labelAction: RealLabeledAction =
    type === "shot" ? "SHOT" : type === "pass" || type === "cross" ? mapPassLabel(ev) : type === "carry" ? "RUN" : "PASS";

  return {
    id: ev.id ?? `${opts.idPrefix ?? "sb"}_${ev.index ?? 0}`,
    minute: ev.minute ?? 0,
    second: ev.second,
    period: (ev.period === 2 ? 2 : 1) as 1 | 2,
    teamId: opts.teamId,
    playerSlot: ev.position?.name,
    type,
    subtype: ev.pass?.switch ? "switch" : ev.pass?.cross ? "cross" : undefined,
    labelAction,
    start,
    end,
    outcome: ev.pass?.outcome?.name === "Incomplete" ? "incomplete" : "complete",
    crossField: Boolean(ev.pass?.switch),
    lengthM: ev.pass?.length,
    actingTeamIsHome: opts.actingTeamIsHome,
    phase: type === "shot" ? "chance" : type === "free_kick" ? "set_piece" : "buildup",
  };
}
