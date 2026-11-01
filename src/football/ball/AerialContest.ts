import { clamp, normalize2, stat01 } from "../../core/math";
import type { Ball } from "./Ball";
import type { Player } from "../players/Player";
import { aerialReachIndex } from "../players/PlayerStats";
import { BALL_GRAVITY } from "../constants";

export type HeaderKind = "clear" | "flick" | "nod" | "goal";

/** Height in cm from the procedural player scale. */
export function playerHeightCm(player: Player): number {
  return Math.round(player.height * 100);
}

export function aerialReachBonus(player: Player): number {
  return aerialReachIndex(player.attrs, playerHeightCm(player));
}

/** True when the ball is in header contest range (not a ground collect). */
export function isAerialBall(ball: Ball, incomingAerial = false): boolean {
  return ball.y > 1.28 || incomingAerial || (ball.y > 0.95 && ball.vy > 2.2);
}

/** Horizontal + vertical reach for an aerial contest. */
export function aerialContestReach(player: Player, ballSpeed: number): { reach: number; yMax: number } {
  const air = aerialReachBonus(player);
  const jump = stat01(player.attrs.jumping ?? player.attrs.strength);
  const head = stat01(player.attrs.heading ?? 50);
  const jumpReach = 1.55 + air * 1.45 + jump * 0.55 + head * 0.28;
  const reach = (ballSpeed < 0.85 ? 2.25 : 1.55) + jumpReach * 0.48;
  const yMax = 1.55 + jumpReach;
  return { reach, yMax };
}

/**
 * Timing window: best contact as the ball descends through header height (~1.6–2.4m).
 * Rising balls are harder; balls already above jump reach score poorly.
 * A committed jump pose (jumpTimer in the sweet spot) rewards early spring.
 */
export function aerialTimingScore(player: Player, ball: Ball, timingMul = 1): number {
  const { yMax } = aerialContestReach(player, Math.hypot(ball.vx, ball.vz));
  if (ball.y > yMax + 0.35) return 0.05;
  const ideal = clamp(1.75 + aerialReachBonus(player) * 0.35, 1.55, 2.35);
  const heightFit = 1 - clamp(Math.abs(ball.y - ideal) / 1.1, 0, 1);
  // Prefer descending ball (classic header timing).
  const descend = ball.vy < 0.4 ? 0.35 + clamp(-ball.vy / 8, 0, 0.35) : clamp(0.2 - ball.vy / 14, 0, 0.2);
  // Peak contact mid-jump (progress ~0.28–0.52 of the short hop).
  let jumpCommit = 0;
  const dur = player.jumpDuration > 0.05 ? player.jumpDuration : 0.24;
  const jumpProg = 1 - clamp(player.jumpTimer / dur, 0, 1);
  if (jumpProg > 0.28 && jumpProg < 0.55) jumpCommit = 0.38;
  else if (player.jumpTimer > 0.04) jumpCommit = 0.12;
  else if (ball.y > 1.6) jumpCommit = -0.12; // late / flat-footed under a high ball
  const raw = heightFit * 0.55 + descend + jumpCommit;
  return clamp(raw * clamp(timingMul, 0.55, 1.45), 0.02, 1.35);
}

/** Higher = more likely to win the jump. */
export function aerialContestScore(
  player: Player,
  ballX: number,
  ballZ: number,
  ball?: Ball,
  timingMul = 1,
): number {
  const air = aerialReachBonus(player);
  const dist = player.distTo(ballX, ballZ);
  const jump = stat01(player.attrs.jumping ?? player.attrs.strength);
  const heightCm = playerHeightCm(player);
  const heightTerm = clamp((heightCm - 170) / 35, -0.35, 0.55);
  const timing = ball ? aerialTimingScore(player, ball, timingMul) : 0.45 * timingMul;
  return (
    1.95 -
    dist +
    stat01(player.attrs.heading ?? player.attrs.finishing) * 0.58 +
    air * 0.52 +
    jump * 0.42 +
    heightTerm * 0.38 +
    stat01(player.attrs.strength) * 0.14 +
    timing * 0.95 +
    (player.isGK ? 0.4 + stat01(player.attrs.gkHandling ?? player.attrs.composure) * 0.28 : 0)
  );
}

/**
 * Resolve a contested header between nearby jumpers.
 * Cross-side duels use a weighted dice roll (same spirit as ground contests).
 */
export function resolveAerialDuel(
  challengers: Player[],
  ball: Ball,
  rng: () => number = Math.random,
  upsetMul = 1,
  timingMul = 1,
): { winner: Player; contested: boolean; margin: number } | null {
  if (!challengers.length) return null;
  if (challengers.length === 1) {
    return { winner: challengers[0]!, contested: false, margin: 1.5 };
  }

  const ranked = challengers
    .map((p) => ({ p, score: aerialContestScore(p, ball.x, ball.z, ball, timingMul) }))
    .sort((a, b) => b.score - a.score);

  const sides = new Set(challengers.map((c) => c.side));
  if (sides.size < 2) {
    return {
      winner: ranked[0]!.p,
      contested: false,
      margin: ranked[0]!.score - (ranked[1]?.score ?? ranked[0]!.score - 1),
    };
  }

  const bestHome = ranked.find((r) => r.p.side === "home");
  const bestAway = ranked.find((r) => r.p.side === "away");
  if (!bestHome || !bestAway) {
    return { winner: ranked[0]!.p, contested: true, margin: 0.2 };
  }

  const a = bestHome.score;
  const b = bestAway.score;
  const total = Math.max(0.08, a + b);
  const softUpset = clamp(upsetMul, 0.45, 1.55);
  // Soften mismatches so a well-timed smaller jumper can still pinch one.
  let homeChance = clamp(0.5 + ((a - b) / total) * 0.78, 0.1, 0.9);
  homeChance = 0.5 + (homeChance - 0.5) / softUpset;
  homeChance = clamp(homeChance, 0.12, 0.88);
  const winner = rng() < homeChance ? bestHome.p : bestAway.p;
  const margin = Math.abs(a - b);
  return { winner, contested: true, margin };
}

