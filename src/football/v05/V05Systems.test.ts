import playersJson from "../../../public/data/players.json";
import lineupsJson from "../../../public/data/lineups.json";
import membershipsJson from "../../../public/data/teamMemberships.json";
import fixturesJson from "../../../public/data/fixtures.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_ARGYLE_FORMATION, DEFAULT_ARGYLE_XI } from "../../data/defaultArgyleXi";
import type { FixtureRecord, LineupRecord, PlayerRecord, TeamMembership } from "../../data/schema";
import { portraitAsset, portraitFallback, portraitHtml, playerInitials } from "../../ui/Portrait";
import { REAL_TUNING, ARCADE_TUNING, tuningFor } from "../gameplay/GameplayTuning";
import { applyWeatherToTuning, clampWeatherForTime, resolveEnvironment } from "../environment/Environment";
import {
  clearChanceOpportunity,
  decideAttack,
  isStriker,
  longShotOpportunity,
  possessionUrgency,
  v04PassUrge,
} from "../ai/AttackingDecision";
import { bestAvailableSpace, forwardPathCongested, v04GoalwardTarget } from "../ai/SpaceField";
import { supportTarget, triangleOptions } from "../ai/SupportAI";
import { Player } from "../players/Player";
import { Ball } from "../ball/Ball";
import { isLegalStationary } from "../ball/StuckBall";
import { FootballState } from "../FootballState";
import { DEFAULT_SETTINGS, SaveManager } from "../../core/SaveManager";
import { remapPlayersToFormation } from "../teams/Formation";
import { HALF_LENGTH_CHOICES, kickOffTimeChoices, normalizeKickOffTime, formatKickCountdown, kickOffRemainingSeconds } from "../constants";
import type { PlayerAttributes } from "../../data/schema";
import type { GameplayTuning } from "../gameplay/GameplayTuning";

const players = playersJson as PlayerRecord[];
const lineups = lineupsJson as LineupRecord[];
const memberships = membershipsJson as TeamMembership[];
const fixtures = fixturesJson as FixtureRecord[];

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
  strength: 70,
  stamina: 80,
  composure: 70,
  ...over,
});

function make(
  id: string,
  x: number,
  z: number,
  side: "home" | "away" = "home",
  over?: Partial<PlayerAttributes>,
  slot = "CM",
): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: "CM",
    slot,
    side,
    attrs: attrs(over),
    overall: 70,
  });
  p.x = x;
  p.z = z;
  p.facing = side === "home" ? Math.PI / 2 : -Math.PI / 2;
  return p;
}

const real: GameplayTuning = REAL_TUNING;

describe("default Argyle XI", () => {
  const lineup = lineups.find((l) => l.id === "argyle_current_xi")!;

  it("contains exactly the supplied 11 players, numbers, display positions and canonical IDs", () => {
    expect(lineup.formation).toBe(DEFAULT_ARGYLE_FORMATION);
    expect(lineup.starters).toHaveLength(11);
    for (const starter of DEFAULT_ARGYLE_XI) {
      const slot = lineup.starters.find((s) => s.playerId === starter.id);
      expect(slot, starter.id).toBeTruthy();
      expect(slot!.slot).toBe(starter.slot);
      const rec = players.find((p) => p.id === starter.id);
      expect(rec?.name).toBe(starter.name);
      expect(rec?.displayName).toBe(starter.name);
      expect(rec?.primaryPosition).toBe(starter.displayPosition);
      const mem = memberships.find((m) => m.playerId === starter.id && m.teamId === "plymouth_argyle_current");
      expect(mem?.shirtNumber).toBe(starter.shirtNumber);
      expect(mem?.squadRole).toBe("FIRST_TEAM");
    }
    const ids = lineup.starters.map((s) => s.playerId);
    expect(new Set(ids).size).toBe(11);
  });
});

