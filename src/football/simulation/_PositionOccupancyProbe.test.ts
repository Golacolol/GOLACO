/** @vitest-environment jsdom */
/**
 * Position occupancy probe — sim heat proxies vs Plymouth League One corpora.
 * npx vitest run src/football/simulation/_PositionOccupancyProbe.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { EventBus } from "../../core/EventBus";
import { SaveManager } from "../../core/SaveManager";
import { HALF_LENGTH, PITCH_LENGTH } from "../constants";
import { InputIntent } from "../controls/InputIntent";
import { MatchCamera } from "../camera/MatchCamera";
import { Match } from "../Match";
import { FootballState } from "../FootballState";
import { classifyFootballRole, type FootballRole } from "../ai/MatchBrain";
import { listBundledCorpusIds, loadBundledCorpus } from "../training/loadRealMatchCorpus";
import { buildLabFixture } from "./MatchSimulationLab";

function installCanvasStub(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string) {
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

type RoleKey = Exclude<FootballRole, "GK">;

interface Acc {
  n: number;
  absZ: number;
  progress: number;
  anchorDrift: number;
  wideShare: number; // |z| > 18
  finalThirdShare: number; // progress > 0.66
  ownThirdShare: number; // progress < 0.33
  midThirdShare: number;
  aheadOfBall: number;
  behindBall: number;
}

function emptyAcc(): Acc {
  return {
    n: 0,
    absZ: 0,
    progress: 0,
    anchorDrift: 0,
    wideShare: 0,
    finalThirdShare: 0,
    ownThirdShare: 0,
    midThirdShare: 0,
    aheadOfBall: 0,
    behindBall: 0,
  };
}

function slotToRole(slot: string | undefined): RoleKey | null {
  if (!slot) return null;
  const fake = { slot, position: slot.includes("ST") ? "ST" : "CM", isGK: slot === "GK" } as never;
  const role = classifyFootballRole(fake);
  return role === "GK" ? null : role;
}

function addSample(acc: Acc, opts: {
  absZ: number;
  progress: number;
  drift: number;
  ahead: boolean;
}): void {
  acc.n += 1;
  acc.absZ += opts.absZ;
  acc.progress += opts.progress;
  acc.anchorDrift += opts.drift;
  if (opts.absZ > 18) acc.wideShare += 1;
  if (opts.progress > 0.66) acc.finalThirdShare += 1;
  else if (opts.progress < 0.33) acc.ownThirdShare += 1;
  else acc.midThirdShare += 1;
  if (opts.ahead) acc.aheadOfBall += 1;
  else acc.behindBall += 1;
}

function finalize(acc: Acc) {
  const n = Math.max(1, acc.n);
  return {
    n: acc.n,
    meanAbsZ: acc.absZ / n,
    meanProgress: acc.progress / n,
    meanAnchorDrift: acc.anchorDrift / n,
    widePct: (100 * acc.wideShare) / n,
    finalThirdPct: (100 * acc.finalThirdShare) / n,
    ownThirdPct: (100 * acc.ownThirdShare) / n,
    midThirdPct: (100 * acc.midThirdShare) / n,
    aheadOfBallPct: (100 * acc.aheadOfBall) / n,
  };
}

/** Typical EFL/League One heat-map norms (metres / share) — literature + Opta-style averages. */
const REAL_NORMS: Record<
  RoleKey,
  { meanAbsZ: number; attackProgress: number; defendProgress: number; widePct: number; finalThirdPctAtk: number }
> = {
  CB: { meanAbsZ: 8, attackProgress: 0.38, defendProgress: 0.28, widePct: 5, finalThirdPctAtk: 8 },
  FB: { meanAbsZ: 25, attackProgress: 0.62, defendProgress: 0.32, widePct: 72, finalThirdPctAtk: 35 },
  DM: { meanAbsZ: 7, attackProgress: 0.48, defendProgress: 0.34, widePct: 8, finalThirdPctAtk: 12 },
  CM: { meanAbsZ: 10, attackProgress: 0.55, defendProgress: 0.4, widePct: 18, finalThirdPctAtk: 28 },
  WM: { meanAbsZ: 22, attackProgress: 0.58, defendProgress: 0.38, widePct: 65, finalThirdPctAtk: 32 },
  AM: { meanAbsZ: 8, attackProgress: 0.68, defendProgress: 0.48, widePct: 15, finalThirdPctAtk: 48 },
  W: { meanAbsZ: 24, attackProgress: 0.7, defendProgress: 0.42, widePct: 70, finalThirdPctAtk: 45 },
  CF: { meanAbsZ: 6, attackProgress: 0.78, defendProgress: 0.55, widePct: 10, finalThirdPctAtk: 62 },
};

