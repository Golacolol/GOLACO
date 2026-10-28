import { describe, expect, it } from "vitest";
import { computePressure } from "./PressureModel";
import { Player } from "./Player";
import type { PlayerAttributes } from "../../data/schema";
import {
  approachFromBehind,
  ballReachedFirst,
  buildTackleContext,
  isThroughOnGoal,
  resolveLooseBallSlide,
  resolveTackle,
  shouldAiAttemptTackle,
  shouldAiSlideTackle,
  tacklingStat,
} from "./TackleModel";
import { PlayerEnergy } from "./PlayerEnergy";
import { movePlayer } from "./PlayerMovement";
import { resolveAttributes } from "./PlayerStats";
import type { PlayerRecord } from "../../data/schema";

const attrs = (over: Partial<PlayerAttributes> = {}): PlayerAttributes => ({
  pace: 70,
  passing: 70,
  longPassing: 70,
  vision: 70,
  control: 70,
  dribbling: 70,
  shooting: 70,
  finishing: 70,
  shotPower: 70,
  longShots: 70,
  defending: 70,
  tackling: 70,
  jumping: 70,
  strength: 70,
  stamina: 80,
  composure: 70,
  ...over,
});

function make(id: string, x: number, z: number, side: "home" | "away", over?: Partial<PlayerAttributes>): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: "CB",
    slot: "CB",
    side,
    attrs: attrs(over),
    overall: 70,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("pressure model", () => {
  it("increases when defenders are nearby", () => {
    const carrier = make("c", 0, 0, "home");
    const far = computePressure(carrier, [make("d", 20, 0, "away")]);
    const near = computePressure(carrier, [make("d", 1.4, 0.2, "away", { defending: 82, pace: 80 })]);
    expect(near.value).toBeGreaterThan(far.value);
  });
});

describe("energy drain", () => {
  it("drains faster for ball-carrying sprint than walking without ball", () => {
    const walk = new PlayerEnergy(80);
    const sprintBall = new PlayerEnergy(80);
    for (let i = 0; i < 60; i++) {
      walk.update(0.05, 0.12);
      sprintBall.update(0.05, 1.25);
    }
    expect(sprintBall.value).toBeLessThan(walk.value);
  });

  it("drains much faster during a speed burst", () => {
    const sprint = new PlayerEnergy(80);
    const burst = new PlayerEnergy(80);
    for (let i = 0; i < 40; i++) {
      sprint.update(0.05, 0.9);
      burst.update(0.05, 4.8, 0.08);
    }
    expect(burst.value).toBeLessThan(sprint.value - 0.1);
  });

  it("recovers while not running at speed", () => {
    const energy = new PlayerEnergy(80);
    energy.value = 0.5;
    for (let i = 0; i < 40; i++) energy.update(0.05, 0.1);
    expect(energy.value).toBeGreaterThan(0.5);
  });

  it("recoups faster when nearly still than when jogging", () => {
    const still = new PlayerEnergy(80);
    const jog = new PlayerEnergy(80);
    still.value = 0.45;
    jog.value = 0.45;
    for (let i = 0; i < 50; i++) {
      still.update(0.05, 0.02);
      jog.update(0.05, 0.22);
    }
    expect(still.value).toBeGreaterThan(jog.value);
  });

  it("spend() cuts stamina for a slide commit", () => {
    const energy = new PlayerEnergy(80);
    energy.value = 0.7;
    energy.spend(0.09);
    expect(energy.value).toBeCloseTo(0.61, 5);
  });
});

