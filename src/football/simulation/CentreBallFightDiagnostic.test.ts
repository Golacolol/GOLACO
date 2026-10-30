/** @vitest-environment jsdom */
/**
 * Short REAL autoplay probes focused on midfield possession collapse:
 * two players fighting the ball in the centre with no sustained control.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { SaveManager } from "../../core/SaveManager";
import { EventBus } from "../../core/EventBus";
import { Match } from "../Match";
import { FootballState } from "../FootballState";
import { MatchCamera } from "../camera/MatchCamera";
import { InputIntent } from "../controls/InputIntent";
import { buildLabFixture, CLASSIC_STRESS_FIXTURES, withSeededMathRandom } from "./MatchSimulationLab";

beforeAll(() => {
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

type Probe = {
  seed: number;
  simSec: number;
  passes: number;
  completion: number;
  meanPoss: number;
  shortPossShare: number;
  turnovers: number;
  possChanges: number;
  stuck: number;
  centreCrowdSamples: number;
  centreCrowdHits: number;
  dualSideHits: number;
  meanNearBall: number;
};

async function probeSeed(db: GameDatabase, seed: number, duration = 90): Promise<Probe> {
  return withSeededMathRandom(seed, async () => {
    const scene = new THREE.Scene();
    const camera = new MatchCamera(16 / 9);
    const events = new EventBus();
    const pair = CLASSIC_STRESS_FIXTURES[seed % CLASSIC_STRESS_FIXTURES.length]!;
    const fixture = buildLabFixture(db, pair.home, pair.away, Math.max(180, duration + 30), `diag-${seed}`);
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
    let sim = 0;
    let centreCrowdSamples = 0;
    let centreCrowdHits = 0;
    let dualSideHits = 0;
    let nearSum = 0;

    while (sim < duration && match.state !== FootballState.FULL_TIME) {
      intent.resetEdges();
      if (match.state === FootballState.HALF_TIME) match.update(30, intent);
      else {
        match.update(step, intent);
        sim += step;
      }
      // Sample every ~0.5s
      if (Math.floor(sim * 2) !== Math.floor((sim - step) * 2)) {
        const ball = match.ball;
        const inCentre = Math.abs(ball.x) < 18 && Math.abs(ball.z) < 16;
        if (inCentre) {
          centreCrowdSamples += 1;
          const near = match
            .allPlayers()
            .filter((p) => !p.isGK && !p.sentOff && p.distTo(ball.x, ball.z) < 2.6);
          nearSum += near.length;
          if (near.length >= 3) centreCrowdHits += 1;
          // True fight: both sides inside contact range of a slow/contested ball.
          const fight = near.filter((p) => p.distTo(ball.x, ball.z) < 2.0);
          const sides = new Set(fight.map((p) => p.side));
          if (sides.size >= 2 && fight.length >= 2) dualSideHits += 1;
        }
      }
    }

    const poss = match.stats.possessionDurations;
    const short = poss.filter((t) => t < 0.55).length;
    const report: Probe = {
      seed,
      simSec: sim,
      passes: match.stats.passes,
      completion: match.passCompletion / 100,
      meanPoss: poss.length ? poss.reduce((a, b) => a + b, 0) / poss.length : 0,
      shortPossShare: poss.length ? short / poss.length : 0,
      turnovers: match.stats.turnovers,
      possChanges: match.stats.possessionChanges,
      stuck: match.stats.stuckRecoveries,
      centreCrowdSamples,
      centreCrowdHits,
      dualSideHits,
      meanNearBall: centreCrowdSamples ? nearSum / centreCrowdSamples : 0,
    };
    match.dispose();
    return report;
  });
}

describe("centre ball-fight diagnostic", () => {
  it(
    "reports possession and centre-crowd metrics across seeds",
    async () => {
      const save = new SaveManager();
      await save.load();
      const db = await GameDatabase.load(save);

      const seeds = [11, 22, 33, 44];
      const rows: Probe[] = [];
      for (const s of seeds) rows.push(await probeSeed(db, s, 75));

      const avg = (fn: (p: Probe) => number) => rows.reduce((a, p) => a + fn(p), 0) / rows.length;
      const summary = {
        meanPoss: avg((p) => p.meanPoss),
        shortPossShare: avg((p) => p.shortPossShare),
        turnoversPerMin: avg((p) => p.turnovers / (p.simSec / 60)),
        possChangesPerMin: avg((p) => p.possChanges / (p.simSec / 60)),
        completion: avg((p) => p.completion),
        centreCrowdRate: avg((p) => (p.centreCrowdSamples ? p.centreCrowdHits / p.centreCrowdSamples : 0)),
        dualSideRate: avg((p) => (p.centreCrowdSamples ? p.dualSideHits / p.centreCrowdSamples : 0)),
        meanNearBall: avg((p) => p.meanNearBall),
        stuck: avg((p) => p.stuck),
        rows,
      };
      const snap = {
        meanPoss: +summary.meanPoss.toFixed(2),
        shortPossShare: +summary.shortPossShare.toFixed(2),
        dualSideRate: +summary.dualSideRate.toFixed(2),
        centreCrowdRate: +summary.centreCrowdRate.toFixed(2),
        meanNearBall: +summary.meanNearBall.toFixed(2),
        turnoversPerMin: +summary.turnoversPerMin.toFixed(2),
        completion: +summary.completion.toFixed(2),
      };

      // Control should last more than a touch; 3-man centre crowds / touch-flip shares should fall.
      expect(summary.meanPoss, JSON.stringify(snap)).toBeGreaterThan(0.55);
      expect(summary.centreCrowdRate, JSON.stringify(snap)).toBeLessThan(0.4);
      expect(summary.meanNearBall, JSON.stringify(snap)).toBeLessThan(2.85);
      expect(summary.shortPossShare, JSON.stringify(snap)).toBeLessThan(0.6);
      expect(summary.dualSideRate, JSON.stringify(snap)).toBeLessThan(0.65);
    },
    180_000,
  );
});
