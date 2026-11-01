/** @vitest-environment jsdom */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { SaveManager } from "../../core/SaveManager";
import { EventBus } from "../../core/EventBus";
import { MatchCamera } from "../camera/MatchCamera";
import { Match } from "../Match";
import { FootballState } from "../FootballState";
import { InputIntent } from "../controls/InputIntent";
import { passKickVector } from "../ball/PassModel";
import { Ball } from "../ball/Ball";
import { kickBall, stepBall } from "../ball/BallPhysics";
import { BALL_GRAVITY, BALL_RADIUS } from "../constants";
import { buildLabFixture, withSeededMathRandom } from "./MatchSimulationLab";
import { evaluateGameplayFidelity, summarizeGameplayFidelity } from "./GameplayFidelity";

function installCanvasStub(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function getContext(this: HTMLCanvasElement, type: string) {
    if (type === "2d") {
      const ctx: Record<string, unknown> = {};
      return new Proxy(ctx, {
        get(target, prop) {
          if (prop in target) return target[prop as string];
          if (prop === "measureText") return () => ({ width: 10 });
          if (prop === "getImageData") {
            return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
          }
          if (prop === "createLinearGradient" || prop === "createRadialGradient") {
            return () => ({ addColorStop: () => undefined });
          }
          if (typeof prop === "string") {
            if (prop === "fillStyle" || prop === "strokeStyle" || prop === "font" || prop === "textAlign") return "#000";
            if (prop === "lineWidth") return 1;
            if (prop === "canvas") return this;
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
}

describe("GameplayFidelity helpers", () => {
  it("fails flat / flickery samples and passes healthy ones", () => {
    const bad = evaluateGameplayFidelity(
      summarizeGameplayFidelity({
        matchSeconds: 600,
        passes: 200,
        completedPasses: 40,
        possessionDurations: [0.1, 0.15, 0.2],
        passApexSamples: [0.18, 0.22, 0.2, 0.21, 0.19],
        shotApexSamples: [0.2],
        teamWidthSamples: [18, 20, 19],
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.completionOk).toBe(false);
    expect(bad.passApexOk).toBe(false);

    const good = evaluateGameplayFidelity(
      summarizeGameplayFidelity({
        matchSeconds: 600,
        passes: 120,
        completedPasses: 80,
        possessionDurations: [1.2, 1.4, 0.9, 1.1],
        passApexSamples: [0.9, 1.1, 0.85, 1.0, 1.2],
        shotApexSamples: [1.4, 1.6],
        teamWidthSamples: [42, 48, 45],
      }),
    );
    expect(good.ok).toBe(true);
  });

  it("short passes stay ground-first under the calibrated kick model", () => {
    const ball = new Ball();
    ball.reset(0, 0);
    const kick = passKickVector(0, 0, 14, 0, "short");
    kickBall(ball, kick.vx, kick.vz, kick.vy);
    const approxApex = BALL_RADIUS + (kick.vy * kick.vy) / (2 * BALL_GRAVITY);
    expect(approxApex).toBeGreaterThan(0.2);
    expect(approxApex).toBeLessThan(0.95);
    let maxY = ball.y;
    for (let i = 0; i < 90; i++) {
      stepBall(ball, 1 / 60);
      maxY = Math.max(maxY, ball.y);
    }
    expect(maxY).toBeGreaterThan(0.2);
    expect(maxY).toBeLessThan(1.45);
  });
});

describe("REAL autoplay gameplay fidelity probe", () => {
  beforeAll(() => {
    installCanvasStub();
  });

  it(
    "keeps completion, possession spell, pass apex, and width above soft floors",
    async () => {
      const save = new SaveManager();
      const db = await GameDatabase.load(save);
      const scene = new THREE.Scene();
      const camera = new MatchCamera(1);
      const events = new EventBus();
      const fixture = buildLabFixture(
        db,
        "classic_arsenal_2003_04",
        "classic_chelsea_2004_05",
        120,
        "fidelity_probe",
      );

      const report = await withSeededMathRandom(42, async () => {
        const match = new Match(
          scene,
          camera,
          db,
          {
            fixture,
            preferredPlayerId: "",
            userSide: "home",
            autoplay: true,
            gameplayMode: "REAL",
            graphicsPreset: "LOW",
          },
          events,
        );
        match.startPlay();
        const intent = new InputIntent();
        const step = 1 / 30;
        const target = 120;
        let sim = 0;
        let guard = 0;
        while (sim < target && match.state !== FootballState.FULL_TIME && guard < 15000) {
          intent.resetEdges();
          if (match.state === FootballState.HALF_TIME) match.update(30, intent);
          else {
            match.update(step, intent);
            sim += step;
          }
          guard += 1;
        }
        const sample = summarizeGameplayFidelity({
          matchSeconds: sim,
          passes: match.stats.passes,
          completedPasses: match.stats.completedPasses,
          possessionDurations: match.stats.possessionDurations,
          passApexSamples: match.stats.passApexSamples,
          shotApexSamples: match.stats.shotApexSamples,
          teamWidthSamples: match.stats.teamWidthSamples,
        });
        match.dispose();
        return evaluateGameplayFidelity(sample, { shortProbe: true });
      });

      const detail = `passes=${report.sample.passes} completion=${report.passCompletion.toFixed(2)} possess=${report.sample.meanPossessionSpell.toFixed(2)}s apex=${report.sample.medianPassApex.toFixed(2)} width=${report.sample.meanTeamWidth.toFixed(1)} ppm=${report.passesPerMinute.toFixed(1)}`;
      expect(report.sample.passes, detail).toBeGreaterThan(5);
      expect(report.passApexOk, detail).toBe(true);
      expect(report.completionOk, detail).toBe(true);
      expect(report.possessionOk, detail).toBe(true);
      expect(report.widthOk, detail).toBe(true);
      expect(report.ok, detail).toBe(true);
    },
    90_000,
  );
});
