import { describe, expect, it } from "vitest";
import {
  FACING_PRIORITY,
  applyFacingHints,
  idleBallFacingHint,
  kickFacingHint,
  moveFacingHint,
  receiveFacingHint,
  resolveFacingHint,
  yawDelta,
  yawToward,
} from "./FacingControl";
import type { Player } from "./Player";

function stubPlayer(facing = 0): Player {
  return {
    id: "p1",
    side: "home",
    slot: "CM",
    position: "CM",
    displayName: "Test",
    shirtNumber: 8,
    isGK: false,
    attackSign: 1,
    x: 0,
    z: 0,
    y: 0,
    vx: 0,
    vz: 0,
    facing,
    speed: 0,
    attrs: { pace: 70, acceleration: 70, agility: 70, dribbling: 70, control: 70, strength: 70, composure: 70 },
    energy: { value: 1 },
    jockeying: false,
  } as unknown as Player;
}

describe("FacingControl", () => {
  it("yawToward matches atan2(x,z) convention", () => {
    expect(yawToward(1, 0)).toBeCloseTo(Math.PI / 2, 5);
    expect(yawToward(0, 1)).toBeCloseTo(0, 5);
  });

  it("resolves kick over move and idle", () => {
    const best = resolveFacingHint([
      moveFacingHint(0, 1),
      idleBallFacingHint(stubPlayer(), 5, 0)!,
      kickFacingHint(1, 0),
    ]);
    expect(best?.priority).toBe(FACING_PRIORITY.KICK);
    expect(best?.dirX).toBe(1);
  });

  it("receive faces into oncoming ball", () => {
    const h = receiveFacingHint(8, 0);
    expect(h?.dirX).toBe(-8);
    expect(h?.priority).toBe(FACING_PRIORITY.RECEIVE);
  });

  it("idle ball hint skips when too far or moving", () => {
    const moving = stubPlayer();
    Object.defineProperty(moving, "speed", { get: () => 2 });
    expect(idleBallFacingHint(moving, 5, 0)).toBeNull();
    const still = stubPlayer();
    expect(idleBallFacingHint(still, 40, 0)).toBeNull();
    expect(idleBallFacingHint(still, 5, 0)?.priority).toBe(FACING_PRIORITY.BALL_IDLE);
  });

  it("applyFacingHints turns toward kick dir", () => {
    const p = stubPlayer(0);
    applyFacingHints(p, [kickFacingHint(1, 0)], 0.2);
    expect(yawDelta(0, p.facing)).toBeGreaterThan(0.2);
  });

  it("move facing wins over idle ball look in the same resolve", () => {
    const best = resolveFacingHint([
      idleBallFacingHint(stubPlayer(), 5, 0)!,
      moveFacingHint(0, 1),
    ]);
    expect(best?.priority).toBe(FACING_PRIORITY.MOVE);
    expect(best?.dirZ).toBe(1);
  });
});