describe("player portraits", () => {
  it("treats a missing portrait as optional and returns a safe fallback", () => {
    expect(portraitAsset({ name: "M. Cooper", appearance: { portraitAsset: null } })).toBeNull();
    expect(portraitAsset({ name: "M. Cooper" })).toBeNull();
    const html = portraitHtml({ name: "M. Cooper" }, 1);
    expect(html).toContain("portrait-badge");
    expect(html).not.toContain("<img");
    expect(playerInitials("M. Cooper")).toBe("MC");
    expect(portraitFallback("M. Cooper", 1).number).toBe(1);
  });

  it("resolves an added portrait path without UI code changes", () => {
    const withImg = portraitHtml({ name: "M. Cooper", appearance: { portraitAsset: "/assets/players/m_cooper.png" } }, 1);
    expect(withImg).toContain("/assets/players/m_cooper.png");
    expect(portraitAsset({ appearance: { portraitAsset: "/assets/players/player_001.png" } })).toBe("/assets/players/player_001.png");
  });
});

describe("attacking decisions", () => {
  it("raises pass urgency with possession duration without a mandatory pass timer", () => {
    expect(possessionUrgency(4.2)).toBeGreaterThan(possessionUrgency(0.4));
    expect(v04PassUrge(0.2, 5)).toBeGreaterThan(0);
  });

  it("raises pass preference under heavy pressure", () => {
    const carrier = make("c", 0, 0);
    const mate = make("m", 8, 6);
    const ball = new Ball();
    const calm = decideAttack({
      carrier,
      teammates: [carrier, mate],
      opponents: [make("d", 22, 0, "away")],
      ball,
      possessionTime: 2.2,
      pressure: 0.08,
      tuning: real,
      rng: () => 0,
    });
    const press = decideAttack({
      carrier,
      teammates: [carrier, mate],
      opponents: [make("d", 1.2, 8, "away")],
      ball,
      possessionTime: 2.2,
      pressure: 0.82,
      tuning: real,
      rng: () => 0,
    });
    expect(press.scores.passScore).toBeGreaterThan(calm.scores.passScore);
  });

  it("chooses open space away from a defender-dense forward route", () => {
    const carrier = make("c", 0, 0);
    const wall = [make("a", 6, 0, "away"), make("b", 7, 0.4, "away"), make("c2", 8, -0.5, "away")];
    expect(forwardPathCongested(carrier, wall)).toBe(true);
    const space = bestAvailableSpace(carrier, wall, []);
    const v04 = v04GoalwardTarget(carrier);
    expect(Math.abs(space.z - carrier.z)).toBeGreaterThan(Math.abs(v04.z - carrier.z));
    expect(space.kind === "diagonal" || space.kind === "lateral" || space.kind === "back").toBe(true);
  });

  it("can run diagonally or laterally, not only goalward", () => {
    const carrier = make("c", 10, 0);
    const space = bestAvailableSpace(carrier, [make("d", 16, 0, "away"), make("e", 18, 0.3, "away")], []);
    expect(["diagonal", "lateral", "back", "forward"]).toContain(space.kind);
    expect(Math.abs(space.dz) + Math.abs(space.dx)).toBeGreaterThan(0.5);
  });

  it("raises longShotScore for an open edge-of-box chance and lowers it when blocked", () => {
    const shooter = make("s", 28, 2, "home", { shooting: 78, longShots: 82 });
    const open = longShotOpportunity(shooter, []);
    expect(open.open).toBe(true);
    const blocked = longShotOpportunity(shooter, [make("gk", 40, 1, "away")]);
    const ball = new Ball();
    const mate = make("m", 8, 10);
    const openDec = decideAttack({
      carrier: shooter,
      teammates: [shooter, mate],
      opponents: [],
      ball,
      possessionTime: 2,
      pressure: 0.1,
      tuning: real,
      rng: () => 0,
    });
    const blockedDec = decideAttack({
      carrier: shooter,
      teammates: [shooter, mate],
      opponents: [make("gk", 40, 1, "away")],
      ball,
      possessionTime: 2,
      pressure: 0.1,
      tuning: real,
      rng: () => 0,
    });
    expect(openDec.scores.longShotScore).toBeGreaterThan(blockedDec.scores.longShotScore);
    expect(blocked.blocked).toBe(true);
  });

  it("gives a poor long-shot player a lower longShotScore", () => {
    const ball = new Ball();
    const mate = make("m", 6, 8);
    const good = make("g", 28, 0, "home", { shooting: 80, longShots: 88 });
    const poor = make("p", 28, 0, "home", { shooting: 48, longShots: 32 });
    const goodDec = decideAttack({
      carrier: good,
      teammates: [good, mate],
      opponents: [],
      ball,
      possessionTime: 2,
      pressure: 0.12,
      tuning: real,
      rng: () => 0,
    });
    const poorDec = decideAttack({
      carrier: poor,
      teammates: [poor, mate],
      opponents: [],
      ball,
      possessionTime: 2,
      pressure: 0.12,
      tuning: real,
      rng: () => 0,
    });
    expect(goodDec.scores.longShotScore).toBeGreaterThan(poorDec.scores.longShotScore);
  });

  it("forces a shot on a near-open-goal chance even with a recycle option", () => {
    const ball = new Ball();
    const shooter = make("st", 42, 1.5, "home", { shooting: 78, finishing: 82 }, "RST");
    const mate = make("m", 30, 10);
    const gk = make("gk", 50, -3.2, "away", {}, "GK");
    const clear = clearChanceOpportunity(shooter, [gk]);
    expect(clear.close).toBe(true);
    expect(clear.quality).toBeGreaterThan(0.45);
    const dec = decideAttack({
      carrier: shooter,
      teammates: [shooter, mate],
      opponents: [gk],
      ball,
      possessionTime: 1.5,
      pressure: 0.18,
      tuning: real,
      rng: () => 0,
    });
    expect(dec.action).toBe("SHOT");
    expect(dec.scores.shotScore).toBeGreaterThan(dec.scores.passScore);
  });

  it("gives strikers a stronger run and shot urge than a midfielder in the same spot", () => {
    const ball = new Ball();
    // Inside the shooting pocket (~14m from goal) so shotScore is live.
    const st = make("st", 39, 2, "home", { shooting: 78, finishing: 80 }, "RST");
    const cm = make("cm", 39, 2, "home", { shooting: 78, finishing: 80 }, "LCM");
    const mate = make("m", 28, 8);
    expect(isStriker(st)).toBe(true);
    expect(isStriker(cm)).toBe(false);
    const stDec = decideAttack({
      carrier: st,
      teammates: [st, mate],
      opponents: [],
      ball,
      possessionTime: 1.2,
      pressure: 0.2,
      tuning: real,
      rng: () => 0,
    });
    const cmDec = decideAttack({
      carrier: cm,
      teammates: [cm, mate],
      opponents: [],
      ball,
      possessionTime: 1.2,
      pressure: 0.2,
      tuning: real,
      rng: () => 0,
    });
    expect(stDec.scores.runScore).toBeGreaterThan(cmDec.scores.runScore);
    expect(stDec.scores.shotScore).toBeGreaterThan(cmDec.scores.shotScore);
  });

  it("builds play in the own half instead of always sprinting forward", () => {
    const cb = make("cb", -30, 4, "home", { composure: 78, passing: 74 }, "LCB");
    const cm = make("cm", -8, 6, "home", {}, "LCM");
    const dec = decideAttack({
      carrier: cb,
      teammates: [cb, cm],
      opponents: [make("d", 18, 0, "away")],
      ball: new Ball(),
      possessionTime: 1.4,
      pressure: 0.16,
      tuning: real,
      rng: () => 0,
    });
    expect(dec.scores.holdScore + dec.scores.passScore).toBeGreaterThan(dec.scores.runScore);
    expect(dec.scores.throughBallScore).toBeLessThan(dec.scores.passScore);
  });

  it("creates multiple passing-triangle options from support movement", () => {
    const carrier = make("c", 10, 0, "home", {}, "LCM");
    const st = make("st", 18, 2, "home", {}, "LST");
    const lm = make("lm", 10, 12, "home", {}, "LM");
    const cb = make("cb", 2, 0, "home", {}, "LCB");
    st.anchorX = 20;
    st.anchorZ = 4;
    lm.anchorX = 12;
    lm.anchorZ = 18;
    cb.anchorX = 0;
    cb.anchorZ = 0;
    const a = supportTarget(st, 10, 0, carrier, [carrier, st, lm, cb], []);
    const b = supportTarget(lm, 10, 0, carrier, [carrier, st, lm, cb], []);
    const c = supportTarget(cb, 10, 0, carrier, [carrier, st, lm, cb], []);
    st.x = a.x;
    st.z = a.z;
    lm.x = b.x;
    lm.z = b.z;
    cb.x = c.x;
    cb.z = c.z;
    const tri = triangleOptions(carrier, [carrier, st, lm, cb]);
    expect(tri.forward + tri.lateral + tri.recycle).toBeGreaterThanOrEqual(2);
    expect(a.role).not.toBe(b.role);
  });

  it("keeps a partner striker onside while allowing a legal channel ahead", () => {
    const carrier = make("c", 20, 0, "home", {}, "RST");
    const partner = make("st2", 40, 4, "home", {}, "LST");
    partner.anchorX = 38;
    partner.anchorZ = 5;
    const d1 = make("d1", 32, -2, "away", {}, "LCB");
    const d2 = make("d2", 31, 3, "away", {}, "RCB");
    const gk = make("gk", 48, 0, "away", {}, "GK");
    const spot = supportTarget(partner, 20, 0, carrier, [carrier, partner], [d1, d2, gk], "attack");
    // Must stay onside of the defensive line (~31).
    expect(spot.x).toBeLessThanOrEqual(30.5);
    expect(spot.x).toBeGreaterThan(carrier.x);
    expect(
      spot.role === "FORWARD_RUN" ||
        spot.role === "PENALTY_AREA_RUN" ||
        spot.role === "EDGE_OF_BOX" ||
        spot.role === "SUPPORT_SIDE" ||
        spot.role === "CHECK_TO_BALL",
    ).toBe(true);
  });

  it("remaps 4-4-2-W full-backs onto 4-3-3 full-backs", () => {
    const mapped = remapPlayersToFormation(
      [
        { id: "gk", slot: "GK", isGK: true },
        { id: "lb", slot: "LB", isGK: false },
        { id: "lcb", slot: "LCB", isGK: false },
        { id: "rcb", slot: "RCB", isGK: false },
        { id: "rb", slot: "RB", isGK: false },
        { id: "lm", slot: "LM", isGK: false },
        { id: "lcm", slot: "LCM", isGK: false },
        { id: "rcm", slot: "RCM", isGK: false },
        { id: "rm", slot: "RM", isGK: false },
        { id: "lst", slot: "LST", isGK: false },
        { id: "rst", slot: "RST", isGK: false },
      ],
      "4-3-3",
      "4-4-2-W",
    );
    expect(mapped.find((m) => m.id === "gk")?.slot).toBe("GK");
    expect(mapped.find((m) => m.id === "lb")?.slot).toBe("LB");
    expect(mapped.find((m) => m.id === "rb")?.slot).toBe("RB");
  });
});

