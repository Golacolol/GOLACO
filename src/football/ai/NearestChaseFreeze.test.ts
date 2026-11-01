import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Ball } from "../ball/Ball";
import { Player } from "../players/Player";
import { movePlayer } from "../players/PlayerMovement";
import { selectClosingPlayers } from "./DefensiveAI";
import { updateTeamAI } from "./TeamAI";

const attrs: PlayerAttributes = {
  pace: 78,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 50,
  finishing: 50,
  shotPower: 60,
  longShots: 50,
  defending: 72,
  strength: 70,
  stamina: 80,
  composure: 70,
  defensiveAwareness: 74,
  aggression: 68,
  reactions: 70,
};

function make(id: string, x: number, z: number, slot: string, side: "home" | "away" = "home"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: slot.includes("ST") ? "ST" : slot.includes("CB") ? "CB" : "CM",
    slot,
    side,
    attrs,
    overall: 72,
  });
  p.x = x;
  p.z = z;
  p.anchorX = x;
  p.anchorZ = z;
  return p;
}

describe("nearest player chase freeze", () => {
  it("keeps intent when move deltas are short (was treating <0.9m as arrived)", () => {
    const p = make("cb", 0, 0, "RCB");
    p.vx = 0;
    p.vz = 0;
    movePlayer(p, 0.16, 0.45, 0.1, true, false);
    expect(Math.hypot(p.vx, p.vz)).toBeGreaterThan(0.35);
  });

  it("always selects the absolute nearest outfielder within chase range", () => {
    const ball = new Ball();
    ball.x = 12;
    ball.z = 0;
    const farCb = make("cb", -8, 4, "LCB", "away");
    const nearSt = make("st", 10, 1, "RST", "away");
    const picked = selectClosingPlayers([farCb, nearSt], ball, 2);
    expect(picked.some((p) => p.id === "st")).toBe(true);
    expect(picked[0]?.id).toBe("st");
  });

  it("keeps the nearest closer running toward a loose ball instead of planting", () => {
    const ball = new Ball();
    ball.x = 6;
    ball.z = 0;
    ball.ownerId = null;
    const nearer = make("cb", 2.5, 0.4, "RCB", "away");
    const cover = make("cb2", -6, 8, "LCB", "away");
    const idle = make("st", -18, -10, "RST", "away");
    const start = nearer.x;
    const idleStart = idle.x;
    for (let i = 0; i < 18; i++) {
      updateTeamAI([nearer, cover, idle], "away", ball, null, 0.05, new Set());
    }
    expect(nearer.x).toBeGreaterThan(start + 0.35);
    expect(Math.hypot(nearer.vx, nearer.vz)).toBeGreaterThan(0.8);
    expect(nearer.distTo(ball.x, ball.z)).toBeLessThan(nearer.distTo(start, 0.4));
    // Non-pursuers hold shape — mass idle is OK (no swarm).
    expect(Math.abs(idle.x - idleStart)).toBeLessThan(4);
  });

  it("soft-carries the ball holder instead of freezing on a nearby run target", () => {
    const ball = new Ball();
    ball.x = 0;
    ball.z = 0;
    const carrier = make("cm", 0, 0, "LCM", "home");
    carrier.hasBall = true;
    carrier.runTargetX = 0.4;
    carrier.runTargetZ = 0.2;
    ball.ownerId = carrier.id;
    for (let i = 0; i < 12; i++) {
      updateTeamAI([carrier], "home", ball, "home", 0.05, new Set());
    }
    expect(Math.hypot(carrier.vx, carrier.vz)).toBeGreaterThan(0.45);
    expect(carrier.x).toBeGreaterThan(0.15);
  });

  it("skips a sliding nearest man and promotes the next eligible closer", () => {
    const ball = new Ball();
    ball.x = 12;
    ball.z = 0;
    const sliding = make("slide", 10, 0, "RCM", "away");
    sliding.sliding = true;
    const next = make("cb", 6, 2, "RCB", "away");
    const picked = selectClosingPlayers([sliding, next], ball, 1);
    expect(picked[0]?.id).toBe("cb");
  });

  it("assigns a presser against a live carrier inside chase range", () => {
    const ball = new Ball();
    ball.x = 8;
    ball.z = 0;
    const carrier = make("st", 8, 0, "RST", "home");
    carrier.hasBall = true;
    ball.ownerId = carrier.id;
    const nearCb = make("cb", -4, 2, "LCB", "away");
    const cover = make("cb2", -10, -8, "RCB", "away");
    const result = updateTeamAI([carrier, nearCb, cover], "away", ball, "home", 0.05, new Set());
    expect(result.pressingId).toBe("cb");
  });

  it("does not force a 60m hunter onto deep opposition build-up", () => {
    const ball = new Ball();
    ball.x = 40;
    ball.z = 0;
    const carrier = make("st", 40, 0, "RST", "home");
    carrier.hasBall = true;
    ball.ownerId = carrier.id;
    const farCb = make("cb", -20, 8, "LCB", "away");
    const cover = make("cb2", -22, -8, "RCB", "away");
    const result = updateTeamAI([carrier, farCb, cover], "away", ball, "home", 0.05, new Set());
    expect(result.pressingId).toBeNull();
  });

  it("keeps the previous presser sticky unless someone is clearly nearer", () => {
    const ball = new Ball();
    ball.x = 10;
    ball.z = 0;
    const a = make("a", 7, 1, "RCM", "away");
    const b = make("b", 6.5, -1, "LCM", "away");
    const first = selectClosingPlayers([a, b], ball, 1, { previousId: "a" });
    expect(first[0]?.id).toBe("a");
    b.x = 9.2;
    b.z = 0;
    const handoff = selectClosingPlayers([a, b], ball, 1, { previousId: "a" });
    expect(handoff[0]?.id).toBe("b");
  });
});
