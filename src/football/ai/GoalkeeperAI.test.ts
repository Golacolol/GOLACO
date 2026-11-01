import { describe, expect, it } from "vitest";
import { Player } from "../players/Player";
import { Ball } from "../ball/Ball";
import type { PlayerAttributes } from "../../data/schema";
import { GOAL_WIDTH, HALF_LENGTH, HALF_WIDTH } from "../constants";
import {
  chooseGoalKickLongTarget,
  chooseKeeperOutlet,
  decideKeeperDistribution,
  goalKickAimPoint,
  goalKickPowerScale,
  goalkeeperTarget,
  keeperAngleStand,
  keeperHandReleaseVector,
  keeperOutletAimPoint,
  keeperPassDelivery,
  keeperPuntAim,
  keeperRestartReady,
  keeperDiveReach,
  keeperSaveKind,
  KEEPER_DISTRIBUTE_MAX,
  updateGoalkeeper,
} from "../ai/GoalkeeperAI";
import { passKickVector } from "../ball/PassModel";
import { kickBall, stepBall } from "../ball/BallPhysics";
import { inPenaltyArea, inSixYardArea } from "../pitch/PitchZones";
import { movePlayer } from "../players/PlayerMovement";
import { TOUCHLINE_SAFE_MARGIN } from "../ThrowIn";

const attrs: PlayerAttributes = {
  pace: 50, passing: 55, longPassing: 60, vision: 58, control: 50, dribbling: 30,
  shooting: 20, finishing: 18, shotPower: 50, longShots: 20, defending: 22, strength: 70, stamina: 64, composure: 76,
  gkHandling: 78, gkPositioning: 76, gkReflexes: 80,
};

function outfield(id: string, side: "home" | "away", x: number, z: number, slot = "CB"): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 5,
    position: "CB",
    slot,
    side,
    attrs,
    overall: 70,
  });
  p.x = x;
  p.z = z;
  p.anchorX = x;
  p.anchorZ = z;
  return p;
}

function gk(side: "home" | "away" = "home"): Player {
  const p = new Player({
    id: "gk",
    name: "M. Cooper",
    displayName: "M. Cooper",
    shirtNumber: 1,
    position: "GK",
    slot: "GK",
    side,
    attrs,
    overall: 74,
  });
  p.x = side === "home" ? -HALF_LENGTH + 0.8 : HALF_LENGTH - 0.8;
  p.z = 0;
  p.facing = side === "home" ? Math.PI / 2 : -Math.PI / 2;
  return p;
}

describe("goalkeeper set-piece holds", () => {
  it("stays on the line for a penalty until the shot is struck", () => {
    const keeper = gk("away");
    const ball = new Ball();
    ball.x = HALF_LENGTH - 11;
    ball.z = 0;
    ball.ownerId = "taker";
    ball.lastTouchSide = "home";
    const aim = goalkeeperTarget(keeper, ball, 1, { holdLine: true });
    expect(aim.rush).toBe(false);
    expect(aim.x).toBeGreaterThan(HALF_LENGTH - 2);
    expect(Math.abs(aim.z)).toBeLessThan(1.5);
  });

  it("does not charge a planted free-kick ball", () => {
    const keeper = gk("away");
    const ball = new Ball();
    ball.x = HALF_LENGTH - 20;
    ball.z = 4;
    ball.ownerId = "taker";
    ball.lastTouchSide = "home";
    const aim = goalkeeperTarget(keeper, ball, 1, { setPieceHold: true });
    expect(aim.rush).toBe(false);
    expect(aim.x).toBeGreaterThan(HALF_LENGTH - 3);
  });
});

