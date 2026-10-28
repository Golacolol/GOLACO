/** @vitest-environment jsdom */
/**
 * Longer sample validation for Classic Teams V2 completion report.
 * Uses short match durations for CI practicality.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { SaveManager } from "../../core/SaveManager";
import { EventBus } from "../../core/EventBus";
import { MatchCamera } from "../camera/MatchCamera";
import {
  runSimulationLab,
  ARGYLE_ERA_FIXTURES,
  CLASSIC_STRESS_FIXTURES,
  compareAbReports,
} from "./MatchSimulationLab";

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function getContext(this: HTMLCanvasElement, type: string) {
    if (type === "2d") {
      const store: Record<string, unknown> = {};
      return new Proxy(store, {
        get(t, prop) {
          if (prop in t) return t[prop as string];
          if (prop === "measureText") return () => ({ width: 10 });
          if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop: () => undefined });
          if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
          if (typeof prop === "string" && (prop === "fillStyle" || prop === "strokeStyle" || prop === "font")) return "#000";
          return () => undefined;
        },
        set(t, prop, value) {
          t[prop as string] = value;
          return true;
        },
      });
    }
    return { getExtension: () => null, getParameter: () => 0, createTexture: () => ({}), bindTexture: () => undefined, texImage2D: () => undefined, texParameteri: () => undefined, createBuffer: () => ({}), bindBuffer: () => undefined, bufferData: () => undefined, createShader: () => ({}), shaderSource: () => undefined, compileShader: () => undefined, createProgram: () => ({}), attachShader: () => undefined, linkProgram: () => undefined, useProgram: () => undefined, getShaderParameter: () => true, getProgramParameter: () => true, viewport: () => undefined, clear: () => undefined, clearColor: () => undefined, enable: () => undefined, disable: () => undefined, depthFunc: () => undefined, blendFunc: () => undefined, drawArrays: () => undefined, drawElements: () => undefined, canvas: this, drawingBufferWidth: 64, drawingBufferHeight: 64, pixelStorei: () => undefined };
  };
});

describe("Classic V2 sample simulation validation", () => {
  it("runs 10 baseline + 5 classic stress + 3 Argyle era matches", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const host = { scene: new THREE.Scene(), camera: new MatchCamera(1), db, events: new EventBus() };
    const short = {
      matchDurationSeconds: 60,
      recordTelemetry: false as const,
      seed: 99 as const,
      stepSeconds: 1 / 15,
      stepsPerYield: 250,
    };

    const baseline = await runSimulationLab(host, {
      matchCount: 10,
      includeCurrentTeams: true,
      includeClassicTeams: false,
      homeTeamId: "AUTO",
      awayTeamId: "AUTO",
      ...short,
    });
    expect(baseline.classicTeamsIncluded).toBe(false);
    expect(baseline.matchesCompleted).toBe(10);
    expect(baseline.matches.every((m) => !m.homeTeamClassic && !m.awayTeamClassic)).toBe(true);

    const mixed = await runSimulationLab(host, {
      matchCount: 10,
      includeCurrentTeams: true,
      includeClassicTeams: true,
      homeTeamId: "AUTO",
      awayTeamId: "AUTO",
      ...short,
    });
    expect(mixed.classicTeamsIncluded).toBe(true);
    expect(mixed.matchesCompleted).toBe(10);

    const stressMatches = [];
    for (let i = 0; i < 5; i++) {
      const f = CLASSIC_STRESS_FIXTURES[i]!;
      const r = await runSimulationLab(host, {
        matchCount: 1,
        includeCurrentTeams: false,
        includeClassicTeams: false,
        homeTeamId: f.home,
        awayTeamId: f.away,
        ...short,
      });
      stressMatches.push(...r.matches);
    }
    expect(stressMatches).toHaveLength(5);
    expect(stressMatches.every((m) => m.result !== "FAILED")).toBe(true);

    for (const f of ARGYLE_ERA_FIXTURES) {
      const r = await runSimulationLab(host, {
        matchCount: 1,
        includeCurrentTeams: false,
        includeClassicTeams: false,
        homeTeamId: f.home,
        awayTeamId: f.away,
        ...short,
      });
      expect(r.matches[0]?.result).not.toBe("FAILED");
    }

    const ab = compareAbReports(baseline, mixed);
    expect(ab.goalsPerMatch.a).toBeTypeOf("number");
    expect(ab.goalsPerMatch.b).toBeTypeOf("number");

    // Soft log for completion report (visible in vitest output).
    console.log(
      JSON.stringify(
        {
          baseline: baseline.aggregates,
          mixed: mixed.aggregates,
          stressScores: stressMatches.map((m) => `${m.homeTeamId}:${m.homeScore}-${m.awayScore}:${m.awayTeamId}`),
          ab,
        },
        null,
        2,
      ),
    );
  }, 600_000);
});
