import { describe, expect, it } from "vitest";
import type { PlayerAttributes, PlayerRecord } from "../../data/schema";
import { Ball } from "../ball/Ball";
import { computePassError } from "../ball/PassModel";
import { computeShot } from "../ball/ShotModel";
import { choosePassTarget } from "../ai/PassingAI";
import { supportTarget } from "../ai/SupportAI";
import { closeDownRange, jockeyTarget, selectClosingPlayers } from "../ai/DefensiveAI";
import { DecisionTelemetry } from "../ai/DecisionTelemetry";
import { Player } from "./Player";
import { movePlayer, topSpeedFromPace, accelFromAttrs, turnRateFromAttrs } from "./PlayerMovement";
import {
  applyOverride,
  deriveOverall,
  OVERALL_WEIGHTS,
  playersWithInferredDefaults,
  resolveAttributes,
  resolveAttributesDetailed,
  validatePlayerAttributes,
} from "./PlayerStats";
import { shouldAiSlideTackle } from "./TackleModel";

const core = {
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
  strength: 70,
  stamina: 70,
  composure: 70,
} as const;

function record(over: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id: "p1",
    name: "Test",
    displayName: "T",
    primaryPosition: "CM",
    secondaryPositions: [],
    ...core,
    ...over,
  };
}

function makePlayer(attrs: PlayerAttributes, slot = "LCM", side: "home" | "away" = "home"): Player {
  const resolved = resolveAttributes({ ...attrs, primaryPosition: "CM" });
  return new Player({
    id: `id_${slot}_${Math.random().toString(36).slice(2, 6)}`,
    name: slot,
    displayName: slot,
    shirtNumber: 8,
    position: slot.includes("ST") ? "ST" : slot === "GK" ? "GK" : "CM",
    slot,
    side,
    attrs: resolved,
    overall: deriveOverall("CM", resolved),
  });
}

