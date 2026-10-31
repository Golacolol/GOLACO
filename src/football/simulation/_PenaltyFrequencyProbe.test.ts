/** @vitest-environment jsdom */
/**
 * Penalty frequency / conversion probe.
 * npx vitest run src/football/simulation/_PenaltyFrequencyProbe.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { GameDatabase } from "../../core/Database";
import { EventBus } from "../../core/EventBus";
import { SaveManager } from "../../core/SaveManager";
import { InputIntent } from "../controls/InputIntent";
import { MatchCamera } from "../camera/MatchCamera";
import { Match } from "../Match";
import { FootballState } from "../FootballState";
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
    return null;
  };
}

describe("penalty frequency probe", () => {
  beforeAll(() => installCanvasStub());

  it("counts penalties / conversion across short matches", async () => {
    const save = new SaveManager();
    const db = await GameDatabase.load(save);
    const scene = new THREE.Scene();
    const camera = new MatchCamera(1);
    const events = new EventBus();

    let penalties = 0;
    let penGoals = 0;
    let goals = 0;
    let fouls = 0;
    const matchCount = 8;
    const duration = 180;

    for (let m = 0; m < matchCount; m++) {
      const teams = [...db.teams.values()].filter((t) => t.teamType === "CURRENT_TEAM");
      const home = teams[m % teams.length]!;
      const away = teams[(m * 3 + 7) % teams.length]!;
      const fixture = buildLabFixture(db, home.id, away.id, duration, `pen_${m}`);
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
      const onFoul = () => {
        fouls += 1;
      };
      events.on("FOUL", onFoul);
      match.startPlay();
      const step = 1 / 20;
      const intent = new InputIntent();
      let steps = 0;
      const maxSteps = Math.ceil((duration + 90) / step) * 3;
      let lastState = match.state;
      let scoreAtPen = 0;
      let penWatch = 0;
      while (match.state !== FootballState.FULL_TIME && steps < maxSteps) {
        intent.resetEdges();
        if (match.state === FootballState.HALF_TIME) match.update(30, intent);
        else match.update(step, intent);
        steps += 1;
        if (match.state === FootballState.PENALTY && lastState !== FootballState.PENALTY) {
          penalties += 1;
          scoreAtPen = match.homeScore + match.awayScore;
          penWatch = 8; // watch ~8s of match clock for the outcome
        }
        if (penWatch > 0) {
          penWatch -= step;
          if (match.homeScore + match.awayScore > scoreAtPen) {
            penGoals += 1;
            penWatch = 0;
          }
        }
        lastState = match.state;
      }
      goals += match.homeScore + match.awayScore;
    }

    const report = {
      matches: matchCount,
      durationSec: duration,
      fouls,
      penalties,
      pensPerMatch: +(penalties / matchCount).toFixed(2),
      penGoals,
      penConversionPct: penalties ? +((100 * penGoals) / penalties).toFixed(1) : 0,
      goals,
      goalsPerMatch: +(goals / matchCount).toFixed(2),
    };
    // eslint-disable-next-line no-console
    console.log("PENALTY_PROBE", JSON.stringify(report));
    expect(matchCount).toBe(8);
  }, 180_000);
});
