import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Ball } from "../ball/Ball";
import { Player } from "../players/Player";
import {
  classifyFootballRole,
  designatePursuers,
  mustChaseLoose,
  roleOnBallBias,
  roleShapeTarget,
} from "./MatchBrain";
import { updateTeamAI } from "./TeamAI";
import { decideAttack } from "./AttackingDecision";
import { supportTarget } from "./SupportAI";
import { REAL_TUNING } from "../gameplay/GameplayTuning";

const attrs: PlayerAttributes = {
  pace: 75,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 55,
  finishing: 55,
  shotPower: 60,
  longShots: 55,
  defending: 70,
  strength: 70,
  stamina: 80,
  composure: 70,
  defensiveAwareness: 72,
  attackingAwareness: 70,
};

function make(id: string, x: number, z: number, slot: string, side: "home" | "away" = "home"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: slot.includes("ST") ? "ST" : slot === "GK" ? "GK" : slot.includes("CB") ? "CB" : "CM",
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

describe("MatchBrain position model", () => {
  it("classifies GRF-style roles across the pitch", () => {
    expect(classifyFootballRole(make("gk", -50, 0, "GK"))).toBe("GK");
    expect(classifyFootballRole(make("cb", -20, 4, "RCB"))).toBe("CB");
    expect(classifyFootballRole(make("lb", -18, 18, "LB"))).toBe("FB");
    expect(classifyFootballRole(make("dm", -8, 0, "CDM"))).toBe("DM");
    expect(classifyFootballRole(make("cm", 0, 2, "LCM"))).toBe("CM");
    expect(classifyFootballRole(make("rm", 4, 18, "RM"))).toBe("WM");
    expect(classifyFootballRole(make("am", 10, 0, "CAM"))).toBe("AM");
    expect(classifyFootballRole(make("rw", 16, 20, "RW"))).toBe("W");
    expect(classifyFootballRole(make("st", 22, 0, "RST"))).toBe("CF");
  });

  it("keeps CBs deeper than CFs when attacking", () => {
    const ball = new Ball();
    ball.x = 20;
    ball.z = 0;
    const cb = make("cb", -12, 4, "LCB");
    const cf = make("st", 8, 2, "LST");
    const cbT = roleShapeTarget(cb, ball, "home");
    const cfT = roleShapeTarget(cf, ball, "home");
    expect(cfT.x).toBeGreaterThan(cbT.x);
    expect(cfT.phase).toBe("attack");
    expect(cbT.role).toBe("CB");
    expect(cfT.role).toBe("CF");
  });

  it("holds full-backs / wingers in their wide channel in build-up", () => {
    const ball = new Ball();
    ball.x = -5;
    ball.z = 10;
    const rb = make("rb", -16, 18, "RB");
    const t = roleShapeTarget(rb, ball, "home");
    expect(t.role).toBe("FB");
    expect(t.z).toBeGreaterThan(18);
  });

  it("pushes the overlapping full-back upfield when the channel is free", () => {
    const ball = new Ball();
    ball.x = 12;
    ball.z = 6;
    const rb = make("rb", -8, 20, "RB");
    const t = roleShapeTarget(rb, ball, "home");
    expect(t.role).toBe("FB");
    expect(t.phase).toBe("attack");
    expect(t.z).toBeGreaterThan(22);
    expect(t.x).toBeGreaterThan(rb.anchorX + 4);
  });

  it("stretches the right-back wide as a pass outlet in support", () => {
    const carrier = make("cm", 0, 0, "LCM");
    const rb = make("rb", -10, 18, "RB");
    rb.anchorX = -10;
    rb.anchorZ = 20;
    const spot = supportTarget(rb, 0, 2, carrier, [carrier, rb], [], "build");
    expect(spot.role === "WIDE_OUTLET" || spot.role === "OVERLAP").toBe(true);
    expect(Math.abs(spot.z)).toBeGreaterThan(22);
  });

  it("shows the striker to feet for a lay-off in build-up", () => {
    const carrier = make("cm", 8, 0, "LCM");
    const st = make("st", 18, 2, "RST");
    st.anchorX = 22;
    st.anchorZ = 2;
    const spot = supportTarget(st, 8, 0, carrier, [carrier, st], [], "build");
    expect(
      spot.role === "CHECK_TO_BALL" ||
        spot.role === "SUPPORT_SIDE" ||
        spot.role === "FORWARD_RUN" ||
        spot.role === "EDGE_OF_BOX",
    ).toBe(true);
    // Meet around halfway — don't collapse onto a deep carrier.
    expect(spot.x).toBeGreaterThan(-5);
  });

  it("drops wingers into a mid-block when defending", () => {
    const ball = new Ball();
    ball.x = -10;
    ball.z = 8;
    const rw = make("rw", 25, 22, "RW");
    rw.anchorX = 18;
    rw.anchorZ = 24;
    const t = roleShapeTarget(rw, ball, "away");
    expect(t.phase).toBe("defend");
    expect(t.x).toBeLessThan(12);
    expect(Math.abs(t.z)).toBeGreaterThan(12);
  });

  it("stretches the CF higher once the attack crosses halfway", () => {
    const ball = new Ball();
    ball.x = 18;
    ball.z = 0;
    const st = make("st", 10, 2, "RST");
    st.anchorX = 12;
    st.anchorZ = 2;
    const t = roleShapeTarget(st, ball, "home");
    expect(t.phase).toBe("attack");
    expect(t.x).toBeGreaterThan(ball.x);
  });

  it("gives CBs pass/buildup bias and CFs shot/run bias", () => {
    const cb = roleOnBallBias(make("cb", -10, 0, "RCB"));
    const cf = roleOnBallBias(make("st", 20, 0, "RST"));
    expect(cb.pass).toBeGreaterThan(cf.pass);
    expect(cf.shot).toBeGreaterThan(cb.shot);
    expect(cf.run).toBeGreaterThan(cb.run);
    expect(cb.buildup).toBeGreaterThan(cf.buildup);
  });

  it("makes a DM prefer pass over a CF in the same pocket", () => {
    const ball = new Ball();
    const mate = make("m", 8, 8, "LCM");
    const dm = make("dm", 0, 0, "CDM");
    const cf = make("st", 0, 0, "RST");
    const dmDec = decideAttack({
      carrier: dm,
      teammates: [dm, mate],
      opponents: [make("d", 18, 0, "RCB", "away")],
      ball,
      possessionTime: 1.8,
      pressure: 0.2,
      tuning: REAL_TUNING,
      rng: () => 0,
    });
    const cfDec = decideAttack({
      carrier: cf,
      teammates: [cf, mate],
      opponents: [make("d", 18, 0, "RCB", "away")],
      ball,
      possessionTime: 1.8,
      pressure: 0.2,
      tuning: REAL_TUNING,
      rng: () => 0,
    });
    expect(dmDec.scores.passScore).toBeGreaterThan(cfDec.scores.passScore);
  });

  it("designates pursuers and keeps nearest chasing a loose ball", () => {
    const ball = new Ball();
    ball.x = 5;
    ball.z = 0;
    ball.ownerId = null;
    const near = make("a", 4, 0, "RCM", "away");
    const far = make("b", -20, 10, "LCB", "away");
    expect(designatePursuers([near, far], ball, 2)[0]?.id).toBe("a");
    expect(mustChaseLoose(near, ball, null, "a")).toBe(true);
    expect(mustChaseLoose(far, ball, null, "a")).toBe(false);
    const start = near.x;
    for (let i = 0; i < 20; i++) {
      ball.x += 0.3;
      updateTeamAI([near, far], "away", ball, null, 0.05, new Set());
    }
    expect(Math.hypot(near.vx, near.vz)).toBeGreaterThan(0.6);
    expect(near.x).toBeGreaterThan(start);
  });
});
