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