/**
 * Prefer a controlled collect (chest/foot) whenever the ball is takeable.
 * Headers are for high / contested / goal-mouth situations — never chain-spam.
 */
export function shouldHeaderContest(opts: {
  ballY: number;
  contested: boolean;
  heading: number;
  control: number;
  incomingAerial: boolean;
  ballVy?: number;
  ballSpeed?: number;
  headerCooldown?: number;
}): boolean {
  if ((opts.headerCooldown ?? 0) > 0.05) return false;
  if (opts.ballY < 1.18 && !opts.incomingAerial) return false;

  const speed = opts.ballSpeed ?? 0;
  const descending = (opts.ballVy ?? -1) < 1.2;
  // Trap window: ball dropping into body height with enough control.
  const canTrap =
    opts.ballY < 1.68 &&
    descending &&
    opts.control >= 0.42 &&
    speed < 10.2 + opts.control * 4 &&
    !opts.incomingAerial;
  if (canTrap && !opts.contested) return false;
  if (canTrap && opts.contested && opts.control + 0.1 >= opts.heading) return false;

  // Incoming set-piece / lofted service: prefer the header once it hangs or is contested.
  if (opts.incomingAerial && opts.ballY > 1.35) {
    if (opts.contested || opts.ballY > 1.72) return true;
    if (opts.heading + 0.08 >= opts.control && opts.ballY > 1.55) return true;
  }
  // Truly high / hot aerials: header is the only honest option.
  if (opts.ballY > 2.05) return opts.heading > 0.28 || opts.contested || opts.incomingAerial;
  if (opts.contested && opts.ballY > 1.48) return true;
  if (opts.ballY > 1.72) return opts.heading > opts.control + 0.02 || opts.incomingAerial;
  // Soft loft: nod on when heading is competitive.
  return opts.heading > opts.control + 0.1 && opts.ballY > 1.42;
}

export function pickAerialFlickTarget(
  winner: Player,
  teammates: Player[],
  ballX: number,
  ballZ: number,
): Player | null {
  const dir = winner.attackSign;
  let best: Player | null = null;
  let bestScore = -1;
  for (const mate of teammates) {
    if (mate.id === winner.id || mate.isGK || mate.sentOff) continue;
    const ahead = (mate.x - ballX) * dir;
    if (ahead < 2.5 || ahead > 22) continue;
    const lateral = Math.abs(mate.z - ballZ);
    if (lateral > 16) continue;
    const gap = winner.distTo(mate.x, mate.z);
    if (gap < 3.5 || gap > 20) continue;
    const score = ahead * 0.55 - lateral * 0.12 + (14 - gap) * 0.08 + stat01(mate.attrs.heading ?? 50) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }
  return bestScore > 1.2 ? best : null;
}

/** Build a realistic header impulse (clear / flick / nod / goal). */
export function headerKickVector(
  winner: Player,
  kind: HeaderKind,
  aimX: number,
  aimZ: number,
): { vx: number; vz: number; vy: number; power: number; lift: number } {
  const head = stat01(winner.attrs.heading ?? winner.attrs.finishing);
  const str = stat01(winner.attrs.strength);
  const dir = normalize2(aimX - winner.x, aimZ - winner.z);
  let power = 8;
  let lift = 2.4;
  if (kind === "clear") {
    power = 12 + head * 6 + str * 4;
    lift = 4.2 + (1 - head) * 1.8;
  } else if (kind === "flick") {
    power = 9 + head * 5;
    lift = 3.4 + head * 1.6;
  } else if (kind === "nod") {
    power = 7.5 + head * 4;
    lift = 1.1 + head * 0.9;
  } else {
    // goal header — driven downward / flat
    power = 11 + head * 7 + str * 2;
    lift = 0.85 + (1 - head) * 0.7;
  }
  // Hang time scale with gravity so lofted headers still challenge keepers.
  lift *= BALL_GRAVITY / 15.4;
  return {
    vx: dir.x * power,
    vz: dir.z * power,
    vy: lift,
    power,
    lift,
  };
}

/** Prefer punch when a high cross is crowded in the box. */
export function preferKeeperPunch(opts: {
  ballY: number;
  ballSpeed: number;
  handling: number;
  inSix: boolean;
  traffic: number;
}): boolean {
  if (opts.ballY < 1.55) return false;
  if (opts.inSix && opts.traffic < 2 && opts.handling > 0.62) return false;
  const crowd = clamp(opts.traffic / 3, 0, 1);
  const high = clamp((opts.ballY - 1.4) / 1.4, 0, 1);
  const hot = clamp((opts.ballSpeed - 8) / 12, 0, 1);
  return crowd * 0.45 + high * 0.35 + hot * 0.25 + (1 - opts.handling) * 0.2 > 0.52;
}
