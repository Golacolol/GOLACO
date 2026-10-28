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
import { ballSpeed } from "../ball/StuckBall";
import { selectClosingPlayers } from "../ai/DefensiveAI";
import type { Player } from "../players/Player";
import { buildLabFixture } from "./MatchSimulationLab";

function installCanvasStub(): void {
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
}

export type FreezeSample = {
  simSec: number;
  state: string;
  possId: string | null;
  possSide: string | null;
  ballX: number;
  ballZ: number;
  ballSpd: number;
  frozenOutfield: number;
  nearest: {
    id: string;
    side: string;
    dist: number;
    speed: number;
    desiredNearBall: boolean;
    inHomeClosers: boolean;
    inAwayClosers: boolean;
    teamAiSkipped: boolean;
    dxDesiredBall: number;
  };
  longPassLanding: { x: number; z: number } | null;
  passTargetId: string | null;
  stuckTimer: number;
};

function outfield(players: Player[]): Player[] {
  return players.filter((p) => !p.isGK && !p.sentOff);
}

function nearestToBall(players: Player[], bx: number, bz: number): Player {
  let best = players[0]!;
  let bd = Infinity;
  for (const p of players) {
    const d = p.distTo(bx, bz);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Mirror Match.collectReceiverSkip — who TeamAI will not move this frame. */
function receiverSkipIds(match: Match): Set<string> {
  const skip = new Set<string>();
  if (match.possessing) return skip;
  const add = (id: string) => skip.add(id);
  if (match.passTargetId) add(match.passTargetId);
  const landing = match.longPassLanding;
  const lastTouch = match.ball.lastTouchId;
  if (!landing || !lastTouch) return skip;
  const ballToLand = Math.hypot(match.ball.x - landing.x, match.ball.z - landing.z);
  if (ballToLand > 14 && match.ball.y < 0.85) return skip;
  const passer = match.allPlayers().find((p) => p.id === lastTouch);
  if (!passer) return skip;
  const mates = match.allPlayers().filter((p) => p.side === passer.side);
  for (const p of mates) {
    if (p.isGK || p.id === passer.id) continue;
    const toLand = p.distTo(landing.x, landing.z);
    if (toLand >= 16) continue;
    const toBall = p.distTo(match.ball.x, match.ball.z);
    if (toBall + 1.2 < toLand) continue;
    add(p.id);
  }
  return skip;
}

function closerSets(match: Match): { home: Set<string>; away: Set<string> } {
  const homePoss = match.possessing?.side ?? null;
  const homeUs = match.allPlayers().filter((p) => p.side === "home");
  const awayUs = match.allPlayers().filter((p) => p.side === "away");
  const homeCl =
    homePoss !== "home" ? new Set(selectClosingPlayers(homeUs, match.ball, 2).map((p) => p.id)) : new Set<string>();
  const awayCl =
    homePoss !== "away" ? new Set(selectClosingPlayers(awayUs, match.ball, 2).map((p) => p.id)) : new Set<string>();
  return { home: homeCl, away: awayCl };
}

function sampleMatch(match: Match, simSec: number): FreezeSample {
  const players = outfield(match.allPlayers());
  const frozen = players.filter((p) => p.speed < 0.3).length;
  const near = nearestToBall(players, match.ball.x, match.ball.z);
  const closers = closerSets(match);
  const skip = receiverSkipIds(match);
  const desiredNearBall = Math.abs(near.desiredX - match.ball.x) < 4 && Math.abs(near.desiredZ - match.ball.z) < 4;
  return {
    simSec,
    state: match.state,
    possId: match.possessing?.id ?? null,
    possSide: match.possessing?.side ?? null,
    ballX: +match.ball.x.toFixed(2),
    ballZ: +match.ball.z.toFixed(2),
    ballSpd: +ballSpeed(match.ball).toFixed(3),
    frozenOutfield: frozen,
    nearest: {
      id: near.id,
      side: near.side,
      dist: +near.distTo(match.ball.x, match.ball.z).toFixed(2),
      speed: +near.speed.toFixed(3),
      desiredNearBall,
      inHomeClosers: closers.home.has(near.id),
      inAwayClosers: closers.away.has(near.id),
      teamAiSkipped: skip.has(near.id),
      dxDesiredBall: +Math.hypot(near.desiredX - match.ball.x, near.desiredZ - match.ball.z).toFixed(2),
    },
    longPassLanding: match.longPassLanding ? { x: match.longPassLanding.x, z: match.longPassLanding.z } : null,
    passTargetId: match.passTargetId,
    stuckTimer: match.debug.stuckTimer,
  };
}

export type DiagnosticReport = {
  seed: number;
  homeTeamId: string;
  awayTeamId: string;
  durationSimSec: number;
  freezeHits: number;
  firstFreeze: FreezeSample | null;
  worstFreeze: FreezeSample | null;
  logLines: string[];
};

export async function runAutoplayFreezeDiagnostic(opts: {
  seed: number;
  durationSimSec?: number;
  homeTeamId?: string;
  awayTeamId?: string;
  stepSeconds?: number;
  verbose?: boolean;
}): Promise<DiagnosticReport> {
  const save = new SaveManager();
  const db = await GameDatabase.load(save);
  const homeTeamId = opts.homeTeamId ?? "classic_arsenal_2003_04";
  const awayTeamId = opts.awayTeamId ?? "classic_chelsea_2004_05";
  const durationSimSec = opts.durationSimSec ?? 90;
  const step = opts.stepSeconds ?? 1 / 15;
  const scene = new THREE.Scene();
  const camera = new MatchCamera(1);
  const events = new EventBus();
  const fixture = buildLabFixture(db, homeTeamId, awayTeamId, durationSimSec + 30, `freeze_diag_${opts.seed}`);

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
  const logLines: string[] = [];
  let simT = 0;
  let nextLog = 0;
  let freezeHits = 0;
  let firstFreeze: FreezeSample | null = null;
  let worstFreeze: FreezeSample | null = null;

  const playingStates = new Set<string>([FootballState.PLAYING, FootballState.AUTOPLAY, FootballState.KICK_OFF]);

  try {
    while (simT < durationSimSec) {
      if (match.state === FootballState.HALF_TIME) {
        match.update(30, intent);
        continue;
      }
      if (match.state === FootballState.FULL_TIME) break;
      match.update(step, intent);
      simT += step;

      if (simT + 1e-6 < nextLog) continue;
      const sample = sampleMatch(match, Math.round(simT));
      const line = [
        `t=${sample.simSec}s`,
        `state=${sample.state}`,
        `poss=${sample.possId ?? "—"}/${sample.possSide ?? "—"}`,
        `ball=(${sample.ballX},${sample.ballZ}) spd=${sample.ballSpd}`,
        `frozen=${sample.frozenOutfield}/20`,
        `near=${sample.nearest.id} d=${sample.nearest.dist} spd=${sample.nearest.speed}`,
        `closers=${sample.nearest.inHomeClosers || sample.nearest.inAwayClosers}`,
        `desNear=${sample.nearest.desiredNearBall}`,
        `skip=${sample.nearest.teamAiSkipped}`,
        `desΔ=${sample.nearest.dxDesiredBall}`,
        sample.longPassLanding ? `land=(${sample.longPassLanding.x.toFixed(1)},${sample.longPassLanding.z.toFixed(1)})` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      logLines.push(line);
      if (opts.verbose) console.log(line);

      const loose = !sample.possId;
      const ballMoving = sample.ballSpd > 0.35;
      const massFreeze = sample.frozenOutfield >= 16;
      const nearestStuck = sample.nearest.speed < 0.35;
      const isFreeze =
        playingStates.has(sample.state) && loose && ballMoving && massFreeze && nearestStuck;

      if (isFreeze) {
        freezeHits += 1;
        if (!firstFreeze) firstFreeze = sample;
        if (!worstFreeze || sample.frozenOutfield > worstFreeze.frozenOutfield) worstFreeze = sample;
      }
      nextLog += 1;
    }
  } finally {
    match.dispose();
  }

  return {
    seed: opts.seed,
    homeTeamId,
    awayTeamId,
    durationSimSec: Math.round(simT),
    freezeHits,
    firstFreeze,
    worstFreeze,
    logLines,
  };
}

beforeAll(() => {
  installCanvasStub();
});

describe("autoplay freeze diagnostic", () => {
  it(
    "keeps players chasing through previously freezing seeds",
    async () => {
      // Seeds 42 and 2026 previously froze (~18/20 idle) after kick-off / pass flight.
      const seeds = [42, 2026, 7];
      const reports: DiagnosticReport[] = [];
      for (const seed of seeds) {
        reports.push(await runAutoplayFreezeDiagnostic({ seed, durationSimSec: 90, verbose: false }));
      }
      console.log("\n=== AUTOPLAY FREEZE DIAGNOSTIC SUMMARY ===");
      for (const r of reports) {
        console.log(
          `seed=${r.seed} freezeHits=${r.freezeHits} first@${r.firstFreeze?.simSec ?? "—"}s worst frozen=${r.worstFreeze?.frozenOutfield ?? "—"}`,
        );
      }
      for (const r of reports) {
        expect(r.freezeHits, `seed ${r.seed} should not mass-freeze`).toBe(0);
      }
    },
    180_000,
  );
});
