import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import { Player } from "../players/Player";
import { applySetPieceShape, setPieceTarget } from "./SetPieceAI";
import { inPenaltyArea, inSixYardArea } from "../pitch/PitchZones";

const attrs: PlayerAttributes = {
  pace: 70, passing: 60, longPassing: 60, vision: 60, control: 60, dribbling: 60,
  shooting: 50, finishing: 50, shotPower: 55, longShots: 45, defending: 60, strength: 70, stamina: 80, composure: 70,
};

function make(id: string, slot: string, side: "home" | "away"): Player {
  const p = new Player({
    id, name: id, displayName: id, shirtNumber: 8,
    position: slot.includes("ST") ? "ST" : slot === "GK" ? "GK" : "CM",
    slot, side, attrs, overall: 70,
  });
  return p;
}

describe("set pieces", () => {
  it("puts both teams into a corner shape around the right goal", () => {
    const taker = make("taker", "RM", "home");
    taker.x = HALF_LENGTH - 0.5;
    taker.z = HALF_WIDTH - 0.5;
    const st = make("st", "RST", "home");
    const cb = make("cb", "LCB", "home");
    const defGk = make("gk", "GK", "away");
    const defCb = make("dcb", "RCB", "away");
    const ctx = { kind: "CORNER" as const, takingSide: "home" as const, ballX: HALF_LENGTH - 0.45, ballZ: HALF_WIDTH - 0.42, takerId: taker.id };
    applySetPieceShape([taker, st, cb, defGk, defCb], ctx);
    expect(taker.x).toBeCloseTo(HALF_LENGTH - 0.5, 1);
    expect(st.distTo(HALF_LENGTH, 0)).toBeLessThan(cb.distTo(HALF_LENGTH, 0));
    expect(defGk.x).toBeGreaterThan(HALF_LENGTH - 3);
    expect(Math.abs(defGk.z)).toBeLessThan(1.5);
    expect(Math.abs(defCb.x)).toBeGreaterThan(30);
  });

  it("soft corner shape only sets desired marks so players must run into position", () => {
    const st = make("st", "RST", "home");
    st.x = 0;
    st.z = 0;
    const defCb = make("dcb", "RCB", "away");
    defCb.x = 10;
    defCb.z = 8;
    const ctx = {
      kind: "CORNER" as const,
      takingSide: "home" as const,
      ballX: HALF_LENGTH - 0.45,
      ballZ: HALF_WIDTH - 0.42,
      takerId: "taker",
    };
    applySetPieceShape([st, defCb], ctx, { soft: true });
    expect(st.x).toBe(0);
    expect(defCb.x).toBe(10);
    expect(Math.hypot(st.desiredX - st.x, st.desiredZ - st.z)).toBeGreaterThan(20);
    expect(Math.hypot(defCb.desiredX - defCb.x, defCb.desiredZ - defCb.z)).toBeGreaterThan(15);
  });

  it("builds a defensive wall on a shooting-range free kick", () => {
    const wall = make("cb", "LCB", "away");
    const ctx = { kind: "FREE_KICK" as const, takingSide: "home" as const, ballX: 24, ballZ: 4, takerId: "taker" };
    const spot = setPieceTarget(wall, ctx);
    const dist = Math.hypot(spot.x - 24, spot.z - 4);
    expect(dist).toBeGreaterThan(8);
    expect(dist).toBeLessThan(12);
    expect(spot.x).toBeGreaterThan(24);
  });

  it("only nudges the defending block toward a throw-in instead of teleporting the whole team", () => {
    const dcb = make("dcb", "RCB", "away");
    dcb.anchorX = 18;
    dcb.anchorZ = 6;
    dcb.x = 18;
    dcb.z = 6;
    const dst = make("st", "RST", "away");
    dst.anchorX = -14;
    dst.anchorZ = -5;
    dst.x = -14;
    dst.z = -5;
    const ctx = { kind: "THROW_IN" as const, takingSide: "home" as const, ballX: 8, ballZ: HALF_WIDTH - 0.4 };
    const cbSpot = setPieceTarget(dcb, ctx);
    const stSpot = setPieceTarget(dst, ctx);
    expect(Math.abs(cbSpot.x - dcb.anchorX)).toBeLessThan(8);
    expect(Math.abs(cbSpot.z - dcb.anchorZ)).toBeLessThan(8);
    expect(Math.abs(stSpot.x - dst.anchorX)).toBeLessThan(8);
    expect(Math.hypot(cbSpot.x - 8, cbSpot.z - ctx.ballZ)).toBeGreaterThan(12);
  });

  it("keeps opposition outside the box and behind the last defender on a goal kick", () => {
    const ballX = -HALF_LENGTH + 5.5;
    const ballZ = 4;
    const ctx = { kind: "GOAL_KICK" as const, takingSide: "home" as const, ballX, ballZ, takerId: "gk" };
    const takingCb = make("hcb", "LCB", "home");
    const oppGk = make("agk", "GK", "away");
    const oppCb = make("acb", "RCB", "away");
    const oppSt = make("ast", "RST", "away");
    const oppCm = make("acm", "LCM", "away");
    const lastDefX = ballX + 12;
    const boxEdge = -HALF_LENGTH + 16.5;

    for (const p of [oppGk, oppCb, oppSt, oppCm]) {
      const spot = setPieceTarget(p, ctx);
      expect(spot.x).toBeGreaterThan(boxEdge + 1);
      if (!p.isGK) expect(spot.x).toBeGreaterThanOrEqual(lastDefX + 1);
    }
    const takingSpot = setPieceTarget(takingCb, ctx);
    expect(takingSpot.x).toBeCloseTo(lastDefX, 0);
    const oppGkSpot = setPieceTarget(oppGk, ctx);
    expect(oppGkSpot.x).toBeGreaterThan(HALF_LENGTH - 3);
  });

  it("keeps free-kick attackers near the kick and builds a wall / offside line", () => {
    const ballX = HALF_LENGTH - 20;
    const ballZ = 6;
    const ctx = {
      kind: "FREE_KICK" as const,
      takingSide: "home" as const,
      ballX,
      ballZ,
      takerId: "taker",
      endsFlipped: false,
    };
    const attSt = make("st", "RST", "home");
    const attCm = make("cm", "LCM", "home");
    const defGk = make("gk", "GK", "away");
    const defCb = make("cb", "LCB", "away");
    const wall = make("wall", "RCM", "away");
    const attSpot = setPieceTarget(attSt, ctx);
    const cmSpot = setPieceTarget(attCm, ctx);
    const gkSpot = setPieceTarget(defGk, ctx);
    const cbSpot = setPieceTarget(defCb, ctx);
    const wallSpot = setPieceTarget(wall, ctx);
    expect(inPenaltyArea(attSpot.x, attSpot.z, "away")).toBe(false);
    expect(inSixYardArea(attSpot.x, attSpot.z, "away")).toBe(false);
    expect(inSixYardArea(cbSpot.x, cbSpot.z, "away")).toBe(false);
    expect(Math.abs(gkSpot.x)).toBeGreaterThan(HALF_LENGTH - 2);
    // Attackers should not abandon the kick for the far box edge.
    expect(Math.hypot(attSpot.x - ballX, attSpot.z - ballZ)).toBeLessThan(22);
    expect(Math.hypot(cmSpot.x - ballX, cmSpot.z - ballZ)).toBeLessThan(18);
    expect(Math.hypot(wallSpot.x - ballX, wallSpot.z - ballZ)).toBeGreaterThan(8);
    expect(Math.hypot(wallSpot.x - ballX, wallSpot.z - ballZ)).toBeLessThan(13);
  });

  it("keeps midfield free-kick attackers close to the ball instead of the box", () => {
    const ctx = {
      kind: "FREE_KICK" as const,
      takingSide: "home" as const,
      ballX: 0,
      ballZ: 4,
      takerId: "taker",
      endsFlipped: false,
    };
    const attSt = make("st", "RST", "home");
    const spot = setPieceTarget(attSt, ctx);
    expect(Math.abs(spot.x)).toBeLessThan(20);
    expect(Math.hypot(spot.x - 0, spot.z - 4)).toBeLessThan(18);
  });

  it("keeps everyone except GK and taker outside the box for a penalty", () => {
    const ballX = HALF_LENGTH - 11;
    const ctx = {
      kind: "PENALTY" as const,
      takingSide: "home" as const,
      ballX,
      ballZ: 0,
      takerId: "taker",
      endsFlipped: false,
    };
    const attSt = make("st", "RST", "home");
    const defCb = make("cb", "RCB", "away");
    const defGk = make("gk", "GK", "away");
    const attSpot = setPieceTarget(attSt, ctx);
    const cbSpot = setPieceTarget(defCb, ctx);
    const gkSpot = setPieceTarget(defGk, ctx);
    expect(inPenaltyArea(attSpot.x, attSpot.z, "away")).toBe(false);
    expect(inPenaltyArea(cbSpot.x, cbSpot.z, "away")).toBe(false);
    expect(Math.abs(gkSpot.x)).toBeGreaterThan(HALF_LENGTH - 1.5);
    // Both teams should hold the edge of the box, not flee deep.
    expect(Math.abs(attSpot.x)).toBeGreaterThan(HALF_LENGTH - 20);
    expect(Math.abs(cbSpot.x)).toBeGreaterThan(HALF_LENGTH - 20);
  });
});
