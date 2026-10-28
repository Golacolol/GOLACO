import type { Player } from "../players/Player";

export interface HudFocus {
  home: Player | null;
  away: Player | null;
}

export function closestPlayer(players: Player[], x: number, z: number, skipId?: string): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (skipId && p.id === skipId) continue;
    const d = p.distTo(x, z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function sideFocus(possessing: Player | null, side: "home" | "away", all: Player[], ballX: number, ballZ: number): Player | null {
  const pool = all.filter((p) => p.side === side);
  if (possessing?.side === side) return possessing;
  return closestPlayer(pool, ballX, ballZ);
}

/** Home card then away card: on-ball player for that side, or nearest to the ball. */
export function hudFocusPlayers(
  possessing: Player | null,
  all: Player[],
  ballX: number,
  ballZ: number,
  _userSide?: "home" | "away",
): HudFocus {
  void _userSide;
  return {
    home: sideFocus(possessing, "home", all, ballX, ballZ),
    away: sideFocus(possessing, "away", all, ballX, ballZ),
  };
}
