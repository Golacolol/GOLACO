/** @vitest-environment jsdom */
/**
 * Ball pitch-spread + kick-off reliability probe.
 * Compares sampled ball locations to typical football thirds / width patterns.
 * Run: npx vitest run src/football/simulation/BallPitchSpreadProbe.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { EventBus } from "../../core/EventBus";
import { SaveManager } from "../../core/SaveManager";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import { InputIntent } from "../controls/InputIntent";
import { MatchCamera } from "../camera/MatchCamera";
import { Match } from "../Match";
import { FootballState } from "../FootballState";
import { buildLabFixture, CLASSIC_STRESS_FIXTURES, withSeededMathRandom } from "./MatchSimulationLab";

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

/** Typical open-play ball location shares (UEFA/Opta-style thirds & corridor). */
const TYPICAL = {
  /** Middle third of length usually busiest. */
  middleThirdMin: 0.32,
  /** Allow ~1pp seed noise above the 0.55 “typical peak” band. */
  middleThirdMax: 0.56,
  /** Extreme corners rarely hold the ball for long. */
  cornerMax: 0.08,
  /** Central corridor (|z| < 12) should see a solid share of play. */
  centralCorridorMin: 0.38,
  /** Both length halves should see meaningful time. */
  halfBalanceMin: 0.28,
};

type SpreadReport = {
  seed: number;
  samples: number;
  thirdDef: number;
  thirdMid: number;
  thirdAtt: number;
  halfNeg: number;
  halfPos: number;
  central: number;
  wide: number;
  corner: number;
  meanAbsX: number;
  meanAbsZ: number;
  kickOffPassOk: boolean;
  kickOffLeftCentre: boolean;
  passes: number;
};

async function probeSeed(db: GameDatabase, seed: number, duration = 75): Promise<SpreadReport> {
  return withSeededMathRandom(seed, async () => {
    const scene = new THREE.Scene();
    const camera = new MatchCamera(16 / 9);
    const events = new EventBus();
    const pair = CLASSIC_STRESS_FIXTURES[seed % CLASSIC_STRESS_FIXTURES.length]!;
    const fixture = buildLabFixture(db, pair.home, pair.away, Math.max(180, duration + 40), `ball-spread-${seed}`);
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
    let samples = 0;
    let thirdDef = 0;
    let thirdMid = 0;
    let thirdAtt = 0;
    let halfNeg = 0;
    let halfPos = 0;
    let central = 0;
    let wide = 0;
    let corner = 0;
    let absX = 0;
    let absZ = 0;
    let kickOffPassOk = false;
    let kickOffLeftCentre = false;
    const passesAtStart = match.stats.passes;

    while (sim < duration && match.state !== FootballState.FULL_TIME) {
      intent.resetEdges();
      if (match.state === FootballState.HALF_TIME) match.update(30, intent);
      else {
        match.update(step, intent);
        sim += step;
      }

      const openPlay =
        match.state === FootballState.PLAYING || match.state === FootballState.AUTOPLAY;

      // Kick-off: within ~2.5s we must have left the spot with a completed ritual pass.
      if (sim <= 2.6) {
        if (match.stats.passes > passesAtStart) kickOffPassOk = true;
        if (Math.hypot(match.ball.x, match.ball.z) > 3.5 || openPlay) {
          if (match.stats.passes > passesAtStart || Math.hypot(match.ball.vx, match.ball.vz) > 2) {
            kickOffLeftCentre = true;
          }
        }
      }

      // Sample every 0.25s in open play (autoplay matches use AUTOPLAY, not PLAYING).
      if (openPlay && Math.floor(sim * 4) !== Math.floor((sim - step) * 4)) {
        const x = match.ball.x;
        const z = match.ball.z;
        samples += 1;
        absX += Math.abs(x);
        absZ += Math.abs(z);
        if (x < 0) halfNeg += 1;
        else halfPos += 1;
        // Length thirds relative to full pitch (−HL…+HL).
        const u = (x + HALF_LENGTH) / (HALF_LENGTH * 2);
        if (u < 1 / 3) thirdDef += 1;
        else if (u < 2 / 3) thirdMid += 1;
        else thirdAtt += 1;
        if (Math.abs(z) < 12) central += 1;
        else wide += 1;
        if (Math.abs(x) > HALF_LENGTH - 16 && Math.abs(z) > HALF_WIDTH - 12) corner += 1;
      }
    }

    const report: SpreadReport = {
      seed,
      samples,
      thirdDef: samples ? thirdDef / samples : 0,
      thirdMid: samples ? thirdMid / samples : 0,
      thirdAtt: samples ? thirdAtt / samples : 0,
      halfNeg: samples ? halfNeg / samples : 0,
      halfPos: samples ? halfPos / samples : 0,
      central: samples ? central / samples : 0,
      wide: samples ? wide / samples : 0,
      corner: samples ? corner / samples : 0,
      meanAbsX: samples ? absX / samples : 0,
      meanAbsZ: samples ? absZ / samples : 0,
      kickOffPassOk,
      kickOffLeftCentre,
      passes: match.stats.passes,
    };
    match.dispose();
    return report;
  });
}

