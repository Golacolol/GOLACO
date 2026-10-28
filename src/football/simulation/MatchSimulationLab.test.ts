/** @vitest-environment jsdom */
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
  eligibleTeamPool,
  isClassicTeamId,
} from "./MatchSimulationLab";

beforeAll(() => {
  // jsdom has no real 2d/webgl canvas — stub enough for Match construction in tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function getContext(this: HTMLCanvasElement, type: string) {
    if (type === "2d") {
      const ctx: Record<string, unknown> = {};
      return new Proxy(ctx, {
        get(target, prop) {
          if (prop in target) return target[prop as string];
          if (prop === "canvas") return this;
          if (prop === "measureText") return () => ({ width: 10 });
          if (prop === "createLinearGradient" || prop === "createRadialGradient") {
            return () => ({ addColorStop: () => undefined });
          }
          if (prop === "getImageData") {
            return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
          }
          if (typeof prop === "string") {
            if (prop === "fillStyle" || prop === "strokeStyle" || prop === "font" || prop === "textAlign") {
              return "#000";
            }
            if (prop === "lineWidth") return 1;
            return () => undefined;
          }
          return undefined;
        },
        set(target, prop, value) {
          target[prop as string] = value;
          return true;
        },
      });
    }
    return {
      canvas: this,
      drawingBufferWidth: 64,
      drawingBufferHeight: 64,
      getExtension: () => null,
      getParameter: () => 0,
      createTexture: () => ({}),
      bindTexture: () => undefined,
      texImage2D: () => undefined,
      texParameteri: () => undefined,
      pixelStorei: () => undefined,
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
    };
  };
});


describe("Match Simulation Lab engine runs", () => {
  it("runs a short current-only simulation without selecting Classics", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const pool = eligibleTeamPool(db, { includeCurrentTeams: true, includeClassicTeams: false });
    expect(pool.every((t) => !isClassicTeamId(t.id))).toBe(true);

    const scene = new THREE.Scene();
    const camera = new MatchCamera(1);
    const events = new EventBus();
    const report = await runSimulationLab(
      { scene, camera, db, events },
      {
        matchCount: 2,
        includeCurrentTeams: true,
        includeClassicTeams: false,
        homeTeamId: "AUTO",
        awayTeamId: "AUTO",
        matchDurationSeconds: 60,
        recordTelemetry: false,
        seed: 42,
        stepSeconds: 1 / 15,
        stepsPerYield: 200,
      },
    );
    expect(report.classicTeamsIncluded).toBe(false);
    expect(report.telemetryEnabled).toBe(false);
    expect(report.matches).toHaveLength(2);
    for (const m of report.matches) {
      expect(m.homeTeamClassic).toBe(false);
      expect(m.awayTeamClassic).toBe(false);
      expect(m.result, m.error).not.toBe("FAILED");
      expect(["HOME", "AWAY", "DRAW"]).toContain(m.result);
    }
  }, 120_000);

  it("runs a fixed Classic matchup even when random Classic inclusion is OFF", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const scene = new THREE.Scene();
    const camera = new MatchCamera(1);
    const events = new EventBus();
    const fixture = CLASSIC_STRESS_FIXTURES[0]!;
    const report = await runSimulationLab(
      { scene, camera, db, events },
      {
        matchCount: 1,
        includeCurrentTeams: true,
        includeClassicTeams: false,
        homeTeamId: fixture.home,
        awayTeamId: fixture.away,
        matchDurationSeconds: 60,
        recordTelemetry: false,
        seed: 7,
        stepSeconds: 1 / 15,
        stepsPerYield: 200,
      },
    );
    expect(report.simulationMode).toBe("FIXED");
    expect(report.matches[0]?.homeTeamClassic).toBe(true);
    expect(report.matches[0]?.awayTeamClassic).toBe(true);
    expect(report.matches[0]?.result, report.matches[0]?.error).not.toBe("FAILED");
  }, 120_000);

  it("runs one Argyle-era fixture", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const scene = new THREE.Scene();
    const camera = new MatchCamera(1);
    const events = new EventBus();
    const f = ARGYLE_ERA_FIXTURES[0]!;
    const report = await runSimulationLab(
      { scene, camera, db, events },
      {
        matchCount: 1,
        includeCurrentTeams: false,
        includeClassicTeams: false,
        homeTeamId: f.home,
        awayTeamId: f.away,
        matchDurationSeconds: 60,
        recordTelemetry: false,
        seed: 3,
        stepSeconds: 1 / 15,
        stepsPerYield: 200,
      },
    );
    expect(report.matches[0]?.homeTeamId).toBe(f.home);
    expect(report.matches[0]?.awayTeamId).toBe(f.away);
    expect(report.matches[0]?.result, report.matches[0]?.error).not.toBe("FAILED");
  }, 120_000);
});