describe("position occupancy probe", () => {
  beforeAll(() => installCanvasStub());

  it(
    "samples sim role heat vs corpora + real norms",
    async () => {
      const save = new SaveManager();
      const db = await GameDatabase.load(save);
      const scene = new THREE.Scene();
      const camera = new MatchCamera(1);
      const events = new EventBus();

      const simAtk: Record<string, Acc> = {};
      const simDef: Record<string, Acc> = {};
      const roles: RoleKey[] = ["CB", "FB", "DM", "CM", "WM", "AM", "W", "CF"];
      for (const r of roles) {
        simAtk[r] = emptyAcc();
        simDef[r] = emptyAcc();
      }

      const matchCount = 6;
      const duration = 120;
      for (let m = 0; m < matchCount; m++) {
        const teams = [...db.teams.values()].filter((t) => t.teamType === "CURRENT_TEAM");
        const home = teams[m % teams.length]!;
        const away = teams[(m * 3 + 5) % teams.length]!;
        const fixture = buildLabFixture(db, home.id, away.id, duration, `pos_${m}`);
        const match = new Match(
          scene,
          camera,
          db,
          { fixture, preferredPlayerId: "", userSide: "home", autoplay: true, gameplayMode: "REAL", graphicsPreset: "LOW" },
          events,
        );
        match.startPlay();
        const step = 1 / 20;
        const intent = new InputIntent();
        let steps = 0;
        let sampleEvery = 0;
        const maxSteps = Math.ceil((duration + 90) / step) * 3;
        while (match.state !== FootballState.FULL_TIME && steps < maxSteps) {
          intent.resetEdges();
          if (match.state === FootballState.HALF_TIME) match.update(30, intent);
          else match.update(step, intent);
          steps += 1;
          sampleEvery += step;
          if (sampleEvery < 0.5) continue;
          sampleEvery = 0;
          if (match.state !== FootballState.PLAYING && match.state !== FootballState.AUTOPLAY) continue;

          const poss = match.possessing?.side ?? match.ball.lastTouchSide ?? null;
          for (const side of ["home", "away"] as const) {
            const team = side === "home" ? match.home : match.away;
            const attacking = poss === side;
            const bag = attacking ? simAtk : simDef;
            for (const p of team.players) {
              if (p.isGK || p.sentOff) continue;
              const role = classifyFootballRole(p);
              if (role === "GK") continue;
              const progress = (p.x * p.attackSign + HALF_LENGTH) / PITCH_LENGTH;
              const absZ = Math.abs(p.z);
              const drift = Math.hypot(p.x - p.anchorX, p.z - p.anchorZ);
              const ahead = (p.x - match.ball.x) * p.attackSign > 0;
              addSample(bag[role]!, { absZ, progress, drift, ahead });
            }
          }
        }
      }

      // Corpus event locations (on-ball moments — biased to actors, still useful for depth/width).
      const corpus: Record<string, Acc> = {};
      for (const r of roles) corpus[r] = emptyAcc();
      for (const id of listBundledCorpusIds()) {
        const c = loadBundledCorpus(id);
        for (const ev of c.events) {
          const role = slotToRole(ev.playerSlot);
          if (!role) continue;
          const sign = ev.actingTeamIsHome ? 1 : -1;
          const progress = (ev.start.x * sign + HALF_LENGTH) / PITCH_LENGTH;
          const absZ = Math.abs(ev.start.z);
          addSample(corpus[role]!, {
            absZ,
            progress,
            drift: 0,
            ahead: ev.end ? (ev.end.x - ev.start.x) * sign > 0 : true,
          });
        }
      }

      const report = {
        simAttack: Object.fromEntries(roles.map((r) => [r, finalize(simAtk[r]!)])),
        simDefend: Object.fromEntries(roles.map((r) => [r, finalize(simDef[r]!)])),
        corpus: Object.fromEntries(roles.map((r) => [r, finalize(corpus[r]!)])),
        norms: REAL_NORMS,
        gaps: roles.map((r) => {
          const atk = finalize(simAtk[r]!);
          const def = finalize(simDef[r]!);
          const norm = REAL_NORMS[r];
          const corp = finalize(corpus[r]!);
          return {
            role: r,
            widthGapAtk: atk.meanAbsZ - norm.meanAbsZ,
            widthGapCorpus: corp.n > 5 ? atk.meanAbsZ - corp.meanAbsZ : null,
            depthGapAtk: atk.meanProgress - norm.attackProgress,
            depthGapDef: def.meanProgress - norm.defendProgress,
            widePctGap: atk.widePct - norm.widePct,
            finalThirdGap: atk.finalThirdPct - norm.finalThirdPctAtk,
            meanAnchorDriftAtk: atk.meanAnchorDrift,
            samplesAtk: atk.n,
            samplesDef: def.n,
            samplesCorpus: corp.n,
          };
        }),
      };

      // eslint-disable-next-line no-console
      console.log("POSITION_OCCUPANCY", JSON.stringify(report, null, 2));
      expect(Object.values(simAtk).some((a) => a.n > 100)).toBe(true);
    },
    300_000,
  );
});
