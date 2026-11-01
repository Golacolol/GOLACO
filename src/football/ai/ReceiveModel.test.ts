import { describe, expect, it } from "vitest";
import type { PlayerAttributes } from "../../data/schema";
import { Ball } from "../ball/Ball";
import { Player } from "../players/Player";
import { topSpeedFromPace } from "../players/PlayerMovement";
import { planReceiveRun, receiveIsAerialOwned, receiveLeadSeconds } from "./ReceiveModel";

const attrs: PlayerAttributes = {
  pace: 72,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 60,
  finishing: 60,
  shotPower: 60,
  longShots: 55,
  defending: 55,
  strength: 70,
  stamina: 80,
  composure: 70,
};

function makeReceiver(): Player {
  const p = new Player({
    id: "r",
    name: "r",
    displayName: "r",
    shirtNumber: 7,
    position: "CM",
    slot: "CM",
    side: "home",
    attrs,
    overall: 70,
  });
  p.x = 0;
  p.z = 0;
  return p;
}

describe("ReceiveModel", () => {
  it("does not force sprint on a short soft pass the jog can meet", () => {
    const r = makeReceiver();
    r.x = 4;
    const ball = new Ball();
    ball.x = 0;
    ball.z = 0;
    ball.vx = 6;
    ball.vz = 0;
    const plan = planReceiveRun(r, ball, { speedMul: 1 });
    expect(plan.sprint).toBe(false);
    expect(plan.speedMul).toBeLessThanOrEqual(1);
  });

  it("sprints when late to a fast ball", () => {
    const r = makeReceiver();
    r.x = -18;
    const ball = new Ball();
    ball.x = 0;
    ball.z = 0;
    ball.vx = 16;
    ball.vz = 0;
    const plan = planReceiveRun(r, ball, { speedMul: 1 });
    expect(plan.sprint).toBe(true);
    const cap = topSpeedFromPace(r.attrs.pace, true, false) * plan.speedMul;
    expect(cap).toBeLessThan(topSpeedFromPace(r.attrs.pace, true, false) * 1.01);
  });

  it("sprints onto a dying underhit pass instead of jogging while attackers arrive", () => {
    const r = makeReceiver();
    r.x = -8;
    const ball = new Ball();
    ball.x = 0;
    ball.z = 0;
    ball.vx = 1.2;
    ball.vz = 0;
    const plan = planReceiveRun(r, ball, { speedMul: 1 });
    expect(plan.sprint).toBe(true);
    expect(plan.speedMul).toBeGreaterThan(1);
  });

  it("hands aerial runs to the lofted path; settled lofted flags resume ground steering", () => {
    const ball = new Ball();
    ball.y = 1.5;
    expect(receiveIsAerialOwned(ball, false, false)).toBe(true);
    ball.y = 0.2;
    ball.vy = 0;
    expect(receiveIsAerialOwned(ball, false, true)).toBe(false);
    // Stale lofted flag with the ball on the carpet must NOT park FB outlets.
    expect(receiveIsAerialOwned(ball, true, true)).toBe(false);
    ball.y = 1.0;
    ball.vy = 2;
    expect(receiveIsAerialOwned(ball, true, true)).toBe(true);
    expect(receiveIsAerialOwned(ball, false, false)).toBe(false);
  });

  it("keeps lead seconds in a human intercept window", () => {
    const ball = new Ball();
    ball.vx = 20;
    ball.vz = 0;
    expect(receiveLeadSeconds(ball)).toBeLessThanOrEqual(0.55);
    expect(receiveLeadSeconds(ball)).toBeGreaterThan(0.3);
    ball.vx = 2;
    expect(receiveLeadSeconds(ball)).toBeGreaterThanOrEqual(0.18);
  });
});
