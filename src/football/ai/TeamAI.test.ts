import { describe, expect, it } from "vitest";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import { Ball } from "../ball/Ball";
import { updateTeamAI } from "./TeamAI";

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 50,
  finishing: 50,
  shotPower: 60,
  longShots: 50,
  defending: 60,
  strength: 70,
  stamina: 80,
  composure: 70,
};

function make(id: string, x: number, z: number, slot: string, side: "home" | "away" = "home"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: slot === "GK" ? "GK" : slot.includes("ST") ? "ST" : "CM",
    slot,
    side,
    attrs,
    overall: 70,
  });
  p.x = x;
  p.z = z;
  p.anchorX = slot === "GK" ? x : -10;
  p.anchorZ = 0;
  return p;
}

describe("team shape when the keeper has the ball", () => {
  it("sends outfield players back toward their default positions", () => {
    const gk = make("gk", -50, 0, "GK");
    gk.hasBall = true;
    const st = make("st", 36, 4, "LST");
    const ball = new Ball();
    ball.x = gk.x;
    ball.z = gk.z;
    ball.ownerId = gk.id;
    const before = st.x;
    updateTeamAI([gk, st], "home", ball, "home", 0.2, new Set(), { keeperHold: true });
    expect(st.desiredX).toBe(st.anchorX);
    expect(st.x).toBeLessThan(before);
  });

  it("keeps opposition attackers clear of the keeper instead of hunting him", () => {
    const gk = make("gk", -50, 0, "GK", "home");
    gk.hasBall = true;
    const st = make("st", -40, 2, "RST", "away");
    st.anchorX = 20;
    st.anchorZ = 4;
    const ball = new Ball();
    ball.x = gk.x;
    ball.z = gk.z;
    ball.ownerId = gk.id;
    updateTeamAI([gk, st], "away", ball, "home", 0.16, new Set(), { keeperHold: true });
    expect(st.desiredX).toBeGreaterThan(gk.x + 14);
    expect(Math.hypot(st.desiredX - ball.x, st.desiredZ - ball.z)).toBeGreaterThan(15);
  });
});

describe("team width after kick-off", () => {
  it("does not collapse both CMs onto the ball after the opening pass", () => {
    const carrier = make("cm", 2, 0, "RCM");
    carrier.hasBall = true;
    carrier.anchorX = 0;
    carrier.anchorZ = 6;
    const lcm = make("lcm", -2, -12, "LCM");
    lcm.anchorX = 0;
    lcm.anchorZ = -12;
    const rcm = make("rcm", -1, 12, "RCM");
    rcm.anchorX = 0;
    rcm.anchorZ = 12;
    const ball = new Ball();
    ball.x = carrier.x;
    ball.z = carrier.z;
    ball.ownerId = carrier.id;
    updateTeamAI([carrier, lcm, rcm], "home", ball, "home", 0.2, new Set());
    expect(Math.abs(lcm.desiredZ)).toBeGreaterThan(7);
    expect(Math.abs(rcm.desiredZ)).toBeGreaterThan(7);
    expect(Math.abs(lcm.desiredZ - rcm.desiredZ)).toBeGreaterThan(12);
  });

  it("stores kick-off desires on formation anchors", () => {
    const st = make("st", 8, 4, "LST");
    st.anchorX = 12;
    st.anchorZ = 6;
    const ball = new Ball();
    updateTeamAI([st], "home", ball, null, 0.16, new Set(), { kickOff: true });
    expect(st.desiredX).toBe(st.anchorX);
    expect(st.desiredZ).toBe(st.anchorZ);
  });
});

describe("one hunter with formation cover", () => {
  it("sends the nearest defender to the carrier while cover holds lateral shape", () => {
    const carrier = make("st", 8, 0, "RST", "home");
    carrier.hasBall = true;
    const nearer = make("cm", 4, 1, "RCM", "away");
    nearer.anchorX = -2;
    nearer.anchorZ = 6;
    const lcb = make("lcb", -14, -7, "LCB", "away");
    lcb.anchorX = -16;
    lcb.anchorZ = -7;
    const rcb = make("rcb", -14, 7, "RCB", "away");
    rcb.anchorX = -16;
    rcb.anchorZ = 7;
    const ball = new Ball();
    ball.x = carrier.x;
    ball.z = carrier.z;
    ball.ownerId = carrier.id;
    const result = updateTeamAI([carrier, nearer, lcb, rcb], "away", ball, "home", 0.16, new Set());
    expect(result.pressingId).toBe("cm");
    expect(Math.abs(lcb.desiredZ)).toBeGreaterThan(4);
    expect(Math.abs(rcb.desiredZ)).toBeGreaterThan(4);
    expect(Math.abs(lcb.desiredZ - rcb.desiredZ)).toBeGreaterThan(8);
    // Cover CBs stay deeper than the hunter's press lane.
    expect(lcb.desiredX).toBeLessThan(nearer.desiredX - 2);
    expect(rcb.desiredX).toBeLessThan(nearer.desiredX - 2);
  });
});