describe("slide tackling", () => {
  it("defaults tackling/jumping from defending when omitted on records", () => {
    const record = {
      id: "p",
      name: "p",
      displayName: "p",
      shirtNumber: 5,
      primaryPosition: "CB",
      secondaryPositions: [],
      pace: 60,
      passing: 60,
      longPassing: 60,
      vision: 60,
      control: 60,
      dribbling: 50,
      shooting: 40,
      finishing: 40,
      shotPower: 50,
      longShots: 40,
      defending: 82,
      strength: 78,
      stamina: 80,
      composure: 70,
    } as unknown as PlayerRecord;
    const resolved = resolveAttributes(record);
    expect(resolved.tackling).toBe(82);
    expect(resolved.jumping).toBe(Math.round((78 + 60) * 0.5));
  });

  it("can win possession on a close timed challenge on the ball", () => {
    const def = make("def", 0, 0, "away", { tackling: 90, defending: 88, strength: 86, jumping: 80 });
    const att = make("att", 0.7, 0, "home", { control: 55, dribbling: 50, composure: 50 });
    att.facing = Math.PI / 2;
    att.vx = 6;
    def.vx = 8;
    const ball = { x: 0.45, z: 0 };
    const ctx = buildTackleContext(def, att, ball, 0.8, true);
    expect(ctx.ballFirst).toBe(true);
    const outcomes = Array.from({ length: 50 }, () => resolveTackle(ctx));
    expect(outcomes.some((o) => o === "CLEAN_WIN" || o === "KNOCKED_LOOSE")).toBe(true);
  });

  it("fouls when catching the player from behind before the ball", () => {
    const def = make("def", -1.2, 0, "away", { tackling: 45, defending: 40 });
    const att = make("att", 0, 0, "home", { control: 80, dribbling: 80 });
    att.facing = Math.PI / 2; // facing +X
    def.facing = Math.PI / 2;
    def.vx = 11;
    const ball = { x: 1.1, z: 0 }; // ball ahead of attacker; defender hits body first
    expect(approachFromBehind(def, att)).toBeGreaterThan(0.4);
    expect(ballReachedFirst(def, att, ball)).toBe(false);
    const ctx = buildTackleContext(def, att, ball, 0.3, false);
    ctx.fromBehind = 0.85;
    ctx.ballFirst = false;
    ctx.throughOnGoal = true;
    ctx.distance = 0.7;
    ctx.slideSpeed = 12;
    const outcomes = Array.from({ length: 40 }, () => resolveTackle(ctx));
    expect(outcomes.some((o) => o === "FOUL" || o === "YELLOW_CARD" || o === "RED_CARD")).toBe(true);
  });

  it("can book a yellow for a reckless clip without DOGSO", () => {
    const def = make("def", -1.0, 0, "away", { tackling: 28, defending: 25, strength: 25, jumping: 25 });
    const att = make("att", 0, 0, "home", { control: 80, dribbling: 80 });
    att.facing = Math.PI / 2;
    def.facing = Math.PI / 2;
    def.vx = 14;
    const ctx = buildTackleContext(def, att, { x: 1.1, z: 0 }, 0.2, false);
    // Behind enough to book, shy of the hard red thresholds.
    ctx.fromBehind = 0.62;
    ctx.ballFirst = false;
    ctx.throughOnGoal = false;
    ctx.distance = 0.65;
    ctx.ballDistance = 1.25;
    ctx.slideSpeed = 14;
    const outcomes = Array.from({ length: 80 }, () => resolveTackle(ctx));
    expect(outcomes.some((o) => o === "YELLOW_CARD")).toBe(true);
  });

  it("misses when still out of contact range", () => {
    const def = make("def", 0, 0, "away", { tackling: 40 });
    const att = make("att", 2.5, 0, "home");
    const ctx = buildTackleContext(def, att, { x: 2.5, z: 0 }, 0.1, false);
    ctx.distance = 2.5;
    ctx.ballDistance = 2.5;
    expect(resolveTackle(ctx)).toBe("MISS");
  });

  it("can claim a loose ball on a slide intercept", () => {
    const def = make("def", 0, 0, "away", { tackling: 85, jumping: 80, control: 75 });
    const outcomes = Array.from({ length: 40 }, () => resolveLooseBallSlide(def, { x: 0.6, z: 0.1, vx: 10, vz: 0 }, true));
    expect(outcomes.some((o) => o === "CLEAN_WIN" || o === "KNOCKED_LOOSE")).toBe(true);
  });

  it("does not let AI spam tackles on cooldown", () => {
    expect(shouldAiAttemptTackle(1.0, 0.9, 3, 0.5)).toBe(false);
    expect(shouldAiAttemptTackle(2.5, 0.9, 3, 0)).toBe(false);
  });

  it("AI avoids casual from-behind slides but may commit when through on goal", () => {
    const casual = shouldAiSlideTackle({
      distance: 2,
      ballDistance: 2,
      pressure: 0.7,
      possessionTime: 2,
      cooldown: 0,
      recoverTimer: 0,
      energy: 0.8,
      fromBehind: 0.8,
      throughOnGoal: false,
      ballLoose: false,
      tackling: 75,
      defensiveRole: true,
      defending: true,
      rng: () => 0.1,
    });
    expect(casual.attempt).toBe(false);

    const lastDitch = shouldAiSlideTackle({
      distance: 2.2,
      ballDistance: 2,
      pressure: 0.9,
      possessionTime: 1,
      cooldown: 0,
      recoverTimer: 0,
      energy: 0.8,
      fromBehind: 0.4,
      throughOnGoal: true,
      ballLoose: false,
      tackling: 80,
      defensiveRole: true,
      defending: true,
      rng: () => 0.05,
    });
    expect(lastDitch.attempt).toBe(true);
  });

  it("does not slide when attacking or as a forward for a loose ball", () => {
    const attacking = shouldAiSlideTackle({
      distance: 1.5,
      ballDistance: 1.5,
      pressure: 0.9,
      possessionTime: 2,
      cooldown: 0,
      recoverTimer: 0,
      energy: 0.9,
      fromBehind: 0.1,
      throughOnGoal: false,
      ballLoose: false,
      tackling: 85,
      defensiveRole: true,
      defending: false,
      rng: () => 0,
    });
    expect(attacking.attempt).toBe(false);

    const forwardLoose = shouldAiSlideTackle({
      distance: 1.2,
      ballDistance: 1.2,
      pressure: 0.5,
      possessionTime: 1,
      cooldown: 0,
      recoverTimer: 0,
      energy: 0.9,
      fromBehind: 0,
      throughOnGoal: false,
      ballLoose: true,
      tackling: 80,
      defensiveRole: false,
      defending: true,
      opponentPassInFlight: true,
      rng: () => 0,
    });
    expect(forwardLoose.attempt).toBe(false);
  });

  it("detects through-on-goal when the attacker is clear and the defender trails", () => {
    const att = make("att", -35, 0, "home");
    att.attackSign = -1; // attacking toward -X (away goal for home with ends?)
    // home attackSign defaults +1 → opp goal at +HALF_LENGTH. Put attacker near +goal with defender behind.
    const attacker = make("a", 40, 2, "home");
    attacker.vx = 6;
    const defender = make("d", 32, 2, "away");
    expect(isThroughOnGoal(attacker, defender)).toBe(true);
  });

  it("exposes tacklingStat helper", () => {
    const p = make("t", 0, 0, "home", { tackling: 91, defending: 70 });
    expect(tacklingStat(p)).toBe(91);
  });

  it("blocks movement while recovering from a missed slide", () => {
    const p = make("r", 0, 0, "home");
    p.slideRecoverTimer = 1;
    p.vx = 5;
    movePlayer(p, 0.05, 1, 0, true, false);
    expect(p.slideRecoverTimer).toBeLessThan(1);
    expect(p.speed).toBeLessThan(5);
  });
});

describe("speed burst", () => {
  it("makes the player faster and drains energy harder than a normal sprint", () => {
    const sprint = make("s", 0, 0, "home");
    const burst = make("b", 0, 0, "home");
    for (let i = 0; i < 20; i++) {
      movePlayer(sprint, 0.05, 1, 0, true, false);
      movePlayer(burst, 0.05, 1, 0, true, false, { boost: true });
    }
    expect(burst.speed).toBeGreaterThan(sprint.speed);
    expect(burst.boosting).toBe(true);
    expect(burst.energy.value).toBeLessThan(sprint.energy.value);
  });
});
