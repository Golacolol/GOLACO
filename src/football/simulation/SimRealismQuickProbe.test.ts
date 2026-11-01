/** @vitest-environment jsdom */
/**
 * Quick post-tune realism check (not a CI gate — excluded from default if too slow;
 * kept short: 4×90s). Run: npx vitest run src/football/simulation/SimRealismQuickProbe.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { EventBus } from "../../core/EventBus";
import { SaveManager } from "../../core/SaveManager";
import { MatchCamera } from "../camera/MatchCamera";
import { runSimulationLab } from "./MatchSimulationLab";

function installCanvasStub(): void {
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
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

describe("sim realism quick probe (post-tune)", () => {
  beforeAll(() => installCanvasStub());

  it(
    "improves possession length, shot rate, width sampling, and pass mix vs prior baseline",
    async () => {
      const save = new SaveManager();
      const db = await GameDatabase.load(save);
      const report = await runSimulationLab(
        { scene: new THREE.Scene(), camera: new MatchCamera(1), db, events: new EventBus() },
        {
          matchCount: 4,
          includeCurrentTeams: true,
          includeClassicTeams: false,
          homeTeamId: "AUTO",
          awayTeamId: "AUTO",
          matchDurationSeconds: 90,
          recordTelemetry: false,
          seed: 4242,
          stepSeconds: 1 / 20,
          stepsPerYield: 250,
        },
      );
      const done = report.matches.filter((m) => m.result !== "FAILED" && m.stats);
      expect(done.length).toBe(4);

      const possess = mean(done.map((m) => m.stats!.meanPossessionDuration));
      const teamPossess = mean(done.map((m) => m.stats!.meanTeamPossessionDuration ?? 0));
      const shots = mean(done.map((m) => m.stats!.shots));
      const completion = mean(done.map((m) => m.stats!.passCompletion));
      const shortShare = mean(done.map((m) => (m.stats!.passes ? m.stats!.shortPasses / m.stats!.passes : 0)));
      const longShare = mean(done.map((m) => (m.stats!.passes ? m.stats!.longPasses / m.stats!.passes : 0)));
      const width = mean(done.map((m) => m.stats!.meanTeamWidth ?? 0).filter((w) => w > 0));
      const phases = done.map((m) => m.stats!.phaseShares ?? {});
      const transition = mean(phases.map((p) => p.transition ?? 0));
      const build = mean(phases.map((p) => p.build ?? 0));
      const attack = mean(phases.map((p) => p.attack ?? 0));
      const loose = mean(phases.map((p) => p.loose ?? 0));
      const offsides = mean(done.map((m) => m.stats!.offsides));

      const detail = JSON.stringify({
        possess,
        teamPossess,
        shots,
        completion,
        shortShare,
        longShare,
        width,
        transition,
        build,
        attack,
        loose,
        offsides,
      });
      // eslint-disable-next-line no-console
      console.log("realism-quick", detail);

      // Soft regression floors vs prior 180s batch (possess~1.1, shots~14/3min, transition~0.7, width~21).
      expect(possess, detail).toBeGreaterThan(1.05);
      expect(teamPossess, detail).toBeGreaterThan(2.5);
      expect(shots, detail).toBeLessThanOrEqual(10);
      expect(completion, detail).toBeGreaterThan(54);
      expect(shortShare, detail).toBeLessThan(0.94);
      expect(longShare, detail).toBeGreaterThan(0.02);
      expect(transition, detail).toBeLessThan(0.55);
      expect(build + attack, detail).toBeGreaterThan(0.25);
      expect(loose, detail).toBeLessThan(0.35);
      if (width > 0) expect(width, detail).toBeGreaterThan(26);
    },
    180_000,
  );
});