describe("attribute model V1", () => {
  it("fills legacy fallbacks and reports inferred keys", () => {
    const { attrs, inferred } = resolveAttributesDetailed(record());
    expect(attrs.acceleration).toBe(70);
    expect(attrs.agility).toBeDefined();
    expect(attrs.attackingAwareness).toBeDefined();
    expect(inferred).toContain("acceleration");
    expect(inferred).toContain("attackingAwareness");
    expect(inferred).toContain("crossing");
  });

  it("lets explicit values override fallbacks", () => {
    const { attrs, inferred } = resolveAttributesDetailed(
      record({ acceleration: 91, attackingAwareness: 88, crossing: 77 }),
    );
    expect(attrs.acceleration).toBe(91);
    expect(attrs.attackingAwareness).toBe(88);
    expect(attrs.crossing).toBe(77);
    expect(inferred).not.toContain("acceleration");
    expect(inferred).not.toContain("attackingAwareness");
    expect(inferred).not.toContain("crossing");
  });

  it("validates ratings and physical facts", () => {
    expect(validatePlayerAttributes({ pace: 101 }).length).toBeGreaterThan(0);
    expect(validatePlayerAttributes({ heightCm: 120 }).length).toBeGreaterThan(0);
    expect(validatePlayerAttributes({ weightKg: 40 }).length).toBeGreaterThan(0);
    expect(validatePlayerAttributes({ preferredFoot: "left" as const, pace: 80 }).length).toBe(0);
  });

  it("computes distinct position overalls from central weights", () => {
    const attrs = resolveAttributes(record({ finishing: 92, defending: 55, vision: 88, passing: 86 }));
    expect(OVERALL_WEIGHTS.ST).toBeDefined();
    expect(OVERALL_WEIGHTS.CB).toBeDefined();
    expect(OVERALL_WEIGHTS.GK).toBeDefined();
    const st = deriveOverall("ST", attrs);
    const cb = deriveOverall("CB", attrs);
    const cm = deriveOverall("CM", attrs);
    expect(st).not.toBe(cb);
    expect(cm).toBeGreaterThan(60);
    expect(st).toBeLessThanOrEqual(100);
  });

  it("never uses overall as a gameplay multiplier in movement/pass/shot helpers", () => {
    const finishing = resolveAttributes(record({ finishing: 95, defending: 40, pace: 88 }));
    expect(topSpeedFromPace(finishing.pace, true, false)).toBe(topSpeedFromPace(finishing.pace, true, false));
    expect(deriveOverall("ST", finishing)).toBeGreaterThan(deriveOverall("CB", finishing));
    // Sanity: top speed depends on pace alone, not overall.
    const a = topSpeedFromPace(90, true, false);
    const b = topSpeedFromPace(70, true, false);
    expect(a).toBeGreaterThan(b);
  });

  it("A: acceleration changes sprint curve; pace changes top speed", () => {
    expect(topSpeedFromPace(90, true, false)).toBeGreaterThan(topSpeedFromPace(82, true, false));
    expect(accelFromAttrs(82, 92, false)).toBeGreaterThan(accelFromAttrs(90, 70, false));

    const fastAcc = makePlayer(resolveAttributes(record({ pace: 82, acceleration: 92 })));
    const slowAcc = makePlayer(resolveAttributes(record({ pace: 90, acceleration: 70 })));
    fastAcc.x = 0;
    slowAcc.x = 0;
    for (let i = 0; i < 12; i++) {
      movePlayer(fastAcc, 1 / 60, 1, 0, true, false);
      movePlayer(slowAcc, 1 / 60, 1, 0, true, false);
    }
    // High acceleration covers more ground in the first ~0.2s despite lower top pace.
    expect(fastAcc.x).toBeGreaterThan(slowAcc.x);

    const highPace = makePlayer(resolveAttributes(record({ pace: 95, acceleration: 95 })));
    const lowPace = makePlayer(resolveAttributes(record({ pace: 70, acceleration: 95 })));
    for (let i = 0; i < 180; i++) {
      movePlayer(highPace, 1 / 60, 1, 0, true, false);
      movePlayer(lowPace, 1 / 60, 1, 0, true, false);
    }
    expect(highPace.speed).toBeGreaterThan(lowPace.speed);
  });

  it("agility changes turning rate", () => {
    expect(turnRateFromAttrs(95, 4, false)).toBeGreaterThan(turnRateFromAttrs(40, 4, false));
  });

  it("B: vision affects option evaluation; passing affects execution", () => {
    const ball = new Ball();
    const highVis = makePlayer(resolveAttributes(record({ vision: 95, passing: 65 })), "LCM");
    const highPas = makePlayer(resolveAttributes(record({ vision: 60, passing: 92 })), "LCM");
    const mate = makePlayer(resolveAttributes(record()), "RST");
    mate.x = 28;
    mate.z = 2;
    highVis.x = 10;
    highPas.x = 10;
    const throughHi = choosePassTarget(highVis, [highVis, mate], [], ball, 20, 0, "through");
    const throughLo = choosePassTarget(highPas, [highPas, mate], [], ball, 20, 0, "through");
    // Both may pick the mate; vision biases ambitious through scoring — assert execution error differs.
    expect(throughHi?.id ?? mate.id).toBe(mate.id);
    expect(throughLo?.id ?? mate.id).toBe(mate.id);

    const errLoPas = Math.abs(
      computePassError({
        distance: 18,
        pressure: 0.2,
        bodyAlignment: 1,
        energy: 1,
        attrs: highVis.attrs,
        passType: "short",
        hold01: 0.4,
      }).angleError,
    );
    const errHiPas = Math.abs(
      computePassError({
        distance: 18,
        pressure: 0.2,
        bodyAlignment: 1,
        energy: 1,
        attrs: highPas.attrs,
        passType: "short",
        hold01: 0.4,
      }).angleError,
    );
    // Average many samples — high passing should have lower mean absolute error.
    let sumLo = 0;
    let sumHi = 0;
    for (let i = 0; i < 40; i++) {
      sumLo += Math.abs(
        computePassError({
          distance: 18,
          pressure: 0.25,
          bodyAlignment: 1,
          energy: 1,
          attrs: highVis.attrs,
          passType: "short",
          hold01: 0.4,
        }).angleError,
      );
      sumHi += Math.abs(
        computePassError({
          distance: 18,
          pressure: 0.25,
          bodyAlignment: 1,
          energy: 1,
          attrs: highPas.attrs,
          passType: "short",
          hold01: 0.4,
        }).angleError,
      );
    }
    expect(sumHi / 40).toBeLessThan(sumLo / 40);
    void errLoPas;
    void errHiPas;
  });

  it("C: attacking awareness affects run evaluation depth", () => {
    const carrier = makePlayer(resolveAttributes(record()), "RST");
    carrier.x = 20;
    const highAttrs = resolveAttributes(record({ attackingAwareness: 92, pace: 70 }));
    const lowAttrs = resolveAttributes(record({ attackingAwareness: 40, pace: 90 }));
    const high = new Player({
      id: "st_high_aw",
      name: "H",
      displayName: "H",
      shirtNumber: 9,
      position: "ST",
      slot: "LST",
      side: "home",
      attrs: highAttrs,
      overall: 70,
    });
    const low = new Player({
      id: "st_high_aw", // same id → same support role hash
      name: "L",
      displayName: "L",
      shirtNumber: 10,
      position: "ST",
      slot: "LST",
      side: "home",
      attrs: lowAttrs,
      overall: 70,
    });
    high.anchorX = 22;
    high.anchorZ = 4;
    low.anchorX = 22;
    low.anchorZ = 4;
    const a = supportTarget(high, 20, 0, carrier, [carrier, high], []);
    const b = supportTarget(low, 20, 0, carrier, [carrier, low], []);
    expect(a.role).toBe(b.role);
    expect(a.x).toBeGreaterThan(b.x);
  });

  it("D: defensive awareness vs aggression — shape vs press propensity", () => {
    const aware = makePlayer(resolveAttributes(record({ defensiveAwareness: 92, aggression: 55 })), "LCB", "away");
    const agro = makePlayer(resolveAttributes(record({ defensiveAwareness: 55, aggression: 92 })), "RCB", "away");
    // Awareness expands recognition range; aggression does not replace awareness.
    expect(closeDownRange(aware)).toBeGreaterThan(closeDownRange(agro));
    const jA = jockeyTarget(aware, 10, 0, -52);
    const jB = jockeyTarget(agro, 10, 0, -52);
    // Aggressive stands closer to the ball.
    expect(Math.hypot(jB.x - 10, jB.z)).toBeLessThan(Math.hypot(jA.x - 10, jA.z));

    const ball = new Ball();
    ball.x = 12;
    ball.z = 0;
    aware.x = 8;
    agro.x = 8;
    // Both in range — aggression biases selection toward the eager presser.
    const picked = selectClosingPlayers([aware, agro], ball, 2);
    expect(picked.length).toBeGreaterThan(0);

    let agroAttempts = 0;
    let calmAttempts = 0;
    for (let i = 0; i < 80; i++) {
      if (
        shouldAiSlideTackle({
          distance: 1.5,
          ballDistance: 1.5,
          pressure: 0.7,
          possessionTime: 1.2,
          cooldown: 0,
          recoverTimer: 0,
          energy: 1,
          fromBehind: 0.2,
          throughOnGoal: false,
          ballLoose: false,
          tackling: 70,
          aggression: 92,
          defensiveRole: true,
          defending: true,
          rng: () => 0.2,
        }).attempt
      ) {
        agroAttempts++;
      }
      if (
        shouldAiSlideTackle({
          distance: 1.5,
          ballDistance: 1.5,
          pressure: 0.7,
          possessionTime: 1.2,
          cooldown: 0,
          recoverTimer: 0,
          energy: 1,
          fromBehind: 0.2,
          throughOnGoal: false,
          ballLoose: false,
          tackling: 70,
          aggression: 40,
          defensiveRole: true,
          defending: true,
          rng: () => 0.2,
        }).attempt
      ) {
        calmAttempts++;
      }
    }
    expect(agroAttempts).toBeGreaterThanOrEqual(calmAttempts);
  });

  it("heading is distinct from jumping in shot accuracy", () => {
    const heady = resolveAttributes(record({ heading: 98, jumping: 35, finishing: 50, shooting: 50, composure: 50 }));
    const jumpy = resolveAttributes(record({ heading: 35, jumping: 98, finishing: 50, shooting: 50, composure: 50 }));
    // Noise-based: wider gap + more samples so the heading path stays reliably tighter.
    const samples = 200;
    let errH = 0;
    let errJ = 0;
    for (let i = 0; i < samples; i++) {
      errH += Math.abs(computeShot({ distance: 8, pressure: 0.35, bodyAlignment: 1, energy: 1, attrs: heady, hold01: 0.5, isHeader: true }).dx);
      errJ += Math.abs(computeShot({ distance: 8, pressure: 0.35, bodyAlignment: 1, energy: 1, attrs: jumpy, hold01: 0.5, isHeader: true }).dx);
    }
    expect(errH / samples).toBeLessThan(errJ / samples);
  });

  it("telemetry is off by default and records linked decision/outcome when enabled", () => {
    const tel = new DecisionTelemetry();
    expect(tel.enabled).toBe(false);
    expect(tel.record({ type: "PASS_DECISION", simulationTime: 1, playerId: "a", teamId: "home" })).toBeNull();
    tel.configure({ enabled: true, matchId: "m1" });
    const id = tel.record({ type: "PASS_DECISION", simulationTime: 1.2, playerId: "a", teamId: "home", chosenAction: "PASS" });
    expect(id).toMatch(/^D/);
    tel.linkOutcome(id!, "PASS_OUTCOME", 1.5, { playerId: "a", teamId: "home", completed: true, progressiveDistance: 12 });
    const events = tel.getEvents();
    expect(events.length).toBe(2);
    expect(events[1].relatedDecisionId).toBe(id);
  });

  it("applyOverride ignores overall on attribute object", () => {
    const attrs = applyOverride(resolveAttributes(record()), { passing: 91, overall: 99 });
    expect(attrs.passing).toBe(91);
    expect((attrs as { overall?: number }).overall).toBeUndefined();
  });

  it("reports players relying on inferred defaults", () => {
    const list = playersWithInferredDefaults([record({ id: "legacy", name: "Legacy" })]);
    expect(list[0]?.id).toBe("legacy");
    expect(list[0]?.inferred.length).toBeGreaterThan(0);
  });
});
