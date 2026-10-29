/** @vitest-environment jsdom */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { EventBus } from "../../core/EventBus";
import { SaveManager } from "../../core/SaveManager";
import { officialSeasonMatches } from "../../data/officialResults";
import { MatchCamera } from "../camera/MatchCamera";
import { choosePassTarget, isFlatCrossFieldPass } from "../ai/PassingAI";
import { Ball } from "../ball/Ball";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";
import { compareSimPassMixToReal, loadBundledCorpus } from "../training";
import { buildLabFixtureFromOfficial, simulateOneMatch } from "./MatchSimulationLab";
import {
  REAL_MATCH_REPLAY_SET,
  REAL_PLYMOUTH_WIMBLEDON_2026_10_10,
  REAL_STEVENAGE_PLYMOUTH_SMOKE,
  labelOfficialMatch,
  officialMatchesForTeam,
  resolveOfficialMatch,
} from "./ReplayFixtures";

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function getContext(this: HTMLCanvasElement, type: string) {
    if (type === "2d") {
      const store: Record<string, unknown> = {};
      return new Proxy(store, {
        get(t, prop) {
          if (prop in t) return t[prop as string];
          if (prop === "measureText") return () => ({ width: 10 });
          if (prop === "createLinearGradient" || prop === "createRadialGradient") {
            return () => ({ addColorStop: () => undefined });
          }
          if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
          if (typeof prop === "string" && (prop === "fillStyle" || prop === "strokeStyle" || prop === "font")) {
            return "#000";
          }
          return () => undefined;
        },
        set(t, prop, value) {
          t[prop as string] = value;
          return true;
        },
      });
    }
    return {
      getExtension: () => null,
      getParameter: () => 0,
      createTexture: () => ({}),
      bindTexture: () => undefined,
      texImage2D: () => undefined,
      texParameteri: () => undefined,
      createBuffer: () => ({}),
      bindBuffer: () => undefined,
      bufferData: () => undefined,
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      createProgram: () => ({}),
      attachShader: () => undefined,
      linkProgram: () => undefined,
      useProgram: () => undefined,
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      viewport: () => undefined,
      clear: () => undefined,
      clearColor: () => undefined,
      enable: () => undefined,
      disable: () => undefined,
      depthFunc: () => undefined,
      blendFunc: () => undefined,
      drawArrays: () => undefined,
      drawElements: () => undefined,
      canvas: this,
      drawingBufferWidth: 64,
      drawingBufferHeight: 64,
      pixelStorei: () => undefined,
    };
  };
});

const attrs: PlayerAttributes = {
  pace: 70,
  passing: 74,
  longPassing: 68,
  vision: 72,
  control: 70,
  dribbling: 68,
  shooting: 55,
  finishing: 55,
  shotPower: 60,
  longShots: 55,
  defending: 55,
  strength: 70,
  stamina: 80,
  composure: 72,
};

function make(id: string, x: number, z: number, slot: string): Player {
  const p = new Player({
    id,
    name: id,
    displayName: id,
    shirtNumber: 8,
    position: "CM",
    slot,
    side: "home",
    attrs,
    overall: 72,
  });
  p.x = x;
  p.z = z;
  return p;
}

describe("real-world official match catalog", () => {
  it("resolves every curated replay spec against officialSeasonMatches()", () => {
    const catalog = officialSeasonMatches();
    for (const spec of REAL_MATCH_REPLAY_SET) {
      const official = resolveOfficialMatch(spec, catalog);
      expect(official.homeTeamId).toBe(spec.homeTeamId);
      expect(official.awayTeamId).toBe(spec.awayTeamId);
      expect(official.date).toBe(spec.date);
      expect(official.competition).toBe(spec.competition);
      expect(labelOfficialMatch(official).length).toBeGreaterThan(20);
    }
  });

  it("keeps played Argyle results with official scores", () => {
    const official = resolveOfficialMatch(REAL_PLYMOUTH_WIMBLEDON_2026_10_10);
    expect(official.played).toBe(true);
    expect(official.homeScore).toBe(2);
    expect(official.awayScore).toBe(1);
  });

  it("lists Stevenage v Plymouth as the official League One calendar fixture", () => {
    // Played/unplayed follows the live overlay — assert identity + kick-off, not a frozen "tonight" flag.
    const official = resolveOfficialMatch(REAL_STEVENAGE_PLYMOUTH_SMOKE);
    expect(official.date).toBe("2026-10-20");
    expect(official.time).toBe("19:45");
    expect(official.homeTeamId).toBe("stevenage_current");
    expect(official.awayTeamId).toBe("plymouth_argyle_current");
    expect(official.competition).toBe("League One");
    if (official.played) {
      expect(typeof official.homeScore).toBe("number");
      expect(typeof official.awayScore).toBe("number");
    }
  });

  it("exposes a full Argyle season calendar from official data", () => {
    const argyle = officialMatchesForTeam("plymouth_argyle_current");
    expect(argyle.length).toBeGreaterThan(20);
    const tonight = argyle.find((m) => m.date === "2026-10-20");
    expect(tonight?.awayTeamId).toBe("plymouth_argyle_current");
    expect(tonight?.homeTeamId).toBe("stevenage_current");
  });
});

