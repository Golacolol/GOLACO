import { describe, expect, it } from "vitest";
import { Ball } from "../ball/Ball";
import { matchPhase, teamMatchPhase } from "./MatchBrain";
import type { Player } from "../players/Player";

function stub(side: "home" | "away"): Player {
  return {
    side,
    attackSign: side === "home" ? 1 : -1,
    isGK: false,
  } as Player;
}

describe("matchPhase", () => {
  it("returns loose / defend / build / attack / transition / chance", () => {
    const ball = new Ball();
    const home = stub("home");
    expect(matchPhase(home, ball, null)).toBe("loose");
    expect(matchPhase(home, ball, "away")).toBe("defend");
    ball.x = -20;
    expect(matchPhase(home, ball, "home")).toBe("build");
    ball.x = 30;
    expect(matchPhase(home, ball, "home")).toBe("attack");
    expect(matchPhase(home, ball, "home", { transitionAge: 1 })).toBe("transition");
    expect(
      matchPhase(home, ball, "home", { transitionAge: 10, distGoal: 12, chanceQuality: 0.7 }),
    ).toBe("chance");
  });

  it("teamMatchPhase mirrors side ownership", () => {
    const ball = new Ball();
    ball.x = 0;
    expect(teamMatchPhase("home", ball, "away", 1)).toBe("defend");
    expect(teamMatchPhase("home", ball, null, 1)).toBe("loose");
  });
});