describe("goalkeeper box claims", () => {
  it("comes off the line toward a loose ball in the six-yard box", () => {
    const keeper = gk("home");
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 3.2;
    ball.z = 1.2;
    ball.ownerId = null;
    expect(inSixYardArea(ball.x, ball.z, "home")).toBe(true);
    const aim = goalkeeperTarget(keeper, ball);
    expect(aim.rush).toBe(true);
    expect(aim.x).toBeGreaterThan(keeper.x + 0.4);
  });

  it("claims a slow loose ball in the box into the hands", () => {
    const keeper = gk("home");
    keeper.x = -HALF_LENGTH + 2.2;
    keeper.z = 0.4;
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 4.5;
    ball.z = 0.8;
    ball.vx = -1.2;
    ball.vz = 0;
    ball.y = 0.35;
    ball.ownerId = null;
    ball.lastTouchSide = "away";
    expect(inPenaltyArea(ball.x, ball.z, "home")).toBe(true);
    let claimed: "hold" | "parry" | null = null;
    for (let i = 0; i < 45 && !claimed; i++) {
      claimed = updateGoalkeeper(keeper, ball, 0.05);
    }
    expect(claimed).toBe("hold");
    expect(ball.ownerId).toBe(keeper.id);
  });

  it("shuffles toward a wide ball to cut the angle", () => {
    const keeper = gk("home");
    keeper.x = -HALF_LENGTH + 1.2;
    keeper.z = 0;
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 22;
    ball.z = 16;
    ball.ownerId = "w";
    ball.lastTouchSide = "away";
    const startZ = keeper.z;
    for (let i = 0; i < 30; i++) updateGoalkeeper(keeper, ball, 0.05);
    expect(keeper.z).toBeGreaterThan(startZ + 0.8);
    expect(keeper.x).toBeGreaterThan(-HALF_LENGTH + 1.5);
  });

  it("closes down an attacker on the ball inside the penalty area", () => {
    const keeper = gk("home");
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 10;
    ball.z = 2;
    ball.ownerId = "att";
    ball.lastTouchSide = "away";
    expect(inPenaltyArea(ball.x, ball.z, "home")).toBe(true);
    const line = goalkeeperTarget(keeper, new Ball());
    const aim = goalkeeperTarget(keeper, ball);
    expect(aim.x).toBeGreaterThan(line.x);
    expect(Math.abs(aim.x - ball.x)).toBeLessThan(Math.abs(line.x - ball.x));
  });

  it("closes the angle on a through ball without leaving the box for a short rush", () => {
    const keeper = gk("home");
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 12;
    ball.z = 3;
    ball.vx = -4;
    ball.vz = 0;
    ball.ownerId = "st";
    ball.lastTouchSide = "away";
    const aim = goalkeeperTarget(keeper, ball);
    expect(aim.x).toBeGreaterThan(keeper.x + 1);
    expect(aim.x).toBeLessThanOrEqual(-HALF_LENGTH + 16.2);
    expect(Math.abs(aim.z - ball.z)).toBeLessThan(4);
  });

  it("may step slightly beyond the box only on a long clear through-ball", () => {
    const keeper = gk("home");
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 32;
    ball.z = 2;
    ball.vx = -8;
    ball.vz = 0;
    ball.ownerId = "st";
    ball.lastTouchSide = "away";
    const aim = goalkeeperTarget(keeper, ball);
    expect(aim.x).toBeGreaterThan(keeper.x);
    expect(aim.x).toBeLessThan(-HALF_LENGTH + 22);
  });

  it("stays nearer the goal line when the ball is in midfield", () => {
    const keeper = gk("home");
    const ball = new Ball();
    ball.x = 0;
    ball.z = 8;
    const aim = goalkeeperTarget(keeper, ball);
    expect(aim.rush).toBe(false);
    expect(aim.x).toBeLessThan(-HALF_LENGTH + 3);
    // Distant ball: stay near the centre of the goal, not dragged wide.
    expect(Math.abs(aim.z)).toBeLessThan(1.6);
  });

  it("cuts the angle toward a wide threat by stepping off the line", () => {
    const goalX = -HALF_LENGTH + 0.55;
    const onLine = keeperAngleStand(-HALF_LENGTH + 18, 14, goalX, 1, 0.6);
    const stepped = keeperAngleStand(-HALF_LENGTH + 18, 14, goalX, 1, 4.2);
    expect(Math.abs(stepped.z)).toBeGreaterThan(Math.abs(onLine.z) + 1.2);
    expect(stepped.z).toBeGreaterThan(1.5);
    expect(Math.abs(stepped.z)).toBeLessThan(GOAL_WIDTH / 2 + 0.8);

    const keeper = gk("home");
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 18;
    ball.z = 14;
    const aim = goalkeeperTarget(keeper, ball);
    expect(aim.z).toBeGreaterThan(1.2);
    expect(aim.x).toBeGreaterThan(goalX + 0.8);
  });

  it("holds central when the ball is central", () => {
    const keeper = gk("home");
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 28;
    ball.z = 0.4;
    const aim = goalkeeperTarget(keeper, ball);
    expect(Math.abs(aim.z)).toBeLessThan(1.1);
  });
});