describe("build-up pass policy", () => {
  it("still allows a progressive diagonal switch when short options are dead", () => {
    const passer = make("cm", 0, 12, "RCM");
    const diagonal = make("lw", 9, -10, "LW");
    const ball = new Ball();
    expect(isFlatCrossFieldPass(passer, diagonal.x, diagonal.z)).toBe(true);
    const target = choosePassTarget(passer, [passer, diagonal], [], ball, 1, 0, "short", { style: "buildup" });
    expect(target?.id).toBe("lw");
  });

  it("prefers a short same-side lane over a flat opposite-wing switch", () => {
    const passer = make("cm", 0, 10, "RCM");
    const short = make("cm2", 8, 6, "LCM");
    const flat = make("lm", 2, -18, "LM");
    const ball = new Ball();
    const target = choosePassTarget(passer, [passer, short, flat], [], ball, 0, 0, "short", { style: "buildup" });
    expect(target?.id).toBe("cm2");
  });
});

describe("REAL_STEVENAGE_PLYMOUTH_SMOKE (official listing)", () => {
  it("recreates the same seeded match twice from real fixture metadata", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const official = resolveOfficialMatch(REAL_STEVENAGE_PLYMOUTH_SMOKE);
    expect(db.teams.has(official.homeTeamId)).toBe(true);
    expect(db.teams.has(official.awayTeamId)).toBe(true);

    const host = {
      scene: new THREE.Scene(),
      camera: new MatchCamera(1),
      db,
      events: new EventBus(),
    };
    const fixture = buildLabFixtureFromOfficial(
      db,
      official,
      REAL_STEVENAGE_PLYMOUTH_SMOKE.matchDurationSeconds,
      REAL_STEVENAGE_PLYMOUTH_SMOKE.id,
    );
    expect(fixture.competition).toBe("League One");
    expect(fixture.date).toBe("2026-10-20");
    expect(fixture.time).toBe("19:45");
    expect(fixture.official).toBe(true);
    expect(fixture.timeOfDay).toBe("NIGHT");

    const opts = {
      seed: REAL_STEVENAGE_PLYMOUTH_SMOKE.seed,
      recordTelemetry: false,
      stepSeconds: REAL_STEVENAGE_PLYMOUTH_SMOKE.stepSeconds,
      stepsPerYield: REAL_STEVENAGE_PLYMOUTH_SMOKE.stepsPerYield,
    };

    const a = await simulateOneMatch(host, fixture, opts);
    const b = await simulateOneMatch(host, fixture, opts);

    expect(a.result, a.error).not.toBe("FAILED");
    expect(b.result, b.error).not.toBe("FAILED");
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    expect(a.stats?.passes).toBe(b.stats?.passes);
    expect(a.stats?.shortPasses).toBe(b.stats?.shortPasses);
    expect(a.stats?.longPasses).toBe(b.stats?.longPasses);
    expect(a.stats?.crossFieldPasses).toBe(b.stats?.crossFieldPasses);

    const passes = a.stats?.passes ?? 0;
    const short = a.stats?.shortPasses ?? 0;
    const long = a.stats?.longPasses ?? 0;
    const crossField = a.stats?.crossFieldPasses ?? 0;
    expect(passes).toBeGreaterThan(8);
    expect(short).toBeGreaterThan(long);
    expect(short / Math.max(1, passes)).toBeGreaterThan(0.45);
    expect(crossField / Math.max(1, passes)).toBeLessThan(0.28);
  }, 120_000);
});

describe("sim gated by real match training corpus", () => {
  it("keeps seeded Argyle sim pass mix within Plymouth–Wimbledon real targets", async () => {
    const corpus = loadBundledCorpus(REAL_PLYMOUTH_WIMBLEDON_2026_10_10.id);
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const official = resolveOfficialMatch(REAL_PLYMOUTH_WIMBLEDON_2026_10_10);
    const host = {
      scene: new THREE.Scene(),
      camera: new MatchCamera(1),
      db,
      events: new EventBus(),
    };
    const fixture = buildLabFixtureFromOfficial(db, official, 60, `${REAL_PLYMOUTH_WIMBLEDON_2026_10_10.id}_train`);
    const result = await simulateOneMatch(host, fixture, {
      seed: REAL_PLYMOUTH_WIMBLEDON_2026_10_10.seed,
      recordTelemetry: false,
      stepSeconds: 1 / 15,
      stepsPerYield: 220,
    });
    expect(result.result, result.error).not.toBe("FAILED");
    const gate = compareSimPassMixToReal(corpus, {
      passes: result.stats?.passes ?? 0,
      shortPasses: result.stats?.shortPasses ?? 0,
      longPasses: result.stats?.longPasses ?? 0,
      crossFieldPasses: result.stats?.crossFieldPasses ?? 0,
      throughBalls: result.stats?.throughBalls,
      crosses: result.stats?.crosses,
      shots: result.stats?.shots,
      offsides: result.stats?.offsides,
      progressivePasses: result.stats?.progressivePasses,
      meanPassLengthM: result.stats?.meanPassLengthM,
      matchSeconds: result.simulatedMatchSeconds,
      turnovers: result.stats?.turnovers,
      stuckRecoveries: result.stats?.stuckRecoveries,
      phaseSeconds: result.stats?.phaseShares,
      meanStOffsideGap: result.stats?.meanStOffsideGap,
    });
    expect(gate.withinTolerance, `shortΔ=${gate.shortDelta.toFixed(2)} xfΔ=${gate.crossFieldDelta.toFixed(2)}`).toBe(true);
    expect(result.stats?.meanPassLengthM ?? 0).toBeGreaterThan(0);
    expect(result.stats?.phaseShares).toBeTruthy();
  }, 120_000);
});