describe("ball pitch spread + kick-off probe", () => {
  beforeAll(() => installCanvasStub());

  it(
    "kick-offs complete and ball spread matches typical thirds / width",
    async () => {
      const db = await GameDatabase.load(new SaveManager());
      const seeds = [11, 22, 33, 44];
      const reports: SpreadReport[] = [];
      for (const seed of seeds) reports.push(await probeSeed(db, seed, 75));

      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const mid = mean(reports.map((r) => r.thirdMid));
      const corner = mean(reports.map((r) => r.corner));
      const central = mean(reports.map((r) => r.central));
      const halfNeg = mean(reports.map((r) => r.halfNeg));
      const halfPos = mean(reports.map((r) => r.halfPos));
      const kickOk = reports.filter((r) => r.kickOffPassOk && r.kickOffLeftCentre).length;
      const meanAbsZ = mean(reports.map((r) => r.meanAbsZ));

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            typical: TYPICAL,
            kickOffOk: `${kickOk}/${reports.length}`,
            thirds: {
              def: mean(reports.map((r) => r.thirdDef)),
              mid,
              att: mean(reports.map((r) => r.thirdAtt)),
            },
            halves: { neg: halfNeg, pos: halfPos },
            central,
            wide: mean(reports.map((r) => r.wide)),
            corner,
            meanAbsX: mean(reports.map((r) => r.meanAbsX)),
            meanAbsZ,
            perSeed: reports.map((r) => ({
              seed: r.seed,
              kick: r.kickOffPassOk && r.kickOffLeftCentre,
              mid: +r.thirdMid.toFixed(2),
              central: +r.central.toFixed(2),
              corner: +r.corner.toFixed(2),
              passes: r.passes,
              samples: r.samples,
            })),
          },
          null,
          2,
        ),
      );

      expect(kickOk, `kick-off failed on ${reports.length - kickOk}/${reports.length} seeds`).toBe(reports.length);
      expect(mid, `middle third share ${mid}`).toBeGreaterThan(TYPICAL.middleThirdMin);
      expect(mid, `middle third share ${mid}`).toBeLessThan(TYPICAL.middleThirdMax);
      expect(corner, `corner share ${corner}`).toBeLessThan(TYPICAL.cornerMax);
      expect(central, `central corridor ${central}`).toBeGreaterThan(TYPICAL.centralCorridorMin);
      expect(Math.min(halfNeg, halfPos), `half balance ${halfNeg}/${halfPos}`).toBeGreaterThan(TYPICAL.halfBalanceMin);
      // Width should reach beyond a narrow tunnel (~12–22 m mean |z| is healthy).
      expect(meanAbsZ).toBeGreaterThan(8);
      expect(meanAbsZ).toBeLessThan(28);
    },
    180_000,
  );
});