describe("player turning", () => {
  it("does not spin on the spot when the remaining travel is tiny", () => {
    const p = gk("home");
    p.facing = Math.PI / 2;
    p.x = 0;
    p.z = 0;
    const before = p.facing;
    for (let i = 0; i < 20; i++) movePlayer(p, 0.05, 0.04, -0.03, false, false);
    expect(Math.abs(p.facing - before)).toBeLessThan(0.12);
  });
});

describe("goalkeeper distribution", () => {
  it("does not recatch the ball after it is already in his hands", () => {
    const keeper = gk("home");
    keeper.hasBall = true;
    const ball = new Ball();
    ball.x = keeper.x;
    ball.z = keeper.z;
    ball.ownerId = keeper.id;
    expect(updateGoalkeeper(keeper, ball, 0.016)).toBeNull();
  });

  it("chooses hand roll / throw for short calm releases", () => {
    expect(keeperPassDelivery(10, 0.2)).toBe("roll");
    expect(keeperPassDelivery(20, 0.3)).toBe("throw");
    expect(keeperPassDelivery(32, 0.4)).toBe("kick");
  });

  it("rolls and throws reach typical outlet distances under pitch friction", () => {
    const travel = (delivery: "roll" | "throw", dist: number) => {
      const impulse = keeperHandReleaseVector(0, 0, dist, 0, delivery, 0.75);
      const ball = new Ball();
      ball.x = 0;
      ball.y = 0.28;
      ball.z = 0;
      kickBall(ball, impulse.vx, impulse.vz, impulse.vy);
      let closest = Infinity;
      for (let i = 0; i < 240; i++) {
        stepBall(ball, 1 / 60);
        closest = Math.min(closest, Math.abs(ball.x - dist));
        if (ball.x > dist + 4 && Math.hypot(ball.vx, ball.vz) < 1.5) break;
      }
      return closest;
    };
    // Old caps died ~8–12 m short; allow a couple metres of miss for bounce/roll.
    expect(travel("roll", 12)).toBeLessThan(3.5);
    expect(travel("throw", 22)).toBeLessThan(4.5);
  });

  it("aims outlet releases inbound of the touchline", () => {
    const fb = outfield("rb", "home", -HALF_LENGTH + 22, HALF_WIDTH - 1.5, "RB");
    const aim = keeperOutletAimPoint(fb);
    expect(Math.abs(aim.z)).toBeLessThanOrEqual(HALF_WIDTH - TOUCHLINE_SAFE_MARGIN - 1);
  });

  it("prefers a safer CB over a full-back hugging the touchline", () => {
    const keeper = gk("home");
    const cb = outfield("cb", "home", -HALF_LENGTH + 18, 6, "CB");
    const rb = outfield("rb", "home", -HALF_LENGTH + 22, HALF_WIDTH - 1.2, "RB");
    const chosen = chooseKeeperOutlet(keeper, [keeper, cb, rb], []);
    expect(chosen?.id).toBe("cb");
  });

  it("passes to an available teammate instead of holding forever", () => {
    const keeper = gk("home");
    const cb = outfield("cb", "home", -HALF_LENGTH + 18, 8);
    const decided = decideKeeperDistribution({
      gk: keeper,
      teammates: [keeper, cb],
      opponents: [],
      possessionTime: 1.1,
      pressure: 0.2,
      rng: () => 0.9,
    });
    expect(decided.action).toBe("pass");
    if (decided.action === "pass") {
      expect(decided.target.id).toBe("cb");
      expect(["throw", "roll", "kick"]).toContain(decided.delivery);
    }
  });

  it("prefers a pass over a long punt when an outlet is on", () => {
    const keeper = gk("home");
    const cb = outfield("cb", "home", -HALF_LENGTH + 18, 8);
    const decided = decideKeeperDistribution({
      gk: keeper,
      teammates: [keeper, cb],
      opponents: [],
      possessionTime: 1.1,
      pressure: 0.2,
      rng: () => 0.01,
    });
    expect(decided.action).toBe("pass");
    if (decided.action === "pass") expect(decided.delivery).toBe("throw");
  });

  it("punts upfield when no outlet is on and always distributes within 5 seconds", () => {
    expect(KEEPER_DISTRIBUTE_MAX).toBe(5);
    const keeper = gk("home");
    const decided = decideKeeperDistribution({
      gk: keeper,
      teammates: [keeper],
      opponents: [],
      possessionTime: KEEPER_DISTRIBUTE_MAX,
      pressure: 0.1,
      rng: () => 0.5,
    });
    expect(decided.action).toBe("punt");
    if (decided.action === "punt") {
      expect(decided.x).toBeGreaterThan(keeper.x + 40);
      expect(Math.abs(decided.z)).toBeGreaterThan(8);
    }
  });

  it("aims long clearances toward a free teammate when one is available", () => {
    const keeper = gk("home");
    const st = outfield("st", "home", -HALF_LENGTH + 48, 10, "RST");
    const aim = keeperPuntAim(keeper, [keeper, st], () => 0.5, []);
    expect(aim.targetId).toBe("st");
    expect(aim.x).toBeGreaterThan(keeper.x + 20);
    expect(Math.abs(aim.z - st.z)).toBeLessThan(14);
  });

  it("does not return the ball to the defender who just passed it in", () => {
    const keeper = gk("home");
    const cb = outfield("cb", "home", -HALF_LENGTH + 18, 8);
    const decided = decideKeeperDistribution({
      gk: keeper,
      teammates: [keeper, cb],
      opponents: [],
      possessionTime: KEEPER_DISTRIBUTE_MAX,
      pressure: 0.1,
      skipIds: ["cb"],
    });
    expect(decided.action).toBe("punt");
  });

  it("prefers the more open defender over a marked or crowded one", () => {
    const keeper = gk("home");
    const marked = outfield("cb", "home", -HALF_LENGTH + 16, 6, "LCB");
    const open = outfield("rb", "home", -HALF_LENGTH + 22, -16, "RB");
    const marker = outfield("st", "away", marked.x + 1.2, marked.z, "RST");
    const outlet = chooseKeeperOutlet(keeper, [keeper, marked, open], [marker]);
    expect(outlet?.id).toBe("rb");
  });

  it("prefers an open full-back over a centre-back when building from the back", () => {
    const keeper = gk("home");
    const cb = outfield("cb", "home", -HALF_LENGTH + 16, 4, "RCB");
    const lb = outfield("lb", "home", -HALF_LENGTH + 20, 18, "LB");
    const outlet = chooseKeeperOutlet(keeper, [keeper, cb, lb], []);
    expect(outlet?.id).toBe("lb");
  });

  it("does not pass into a cluster immediately in front of the keeper", () => {
    const keeper = gk("home");
    const a = outfield("a", "home", -HALF_LENGTH + 14, -1.5, "LCB");
    const b = outfield("b", "home", -HALF_LENGTH + 14.5, 0.2, "RCB");
    const c = outfield("c", "home", -HALF_LENGTH + 15, 1.8, "RCM");
    const open = outfield("rb", "home", -HALF_LENGTH + 20, 16, "RB");
    const outlet = chooseKeeperOutlet(keeper, [keeper, a, b, c, open], []);
    expect(outlet?.id).toBe("rb");
  });

  it("waits for teammates to recover their shape before distributing", () => {
    const keeper = gk("home");
    const cb = outfield("cb", "home", -HALF_LENGTH + 18, 8);
    cb.anchorX = -HALF_LENGTH + 16;
    cb.x = 8;
    expect(keeperRestartReady([keeper, cb], keeper)).toBe(false);
    const decided = decideKeeperDistribution({
      gk: keeper,
      teammates: [keeper, cb],
      opponents: [],
      possessionTime: 1.4,
      pressure: 0.15,
      rng: () => 0,
    });
    expect(decided.action).toBe("wait");
  });

  it("does not recatch a teammate's outgoing pass in the box", () => {
    const keeper = gk("home");
    keeper.x = -HALF_LENGTH + 10;
    keeper.z = 0;
    const ball = new Ball();
    ball.x = keeper.x + 0.4;
    ball.z = 0;
    ball.vx = 8;
    ball.vz = 0;
    ball.ownerId = null;
    ball.lastTouchId = "cb";
    ball.lastTouchSide = "home";
    expect(inPenaltyArea(ball.x, ball.z, "home")).toBe(true);
    expect(inSixYardArea(ball.x, ball.z, "home")).toBe(false);
    expect(updateGoalkeeper(keeper, ball, 0.016)).toBeNull();
  });

  it("does not claim a teammate back-pass rolling toward goal outside the six-yard", () => {
    const keeper = gk("home");
    keeper.x = -HALF_LENGTH + 10;
    keeper.z = 0;
    const ball = new Ball();
    ball.x = -HALF_LENGTH + 12;
    ball.z = 1;
    ball.vx = -7;
    ball.vz = 0;
    ball.ownerId = null;
    ball.lastTouchId = "cb";
    ball.lastTouchSide = "home";
    expect(inPenaltyArea(ball.x, ball.z, "home")).toBe(true);
    expect(inSixYardArea(ball.x, ball.z, "home")).toBe(false);
    expect(updateGoalkeeper(keeper, ball, 0.016)).toBeNull();
  });

  it("parries strong shots instead of catching them", () => {
    expect(keeperSaveKind(18, 0.78, true, 1.0)).toBe("parry");
    expect(keeperSaveKind(16, 0.78, false, 1.2)).toBe("parry");
    expect(keeperSaveKind(6, 0.78, true, 1.0, { reflexes: 0.8, diving: 0.8 })).toBe("hold");
    const keeper = gk("home");
    keeper.x = -HALF_LENGTH + 2;
    keeper.z = 0;
    const ball = new Ball();
    ball.x = keeper.x + 0.6;
    ball.z = 0;
    ball.vx = -18;
    ball.vz = 0;
    ball.ownerId = null;
    ball.lastTouchId = "st";
    ball.lastTouchSide = "away";
    expect(inPenaltyArea(ball.x, ball.z, "home")).toBe(true);
    expect(updateGoalkeeper(keeper, ball, 0.016)).toBe("parry");
    expect(ball.ownerId).toBeNull();
    expect(ball.vx).toBeGreaterThan(0);
  });

  it("scales dive reach and hold bias from tuning", () => {
    expect(keeperDiveReach(0.8, 0.8, 1.2)).toBeGreaterThan(keeperDiveReach(0.8, 0.8, 1));
    // Mid-pace shot: arcade-style hold bias claims, low bias tips away.
    expect(
      keeperSaveKind(10.5, 0.78, true, 1.1, {
        reflexes: 0.8,
        diving: 0.75,
        holdBiasMul: 1.2,
      }),
    ).toBe("hold");
    expect(
      keeperSaveKind(10.5, 0.78, true, 1.1, {
        reflexes: 0.8,
        diving: 0.75,
        holdBiasMul: 0.75,
      }),
    ).toBe("parry");
  });
});

