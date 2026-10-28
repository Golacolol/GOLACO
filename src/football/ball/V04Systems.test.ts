import { describe, expect, it } from "vitest";
import { nextTrack, nextView } from "../camera/MatchCamera";
import { isLegalStationary } from "./StuckBall";
import { FootballState } from "../FootballState";
import { longPassLift, scorePassCandidate } from "./PassModel";
import { interceptCandidate, throughBallAim } from "../ai/PassingAI";
import { attackingSupport } from "../ai/AttackingAI";
import { firstTouchScatter } from "./DribbleModel";
import { scoreboardIsSubordinate } from "../stadium/Stadium";
import { goalCrowdLevels } from "../stadium/Crowd";
import { DEFAULT_SETTINGS } from "../../core/SaveManager";
import { Player } from "../players/Player";
import type { PlayerAttributes } from "../../data/schema";

const attrs: PlayerAttributes = {
  pace: 70, passing: 70, longPassing: 85, vision: 80, control: 70, dribbling: 70,
  shooting: 70, finishing: 70, shotPower: 70, longShots: 70, defending: 70, strength: 70, stamina: 80, composure: 70,
};

function player(id: string, x: number, z: number, vx = 0, side: "home" | "away" = "home"): Player {
  const p = new Player({ id, name: id, displayName: id, shirtNumber: 7, position: "RW", slot: "RW", side, attrs, overall: 75 });
  p.x = x; p.z = z; p.vx = vx;
  return p;
}

describe("long passing", () => {
  it("gives aerial lift unlike a short pass", () => {
    expect(longPassLift(32, 0.8, 85, 0.1)).toBeGreaterThan(3.5);
  });

  it("can prefer a distant wide teammate over a close central one when aligned", () => {
    const wide = scorePassCandidate({ alignment: 0.95, distance: 38, laneClear: 0.9, tactical: 0.7, passType: "long" });
    const close = scorePassCandidate({ alignment: 0.4, distance: 10, laneClear: 0.9, tactical: 0.2, passType: "long" });
    expect(wide.total).toBeGreaterThan(close.total);
  });
});

describe("through balls", () => {
  it("targets space ahead of a moving teammate", () => {
    const passer = player("p", 0, 0);
    const mate = player("m", 12, 2, 4);
    const aim = throughBallAim(passer, mate);
    expect(aim.x).toBeGreaterThan(mate.x);
  });
});

describe("ball-carrier AI", () => {
  it("advances the carrier toward goal instead of standing on the kickoff mark", () => {
    const carrier = player("st", 0, 0);
    carrier.hasBall = true;
    const aim = attackingSupport(carrier, 0, 0, true);
    expect(aim.x).toBeGreaterThan(carrier.x);
  });
});

describe("stuck-ball detector", () => {
  it("ignores legal restart states", () => {
    expect(isLegalStationary(FootballState.KICK_OFF, false)).toBe(true);
    expect(isLegalStationary(FootballState.FREE_KICK, false)).toBe(true);
    expect(isLegalStationary(FootballState.PLAYING, true)).toBe(true);
    expect(isLegalStationary(FootballState.PLAYING, false)).toBe(false);
  });
});

describe("camera modes", () => {
  it("cycles view CLOSE/MEDIUM/WIDE/BIRD/BIRD_FAR/PLAYER", () => {
    expect(nextView("CLOSE")).toBe("MEDIUM");
    expect(nextView("MEDIUM")).toBe("WIDE");
    expect(nextView("WIDE")).toBe("BIRD");
    expect(nextView("BIRD")).toBe("BIRD_FAR");
    expect(nextView("BIRD_FAR")).toBe("PLAYER");
    expect(nextView("PLAYER")).toBe("CLOSE");
  });

  it("cycles tracking BALL/PLAYER/DYNAMIC", () => {
    expect(nextTrack("BALL")).toBe("PLAYER");
    expect(nextTrack("PLAYER")).toBe("DYNAMIC");
    expect(nextTrack("DYNAMIC")).toBe("BALL");
  });

  it("persists view and track defaults separately", () => {
    expect(DEFAULT_SETTINGS.viewMode).toBe("MEDIUM");
    expect(DEFAULT_SETTINGS.trackMode).toBe("DYNAMIC");
    expect(DEFAULT_SETTINGS.viewMode).not.toBe(DEFAULT_SETTINGS.trackMode as string);
    expect(DEFAULT_SETTINGS.homeHudRing).toBe(false);
    expect(DEFAULT_SETTINGS.awayHudRing).toBe(false);
    expect(DEFAULT_SETTINGS.homeShowPortraits).toBe(false);
    expect(DEFAULT_SETTINGS.awayShowPortraits).toBe(false);
    expect(DEFAULT_SETTINGS.homeHidePlayers).toBe(false);
    expect(DEFAULT_SETTINGS.awayHidePlayers).toBe(false);
    expect(DEFAULT_SETTINGS.homeShowDefLine).toBe(false);
    expect(DEFAULT_SETTINGS.awayShowDefLine).toBe(false);
    expect(DEFAULT_SETTINGS.homeDefLineColor).toBe("#3db7ff");
    expect(DEFAULT_SETTINGS.ballGoldRing).toBe(false);
    expect(DEFAULT_SETTINGS.showPassTargetHighlight).toBe(false);
  });
});

describe("interceptions", () => {
  it("can intercept a pass in the lane", () => {
    const thief = player("d", 8, 0, 0, "away");
    const hit = interceptCandidate(0, 0, 16, 0, 0.2, [thief]);
    expect(hit?.id).toBe("d");
  });
});

describe("long-ball first touch", () => {
  it("is harder for low-control players, especially aerials", () => {
    const weak = firstTouchScatter(40, 0.2, 1, true);
    const strong = firstTouchScatter(90, 0.2, 1, false);
    expect(weak).toBeGreaterThan(strong);
  });
});

describe("scoreboard and crowd config", () => {
  it("keeps the LED scoreboard visually subordinate", () => {
    expect(scoreboardIsSubordinate(9.2, 3.2)).toBe(true);
    expect(scoreboardIsSubordinate(22, 8)).toBe(false);
  });

  it("activates home crowd more strongly on a home goal", () => {
    const home = goalCrowdLevels("home");
    const away = goalCrowdLevels("away");
    expect(home.home).toBeGreaterThan(home.away);
    expect(away.away).toBeGreaterThan(away.home);
  });
});