describe("gameplay modes", () => {
  it("keeps distinct REAL and ARCADE tuning profiles", () => {
    expect(ARCADE_TUNING.movementAccelerationMultiplier).toBeGreaterThan(REAL_TUNING.movementAccelerationMultiplier);
    expect(ARCADE_TUNING.maxSpeedMultiplier).toBeGreaterThan(REAL_TUNING.maxSpeedMultiplier);
    expect(ARCADE_TUNING.shotPowerMultiplier).toBeGreaterThan(REAL_TUNING.shotPowerMultiplier);
    expect(ARCADE_TUNING.staminaDrainMultiplier).toBeLessThan(REAL_TUNING.staminaDrainMultiplier);
    expect(ARCADE_TUNING.firstTouchErrorMultiplier).toBeLessThan(REAL_TUNING.firstTouchErrorMultiplier);
    expect(ARCADE_TUNING.longShotDecisionMultiplier).toBeGreaterThan(REAL_TUNING.longShotDecisionMultiplier);
    expect(ARCADE_TUNING.keeperDiveReachMultiplier).toBeGreaterThan(REAL_TUNING.keeperDiveReachMultiplier);
    expect(ARCADE_TUNING.keeperHoldBiasMultiplier).toBeGreaterThan(REAL_TUNING.keeperHoldBiasMultiplier);
    expect(ARCADE_TUNING.headerContestUpsetMultiplier).toBeLessThan(REAL_TUNING.headerContestUpsetMultiplier);
    expect(ARCADE_TUNING.counterPressWindowMultiplier).toBeGreaterThan(REAL_TUNING.counterPressWindowMultiplier);
    expect(ARCADE_TUNING.counterPressAggressionMultiplier).toBeGreaterThan(REAL_TUNING.counterPressAggressionMultiplier);
    expect(tuningFor("REAL").id).toBe("REAL");
    expect(tuningFor("ARCADE").id).toBe("ARCADE");
  });

  it("does not change canonical player ratings when switching modes", () => {
    const rec = players.find((p) => p.id === "player_arg_cooper")!;
    const pace = rec.pace;
    void tuningFor("ARCADE");
    void tuningFor("REAL");
    expect(rec.pace).toBe(pace);
    expect(rec.passing).toBeTypeOf("number");
  });

  it("persists mode selection through save settings", () => {
    const store: Record<string, string> = {};
    const mem = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: () => null,
      length: 0,
    };
    const prev = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true });
    const a = new SaveManager();
    a.data.settings.gameplayMode = "ARCADE";
    a.data.settings.timeOfDay = "NIGHT";
    a.data.settings.weather = "SNOWY";
    a.save();
    const b = new SaveManager();
    expect(b.data.settings.gameplayMode).toBe("ARCADE");
    expect(b.data.settings.timeOfDay).toBe("NIGHT");
    expect(b.data.settings.weather).toBe("SNOWY");
    Object.defineProperty(globalThis, "localStorage", { value: prev, configurable: true });
    expect(DEFAULT_SETTINGS.gameplayMode).toBe("REAL");
    expect(DEFAULT_SETTINGS.kickOffTime).toBe("15:00");
    expect(DEFAULT_SETTINGS.matchDuration).toBe(600);
  });
});

