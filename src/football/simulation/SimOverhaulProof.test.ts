/**
 * Phase 4 proof: pursuit gates, ST onside depth, ground pass loft, settle residual.
 */
import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Ball } from "../ball/Ball";
import { passKickVector } from "../ball/PassModel";
import { settleFirstTouch } from "../ball/PossessionActor";
import { Player } from "../players/Player";
import { designatePursuers, mustChaseLoose } from "../ai/MatchBrain";
import { supportTarget } from "../ai/SupportAI";
import { updateTeamAI } from "../ai/TeamAI";
import { offsideLineX } from "../rules/Offside";

const attrs: PlayerAttributes = {
  pace: 78,
  passing: 72,
  longPassing: 70,
  vision: 74,
  control: 76,
  dribbling: 70,
  shooting: 68,
  finishing: 70,
  shotPower: 68,
  longShots: 60,
  defending: 70,
  strength: 72,
  stamina: 82,
  composure: 72,
  defensiveAwareness: 72,
  aggression: 65,
  reactions: 70,
};

function make(id: string, x: number, z: number, slot: string, side: "home" | "away" = "home"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 9,
    position: slot.includes("ST") ? "ST" : slot.includes("CB") ? "CB" : slot.includes("GK") ? "GK" : "CM",
    slot,
    side,
    attrs,
    overall: 74,
  });
  p.x = x;
  p.z = z;
  p.anchorX = x;
  p.anchorZ = z;
  return p;
}

describe("sim overhaul proof", () => {
  it("assigns at most one full-chase primary per side on a loose ball", () => {
    const ball = new Ball();
    ball.x = 4;
    ball.z = 0;
    ball.ownerId = null;
    const pool = [
      make("cb1", 1, 1, "RCB", "away"),
      make("cb2", -4, 6, "LCB", "away"),
      make("dm", -8, 0, "CDM", "away"),
      make("st", -16, -4, "RST", "away"),
      make("cm", -10, 8, "LCM", "away"),
    ];
    const pursuers = designatePursuers(pool, ball, 2);
    expect(pursuers.length).toBeLessThanOrEqual(2);
    const primary = pursuers[0]!;
    expect(mustChaseLoose(primary, ball, null, primary.id)).toBe(true);
    for (const p of pool) {
      if (p.id === primary.id) continue;
      expect(mustChaseLoose(p, ball, null, primary.id)).toBe(false);
    }

    const result = updateTeamAI(pool, "away", ball, null, 0.05, new Set());
    expect(result.primaryPursuerId).toBe(primary.id);
    // Default: ONE hunter. A support man (if any) only contains — never a second presser.
    expect(result.supportPursuerId == null || result.supportPursuerId !== result.primaryPursuerId).toBe(true);

    for (let i = 0; i < 12; i++) {
      updateTeamAI(pool, "away", ball, null, 0.05, new Set());
    }
    const far = pool.find((p) => p.id === "st")!;
    expect(Math.abs(far.x - far.anchorX)).toBeLessThan(6);
    expect(Math.hypot(primary.vx, primary.vz)).toBeGreaterThan(0.4);
    // The contain/support man holds a stand-off instead of closing into the collect ring.
    if (result.supportPursuerId) {
      const support = pool.find((p) => p.id === result.supportPursuerId)!;
      const supportGap = support.distTo(ball.x, ball.z);
      expect(supportGap).toBeGreaterThan(2.2);
    }
  });

  it("only draws a second man into the ball on an intentional double-team", () => {
    const ball = new Ball();
    ball.x = 4;
    ball.z = 0;
    ball.ownerId = null;
    const build = () => [
      make("cb1", 1, 1, "RCB", "away"),
      make("cb2", -4, 6, "LCB", "away"),
      make("dm", -8, 0, "CDM", "away"),
      make("st", -16, -4, "RST", "away"),
      make("cm", -10, 8, "LCM", "away"),
    ];
    const single = build();
    const one = updateTeamAI(single, "away", ball, null, 0.05, new Set());
    const pressers = single.filter((p) => p.id === one.primaryPursuerId);
    expect(pressers).toHaveLength(1);

    const double = build();
    const forced = [double[0]!, double[1]!];
    const two = updateTeamAI(double, "away", ball, "home", 0.05, new Set(), {
      forceClosers: forced,
      aggressivePress: true,
    });
    expect(two.pressingId).toBe(forced[0]!.id);
    for (const p of forced) {
      expect(Math.hypot(p.desiredX - ball.x, p.desiredZ - ball.z)).toBeLessThan(4);
    }
  });

  it("places ST ahead of midfield but onside in attack phase", () => {
    const carrier = make("cm", 12, 0, "LCM", "home");
    // Id chosen so hashRole % 2 === 0 → FORWARD_RUN / PENALTY_AREA_RUN in progressive phases.
    const st = make("sta", 20, 2, "RST", "home");
    st.anchorX = 24;
    st.anchorZ = 3;
    const d1 = make("d1", 34, -3, "LCB", "away");
    const d2 = make("d2", 33, 4, "RCB", "away");
    const gk = make("gk", 48, 0, "GK", "away");
    const spot = supportTarget(st, 12, 0, carrier, [carrier, st], [d1, d2, gk], "chance");
    const line = offsideLineX([d1, d2, gk], st.attackSign);
    expect(spot.role === "FORWARD_RUN" || spot.role === "PENALTY_AREA_RUN").toBe(true);
    expect(spot.x).toBeGreaterThan(carrier.x + 4);
    expect((spot.x - line) * st.attackSign).toBeLessThanOrEqual(0.05);
  });

  it("keeps short and through ground passes mid-loft (not flat lasers or missiles)", () => {
    const short = passKickVector(0, 0, 14, 2, "short");
    const through = passKickVector(0, 0, 18, 1, "through");
    // Modest loft bump over the old carpet-hugger — still not a missile.
    expect(short.vy).toBeGreaterThan(3.4);
    expect(short.vy).toBeLessThan(6.5);
    expect(through.vy).toBeGreaterThan(2.8);
    expect(through.vy).toBeLessThan(6.1);
    expect(Math.hypot(short.vx, short.vz)).toBeGreaterThan(6);
    expect(Math.hypot(through.vx, through.vz)).toBeGreaterThan(6);
  });

  it("settles short-collect residual speed under foot", () => {
    const ball = new Ball();
    ball.y = 0.22;
    ball.vx = 11;
    ball.vz = 2;
    ball.vy = 0.3;
    const result = settleFirstTouch(ball, {
      control: 80,
      strength: 72,
      pressure: 0.12,
      energy: 1,
      aerial: false,
      zone: "foot",
      rng: () => 0.5,
    });
    expect(result.lost).toBe(false);
    expect(result.settle).toBeGreaterThanOrEqual(0.9);
    expect(Math.hypot(ball.vx, ball.vz)).toBeLessThan(1.0);
  });
});