describe("goal kick long delivery", () => {
  it("prefers a striker over a nearby full-back for long goal kicks", () => {
    const keeper = gk("home");
    const rb = outfield("rb", "home", -HALF_LENGTH + 22, 18, "RB");
    const st = outfield("st", "home", 8, 4, "LST");
    const target = chooseGoalKickLongTarget(keeper, [keeper, rb, st]);
    expect(target?.id).toBe("st");
  });

  it("caps long goal kicks near real kick length toward the striker", () => {
    const keeper = gk("home");
    const st = outfield("st", "home", 8, 6, "RST");
    const aim = goalKickAimPoint(keeper, st, true, 0);
    const reach = Math.hypot(aim.x - keeper.x, aim.z - keeper.z);
    expect(aim.x).toBeGreaterThan(keeper.x + 35);
    expect(reach).toBeLessThanOrEqual(55.5);
    expect(Math.abs(aim.z)).toBeLessThan(12);
    expect(goalKickPowerScale(reach, true)).toBeLessThanOrEqual(1);
  });

  it("carries a long goal-kick aim into the halfway channel under pitch friction", () => {
    const fromX = -HALF_LENGTH + 5.5;
    const fromZ = 9;
    const toX = -HALF_LENGTH + 5.5 + 48;
    const toZ = 4;
    const dist = Math.hypot(toX - fromX, toZ - fromZ);
    const kick = passKickVector(fromX, fromZ, toX, toZ, "long");
    const scale = goalKickPowerScale(dist, true);
    const ball = new Ball();
    ball.reset(fromX, fromZ);
    ball.y = 0.28;
    kickBall(ball, kick.vx * scale, kick.vz * scale, Math.min(Math.max(kick.vy * scale, 5.4), 6.8));
    let closest = Infinity;
    let maxX = fromX;
    for (let i = 0; i < 360; i++) {
      stepBall(ball, 1 / 60);
      closest = Math.min(closest, Math.hypot(ball.x - toX, ball.z - toZ));
      maxX = Math.max(maxX, ball.x);
      if (Math.hypot(ball.vx, ball.vz) < 1.2 && ball.y < 0.2) break;
    }
    expect(closest).toBeLessThan(8);
    expect(maxX).toBeLessThan(fromX + 58);
    expect(ball.x).toBeGreaterThan(fromX + 30);
  });
});