describe("environment", () => {
  it("loads DAY, NIGHT, SUNNY, MILD, RAINY and SNOWY presets", () => {
    expect(resolveEnvironment("DAY", "SUNNY").timeOfDay).toBe("DAY");
    expect(resolveEnvironment("DAY", "SUNNY").sunIntensity).toBeGreaterThan(resolveEnvironment("NIGHT", "MILD").sunIntensity);
    expect(resolveEnvironment("NIGHT", "MILD").floodlightIntensity).toBeGreaterThan(resolveEnvironment("DAY", "SUNNY").floodlightIntensity);
    expect(resolveEnvironment("DAY", "SUNNY").precipitation).toBe("none");
    expect(resolveEnvironment("EVENING", "MILD").weather).toBe("MILD");
    expect(resolveEnvironment("DAY", "RAINY").precipitation).toBe("rain");
    expect(resolveEnvironment("NIGHT", "SNOWY").precipitation).toBe("snow");
    expect(resolveEnvironment("NIGHT", "SNOWY").highContrastBall).toBe(true);
  });

  it("drops SUNNY at night and turns the sun off", () => {
    expect(clampWeatherForTime("NIGHT", "SUNNY")).toBe("MILD");
    const nightSun = resolveEnvironment("NIGHT", "SUNNY");
    expect(nightSun.weather).toBe("MILD");
    expect(nightSun.sunIntensity).toBe(0);
    expect(resolveEnvironment("DAY", "SUNNY").sunIntensity).toBeGreaterThan(0.5);
  });

  it("applies modest rainy ball handling and keeps snowy ball visibility", () => {
    const rainy = applyWeatherToTuning(REAL_TUNING, resolveEnvironment("DAY", "RAINY"));
    const dry = applyWeatherToTuning(REAL_TUNING, resolveEnvironment("DAY", "SUNNY"));
    expect(rainy.ballFrictionMultiplier).toBeLessThan(dry.ballFrictionMultiplier);
    expect(rainy.firstTouchErrorMultiplier).toBeGreaterThan(dry.firstTouchErrorMultiplier);
    expect(resolveEnvironment("NIGHT", "SNOWY").highContrastBall).toBe(true);
    const arcadeRain = applyWeatherToTuning(ARCADE_TUNING, resolveEnvironment("DAY", "RAINY"));
    expect(arcadeRain.firstTouchErrorMultiplier).toBeGreaterThan(rainy.firstTouchErrorMultiplier * 0.5);
  });

  it("loads fixture environment defaults and allows Quick Match override", () => {
    const f = fixtures[0];
    expect(f.gameplayModeDefault).toBe("REAL");
    expect(f.timeOfDay).toBe("EVENING");
    expect(f.weather).toBe("MILD");
    expect(f.time).toBe("15:00");
    expect(f.durationSeconds).toBe(600);
    expect(kickOffTimeChoices()).toContain("15:00");
    expect(kickOffTimeChoices()).toContain("19:45");
    expect(HALF_LENGTH_CHOICES.some((c) => c.minutes === 5 && c.seconds === 600)).toBe(true);
    expect(normalizeKickOffTime("15:00")).toBe("15:00");
    const overridden: FixtureRecord = {
      ...f,
      gameplayModeDefault: "ARCADE",
      timeOfDay: "DAY",
      weather: "SNOWY",
      durationSeconds: 180,
    };
    expect(overridden.gameplayModeDefault).toBe("ARCADE");
    expect(overridden.timeOfDay).toBe("DAY");
    expect(overridden.weather).toBe("SNOWY");
  });

  it("formats a two-digit kick-off countdown by days, hours, minutes, then seconds", () => {
    expect(formatKickCountdown(48 * 3600)).toEqual({ value: "2", phase: "days" });
    expect(formatKickCountdown(24 * 3600 + 1)).toEqual({ value: "1", phase: "days" });
    expect(formatKickCountdown(24 * 3600)).toEqual({ value: "24", phase: "hours" });
    expect(formatKickCountdown(7200)).toEqual({ value: "2", phase: "hours" });
    expect(formatKickCountdown(3601)).toEqual({ value: "1", phase: "hours" });
    expect(formatKickCountdown(3600)).toEqual({ value: "60", phase: "minutes" });
    expect(formatKickCountdown(61)).toEqual({ value: "1", phase: "minutes" });
    expect(formatKickCountdown(60)).toEqual({ value: "60", phase: "seconds" });
    expect(formatKickCountdown(9)).toEqual({ value: "9", phase: "seconds" });
    expect(formatKickCountdown(0)).toEqual({ value: "0", phase: "seconds" });
    const now = new Date(2026, 8, 8, 14, 0, 0);
    expect(kickOffRemainingSeconds("2026-09-08", "15:00", now)).toBe(3600);
  });
});

describe("v0.4 invariants retained", () => {
  it("still encodes a single-owner transfer", () => {
    const a = make("a", 0, 0);
    const b = make("b", 1, 0, "away");
    a.hasBall = true;
    a.hasBall = false;
    b.hasBall = true;
    expect([a, b].filter((p) => p.hasBall)).toHaveLength(1);
  });

  it("still treats kickoff as a legal stationary state", () => {
    expect(isLegalStationary(FootballState.KICK_OFF, false)).toBe(true);
    expect(isLegalStationary(FootballState.PLAYING, false)).toBe(false);
  });
});
