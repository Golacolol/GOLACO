import { describe, expect, it } from "vitest";
import {
  frenchClassicLayout,
  tournamentModernLayout,
  openCustomLayout,
  layoutById,
  maxSlideForRod,
  manLocalZs,
} from "./TableLayouts";
import { createRodState, stepRodKick, stepRodSlide, TABLE_SPIN_ENGAGE_SECONDS } from "./TableRod";
import { createTableBall, serveTableBall } from "./TableBall";
import { stepTableBall } from "./TablePhysics";
import { rodsFromAwayDigits, rodsFromHomeDigits } from "./TableInput";
import { TABLE_AI_PROFILES } from "./TableAI";
import { normalizeTableConfig } from "./TableSetup";

describe("table layouts", () => {
  it("ships French 1-2-5-3 and modern presets with mirrored rods", () => {
    const fr = frenchClassicLayout();
    expect(fr.menPerRod).toEqual([1, 2, 5, 3]);
    expect(fr.rods.filter((r) => r.side === "home")).toHaveLength(4);
    expect(fr.rods.filter((r) => r.side === "away")).toHaveLength(4);
    expect(fr.skin).toBe("wood_aged");

    const mod = tournamentModernLayout();
    expect(mod.menPerRod).toEqual([1, 2, 5, 3]);
    expect(mod.skin).toBe("tournament_slick");
    expect(mod.dims.length).toBeLessThan(fr.dims.length);
  });

  it("clamps custom men and forces GK to 1", () => {
    const custom = openCustomLayout([3, 9, 0, 4]);
    expect(custom.menPerRod).toEqual([1, 5, 1, 4]);
    expect(layoutById("OPEN_CUSTOM", [1, 3, 3, 3]).menPerRod[1]).toBe(3);
  });

  it("computes slide limits and man spacing", () => {
    const dims = frenchClassicLayout().dims;
    expect(maxSlideForRod(5, dims)).toBeGreaterThan(0);
    expect(manLocalZs(3, dims)).toHaveLength(3);
    expect(manLocalZs(1, dims)).toEqual([0]);
  });
});

describe("table input digit maps", () => {
  it("maps home 1–5 and away 6–0", () => {
    expect(rodsFromHomeDigits([1, 3])).toEqual([0, 2]);
    expect(rodsFromHomeDigits([5])).toEqual([0, 1, 2, 3]);
    expect(rodsFromAwayDigits([6, 9])).toEqual([0, 3]);
    expect(rodsFromAwayDigits([0])).toEqual([0, 1, 2, 3]);
  });
});

describe("table rod kick / spin", () => {
  it("engages continuous spin after hold threshold", () => {
    const layout = frenchClassicLayout();
    const rod = createRodState(layout.rods[2], layout.dims);
    stepRodKick(rod, true, TABLE_SPIN_ENGAGE_SECONDS + 0.05, false, 0.05, 1);
    expect(Math.abs(rod.spinVel)).toBeGreaterThan(0.5);
  });

  it("slides and clamps", () => {
    const layout = frenchClassicLayout();
    const rod = createRodState(layout.rods[1], layout.dims);
    for (let i = 0; i < 40; i++) stepRodSlide(rod, 1, 0.05);
    expect(rod.slide).toBeLessThanOrEqual(1);
    expect(rod.slide).toBeGreaterThan(0.5);
  });
});

describe("table physics goals", () => {
  it("detects a home goal when ball enters the away mouth", () => {
    const layout = frenchClassicLayout();
    const ball = createTableBall(layout.dims);
    const rods = layout.rods.map((s) => createRodState(s, layout.dims));
    ball.x = layout.dims.length / 2 - layout.dims.ballRadius + 0.05;
    ball.z = 0;
    ball.vx = 8;
    ball.vz = 0;
    const goal = stepTableBall(ball, layout.dims, rods, 0.05);
    expect(goal).toBe("home");
  });

  it("serves the ball with velocity", () => {
    const layout = frenchClassicLayout();
    const ball = createTableBall(layout.dims);
    serveTableBall(ball, layout.dims, "away");
    expect(Math.hypot(ball.vx, ball.vz)).toBeGreaterThan(0.5);
  });
});

describe("table AI + setup", () => {
  it("exposes four difficulty profiles", () => {
    expect(TABLE_AI_PROFILES.EASY.reactionSeconds).toBeGreaterThan(TABLE_AI_PROFILES.EXPERT.reactionSeconds);
    expect(TABLE_AI_PROFILES.HARD.slideGain).toBeGreaterThan(TABLE_AI_PROFILES.EASY.slideGain);
  });

  it("normalizes match config", () => {
    const cfg = normalizeTableConfig({ firstTo: 99, customMen: [2, 8, 2, 2], opponent: "HUMAN" });
    expect(cfg.firstTo).toBe(21);
    expect(cfg.customMen[0]).toBe(1);
    expect(cfg.customMen[1]).toBe(5);
    expect(cfg.opponent).toBe("HUMAN");
  });
});
