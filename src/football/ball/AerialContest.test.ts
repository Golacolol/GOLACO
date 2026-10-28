import { describe, expect, it } from "vitest";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import {
  aerialContestReach,
  aerialContestScore,
  aerialTimingScore,
  pickAerialFlickTarget,
  preferKeeperPunch,
  resolveAerialDuel,
  shouldHeaderContest,
} from "./AerialContest";
import { Ball } from "./Ball";

const base: PlayerAttributes = {
  pace: 70,
  passing: 60,
  longPassing: 60,
  vision: 60,
  control: 65,
  dribbling: 60,
  shooting: 55,
  finishing: 55,
  shotPower: 60,
  longShots: 50,
  defending: 50,
  strength: 70,
  stamina: 80,
  composure: 65,
  heading: 50,
  jumping: 50,
};

function make(
  id: string,
  x: number,
  z: number,
  opts?: { heading?: number; jumping?: number; heightScale?: number; slot?: string; side?: "home" | "away" },
): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 9,
    position: "ST",
    slot: opts?.slot ?? "ST",
    side: opts?.side ?? "home",
    attrs: {
      ...base,
      heading: opts?.heading ?? 50,
      jumping: opts?.jumping ?? 50,
    },
    overall: 70,
    appearance: { heightScale: opts?.heightScale ?? 1 },
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("aerial contests", () => {
  it("gives taller / better jumpers more reach", () => {
    const short = make("short", 0, 0, { jumping: 40, heightScale: 0.92 });
    const tall = make("tall", 0, 0, { jumping: 90, heightScale: 1.12 });
    const a = aerialContestReach(short, 8);
    const b = aerialContestReach(tall, 8);
    expect(b.yMax).toBeGreaterThan(a.yMax);
    expect(b.reach).toBeGreaterThan(a.reach);
  });

  it("scores heading winners ahead of nearby poor headers", () => {
    const weak = make("weak", 0.4, 0, { heading: 35, jumping: 40 });
    const strong = make("strong", 0.55, 0.1, { heading: 88, jumping: 82 });
    expect(aerialContestScore(strong, 0, 0)).toBeGreaterThan(aerialContestScore(weak, 0, 0));
  });

  it("favours a descending ball in the timing window", () => {
    const p = make("h", 0, 0, { heading: 80, jumping: 80 });
    const rising = new Ball();
    rising.y = 1.85;
    rising.vy = 3.5;
    const falling = new Ball();
    falling.y = 1.85;
    falling.vy = -2.8;
    expect(aerialTimingScore(p, falling)).toBeGreaterThan(aerialTimingScore(p, rising));
  });

  it("picks a flick-on runner ahead of the ball", () => {
    const winner = make("w", 20, 0, { heading: 80 });
    const behind = make("back", 12, 2, { slot: "CM" });
    const ahead = make("run", 30, 3, { slot: "ST", heading: 70 });
    const pick = pickAerialFlickTarget(winner, [winner, behind, ahead], 20, 0);
    expect(pick?.id).toBe("run");
  });

  it("prefers a punch on crowded high crosses", () => {
    expect(
      preferKeeperPunch({ ballY: 2.2, ballSpeed: 14, handling: 0.55, inSix: false, traffic: 3 }),
    ).toBe(true);
    expect(
      preferKeeperPunch({ ballY: 1.2, ballSpeed: 6, handling: 0.85, inSix: true, traffic: 0 }),
    ).toBe(false);
  });

  it("rewards a timed jump in the header window", () => {
    const flat = make("flat", 0, 0, { heading: 75, jumping: 80 });
    const spring = make("spring", 0, 0, { heading: 75, jumping: 80 });
    spring.jumpDuration = 0.26;
    spring.jumpTimer = 0.15; // mid-hop peak
    const ball = new Ball();
    ball.y = 1.9;
    ball.vy = -2.5;
    expect(aerialTimingScore(spring, ball)).toBeGreaterThan(aerialTimingScore(flat, ball));
  });

  it("prefers a controlled collect over header spam", () => {
    expect(
      shouldHeaderContest({
        ballY: 1.55,
        ballVy: -2,
        ballSpeed: 7,
        contested: false,
        heading: 0.7,
        control: 0.65,
        incomingAerial: true,
      }),
    ).toBe(false);
    expect(
      shouldHeaderContest({
        ballY: 1.55,
        contested: false,
        heading: 0.7,
        control: 0.65,
        incomingAerial: true,
        headerCooldown: 1.2,
      }),
    ).toBe(false);
    expect(
      shouldHeaderContest({
        ballY: 2.3,
        ballVy: -1,
        ballSpeed: 12,
        contested: true,
        heading: 0.55,
        control: 0.5,
        incomingAerial: true,
      }),
    ).toBe(true);
  });

  it("lets height and jumping decide close cross-side duels", () => {
    const short = make("short", 0.3, 0, {
      heading: 70,
      jumping: 45,
      heightScale: 0.92,
      side: "home",
    });
    const tall = make("tall", 0.35, 0.05, {
      heading: 70,
      jumping: 88,
      heightScale: 1.12,
      side: "away",
    });
    tall.jumpDuration = 0.26;
    tall.jumpTimer = 0.14;
    const ball = new Ball();
    ball.y = 2.0;
    ball.vy = -2.2;
    // Deterministic: always pick the stronger side when rng is extreme.
    const duel = resolveAerialDuel([short, tall], ball, () => 0.99, 1, 1.1);
    expect(duel?.winner.id).toBe("tall");
    expect(duel?.contested).toBe(true);
  });
});
