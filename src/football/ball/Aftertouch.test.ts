import { describe, expect, it } from "vitest";
import { Ball } from "./Ball";
import {
  AFTERTOUCH_DURATION,
  SPIN_MULTIPLIER_FACTOR,
  aiAftertouchStrengthMul,
  aftertouchTick,
  openAftertouch,
  spinMultiplierAt,
  stepAftertouch,
  stickRelativeToKick,
} from "./Aftertouch";

describe("aftertouch tables", () => {
  it("decays spin multiplier over the window", () => {
    expect(SPIN_MULTIPLIER_FACTOR[0]).toBe(5);
    expect(SPIN_MULTIPLIER_FACTOR[9]).toBe(1);
    expect(spinMultiplierAt(0)).toBe(1);
    expect(spinMultiplierAt(AFTERTOUCH_DURATION * 0.95)).toBeCloseTo(0.2, 5);
    expect(aftertouchTick(0)).toBe(0);
    expect(aftertouchTick(AFTERTOUCH_DURATION - 0.001)).toBe(9);
  });

  it("reads stick left/right relative to kick aim", () => {
    // Kick toward +X; left of kick is +Z.
    const left = stickRelativeToKick(0, 1, 1, 0);
    const right = stickRelativeToKick(0, -1, 1, 0);
    const forward = stickRelativeToKick(1, 0, 1, 0);
    expect(left.lateral).toBeGreaterThan(0.8);
    expect(right.lateral).toBeLessThan(-0.8);
    expect(forward.along).toBeGreaterThan(0.8);
  });

  it("bends shot velocity toward the stick side without resetting speed", () => {
    const ball = new Ball();
    ball.vx = 20;
    ball.vz = 0;
    const state = openAftertouch({
      kind: "shot",
      dirX: 1,
      dirZ: 0,
      technique: 85,
      strengthMul: 1,
    });
    const before = Math.hypot(ball.vx, ball.vz);
    // Hold left stick (toward +Z) for early strong ticks.
    let s = state;
    for (let i = 0; i < 8; i++) {
      const step = stepAftertouch(ball, s, 0, 1, 1 / 60);
      expect(step.state).not.toBeNull();
      s = step.state!;
    }
    expect(ball.vz).toBeGreaterThan(1.2);
    expect(Math.hypot(ball.vx, ball.vz)).toBeGreaterThan(before * 0.85);
    expect(s.side).toBe(1);
  });

  it("chips a shot when stick is pulled back mid-window", () => {
    const ball = new Ball();
    ball.vx = 18;
    ball.vz = 0;
    ball.vy = 1.2;
    let s = openAftertouch({
      kind: "shot",
      dirX: 1,
      dirZ: 0,
      technique: 80,
      strengthMul: 1,
    });
    // Advance to tick >= 4 with stick back (−X).
    let chipped = false;
    for (let i = 0; i < 20; i++) {
      const step = stepAftertouch(ball, s, -1, 0, 1 / 45);
      if (!step.state) break;
      s = step.state;
      if (step.chipped) chipped = true;
    }
    expect(chipped).toBe(true);
    expect(ball.vy).toBeGreaterThan(2.2);
  });

  it("keeps close AI shots from heavy curve", () => {
    expect(aiAftertouchStrengthMul(8)).toBeLessThan(0.2);
    expect(aiAftertouchStrengthMul(30)).toBeGreaterThan(0.9);
  });

  it("mutes late curve when the early stick window was missed", () => {
    const committed = new Ball();
    committed.vx = 18;
    committed.vz = 0;
    const late = new Ball();
    late.vx = 18;
    late.vz = 0;
    let sEarly = openAftertouch({ kind: "shot", dirX: 1, dirZ: 0, technique: 90, strengthMul: 1 });
    let sLate = openAftertouch({ kind: "shot", dirX: 1, dirZ: 0, technique: 90, strengthMul: 1 });
    // Early stick for first ball.
    for (let i = 0; i < 4; i++) {
      const step = stepAftertouch(committed, sEarly, 0, 1, 1 / 60);
      sEarly = step.state!;
    }
    // Late stick only after commit window for second ball.
    for (let i = 0; i < 10; i++) {
      const step = stepAftertouch(late, sLate, 0, 0, 1 / 60);
      sLate = step.state!;
    }
    for (let i = 0; i < 8; i++) {
      const a = stepAftertouch(committed, sEarly, 0, 1, 1 / 60);
      const b = stepAftertouch(late, sLate, 0, 1, 1 / 60);
      sEarly = a.state!;
      sLate = b.state!;
    }
    expect(Math.abs(committed.vz)).toBeGreaterThan(Math.abs(late.vz));
  });


  it("applies weaker curve on passes than shots", () => {
    const shotBall = new Ball();
    shotBall.vx = 16;
    shotBall.vz = 0;
    const passBall = new Ball();
    passBall.vx = 16;
    passBall.vz = 0;
    let shot = openAftertouch({ kind: "shot", dirX: 1, dirZ: 0, technique: 80, strengthMul: 1 });
    let pass = openAftertouch({ kind: "pass", dirX: 1, dirZ: 0, technique: 80, strengthMul: 1 });
    for (let i = 0; i < 6; i++) {
      shot = stepAftertouch(shotBall, shot, 0, 1, 1 / 60).state!;
      pass = stepAftertouch(passBall, pass, 0, 1, 1 / 60).state!;
    }
    expect(Math.abs(shotBall.vz)).toBeGreaterThan(Math.abs(passBall.vz));
  });
});
