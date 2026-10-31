import { CENTRE_CIRCLE_RADIUS, HALF_WIDTH } from "../constants";
import type { Player } from "../players/Player";
import { setPieceRole } from "./SetPieceAI";

export function celebrationCorner(scorer: Player): { x: number; z: number } {
  const goalX = scorer.oppGoalX() - Math.sign(scorer.attackSign || 1) * 1.2;
  const z = (scorer.z >= 0 ? 1 : -1) * (HALF_WIDTH - 1.1);
  return { x: goalX, z };
}

/** Opening kick: a short tap to midfield, a winger, or the other striker — not a dump to the last line. */
export function chooseKickOffReceiver(
  kicker: Player,
  teammates: Player[],
  rng: () => number = Math.random,
): Player | null {
  const back = -kicker.attackSign;
  const scored: { player: Player; weight: number }[] = [];
  for (const mate of teammates) {
    if (mate.id === kicker.id || mate.isGK) continue;
    const distance = mate.distTo(kicker.x, kicker.z);
    // Allow the partner striker (~3–6 m) — old 4.5 m floor excluded them and forced a long soft tap.
    if (distance < 2.15 || distance > 26) continue;
    const behind = (mate.x - kicker.x) * back;
    if (behind > 18) continue;
    const role = setPieceRole(mate);
    let weight =
      role === "mid" ? 4.4 : role === "wide" ? 3.6 : role === "st" ? 3.2 : role === "fb" ? 1.1 : 0.12;
    if (behind > 12) weight *= 0.28;
    if (distance >= 7 && distance <= 16) weight += 0.7;
    if (weight >= 0.4) scored.push({ player: mate, weight });
  }
  if (!scored.length) {
    return teammates.find((p) => p.id !== kicker.id && !p.isGK && setPieceRole(p) !== "cb")
      ?? teammates.find((p) => p.id !== kicker.id && !p.isGK)
      ?? null;
  }
  scored.sort((a, b) => b.weight - a.weight);
  const top = scored.slice(0, Math.min(3, scored.length));
  const i = Math.min(top.length - 1, Math.floor(rng() * top.length));
  return top[i]!.player;
}

export function applyKickOffShape(players: Player[], kicking: boolean): void {
  const own = -(players[0]?.attackSign ?? 1);
  const strikers = players.filter((p) => !p.isGK && p.slot.includes("ST"));
  const circle = CENTRE_CIRCLE_RADIUS + 1.35;

  for (const p of players) {
    p.vx = 0;
    p.vz = 0;
    p.hasBall = false;
    if (p.isGK) continue;
    if (kicking && strikers.includes(p)) continue;
    if (p.x * own < 1.2) p.x = own * Math.max(Math.abs(p.x), 4);
    const fromCentre = Math.hypot(p.x, p.z);
    if (fromCentre < circle) {
      p.x = own * Math.max(circle, Math.abs(p.x));
    }
    if (!kicking && p.x * own < circle) p.x = own * (circle + 1.5);
  }

  if (!kicking) return;
  const [first, second] = strikers;
  if (first) {
    first.x = 0;
    first.z = 0;
    // Face own half for the tap-back; hips square to the receiver once they are placed.
    first.facing = first.attackSign > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  if (second) {
    // Sit ~5.5 m from the spot so chooseKickOffReceiver can pick the partner ST.
    second.x = own * 4.2;
    second.z = first && first.z >= 0 ? -3.6 : 3.6;
    // Receiver faces the ball / taker, not the same way as the tap-back.
    if (first) second.facing = Math.atan2(first.x - second.x, first.z - second.z);
    else second.facing = second.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

/** User goals: long window — skip (Enter/Space) ends early; timer is a safety cap. */
export const USER_CELEBRATION_MAX = 22;
/** AI / autoplay goals: enough time for a full routine before kick-off. */
export const AI_CELEBRATION_SECONDS = 11;
export const KICK_OFF_PASS_DELAY = 0.55;
