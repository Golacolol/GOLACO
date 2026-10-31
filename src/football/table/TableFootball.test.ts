import { describe, expect, it } from "vitest";
import {
  frenchClassicLayout,
  tournamentModernLayout,
  openCustomLayout,
  layoutById,
  maxSlideForRod,
  manLocalZs,
  manClearGap,
  manCenterSpacing,
} from "./TableLayouts";
import { createRodState, stepRodKick, stepRodSlide, TABLE_SPIN_ENGAGE_SECONDS } from "./TableRod";
import { createTableBall, serveTableBall, stepGoalSink } from "./TableBall";
import { stepTableBall } from "./TablePhysics";
import { rodsFromAwayDigits, rodsFromHomeDigits } from "./TableInput";
import { TABLE_AI_PROFILES, TableAI } from "./TableAI";
import { normalizeTableConfig } from "./TableSetup";
import { createTableIntent } from "./TableInput";

describe("table layouts", () => {
  it("ships French 1-2-5-3 and modern presets with mirrored rods", () => {
    const fr = frenchClassicLayout();
    expect(fr.menPerRod).toEqual([1, 2, 5, 3]);
    expect(fr.rods.filter((r) => r.side === "home")).toHaveLength(4);
    expect(fr.rods.filter((r) => r.side === "away")).toHaveLength(4);

    const mod = tournamentModernLayout();
    expect(mod.menPerRod).toEqual([1, 2, 5, 3]);
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

  it("keeps clear gaps between men smaller than the ball so it cannot settle untouchable", () => {
    const dims = frenchClassicLayout().dims;
    expect(manClearGap(dims)).toBeLessThanOrEqual(dims.ballRadius * 2);
    const zs = manLocalZs(5, dims);
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i]! - zs[i - 1]!).toBeCloseTo(manCenterSpacing(dims), 5);
    }
    // With slide range, outermost man can still cover near the wall.
    const outer = Math.abs(zs[0]!);
    expect(outer + maxSlideForRod(5, dims) + dims.manRadius).toBeGreaterThan(dims.width / 2 - 0.35);
  });
});

describe("table goal sink", () => {
  it("drives a scored ball past the goal line into the abyss and drops it", () => {
    const dims = frenchClassicLayout().dims;
    const ball = createTableBall(dims);
    ball.x = dims.length / 2 - dims.ballRadius;
    ball.z = 0;
    ball.vx = 2;
    const startY = ball.y;
    for (let i = 0; i < 40; i++) stepGoalSink(ball, dims, "home", 1 / 60);
    expect(ball.x).toBeGreaterThan(dims.length / 2 + dims.goalDepth * 0.4);
    expect(ball.y).toBeLessThan(startY - 0.05);
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
  it("strikes immediately on kickPressed", () => {
    const layout = frenchClassicLayout();
    const rod = createRodState(layout.rods[2]!, layout.dims);
    stepRodKick(rod, true, 0, false, 0.05, 1, true);
    expect(rod.spinVel).toBeGreaterThan(10);
    expect(rod.strikeArc).toBeGreaterThan(1);
  });

  it("engages continuous spin after hold threshold (no active strike)", () => {
    const layout = frenchClassicLayout();
    const rod = createRodState(layout.rods[2]!, layout.dims);
    stepRodKick(rod, true, TABLE_SPIN_ENGAGE_SECONDS + 0.05, false, 0.05, 1, false);
    expect(Math.abs(rod.spinVel)).toBeGreaterThan(0.5);
  });

  it("stops spinning when pressed again while coasting", () => {
    const layout = frenchClassicLayout();
    const rod = createRodState(layout.rods[2]!, layout.dims);
    rod.spinVel = 18;
    stepRodKick(rod, true, 0, false, 0.05, 1, true);
    expect(Math.abs(rod.spinVel)).toBe(0);
  });

  it("slides and clamps without coasting when input stops", () => {
    const layout = frenchClassicLayout();
    const rod = createRodState(layout.rods[1]!, layout.dims);
    for (let i = 0; i < 40; i++) stepRodSlide(rod, 1, 0.05);
    expect(rod.slide).toBeLessThanOrEqual(1);
    expect(rod.slide).toBeGreaterThan(0.5);
    const held = rod.slide;
    for (let i = 0; i < 10; i++) stepRodSlide(rod, 0, 0.05);
    expect(rod.slide).toBe(held);
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
    expect(stepTableBall(ball, layout.dims, rods, 0.05)).toBe("home");
  });

  it("serves the ball with velocity", () => {
    const layout = frenchClassicLayout();
    const ball = createTableBall(layout.dims);
    serveTableBall(ball, layout.dims, "away");
    expect(Math.hypot(ball.vx, ball.vz)).toBeGreaterThan(0.5);
  });

  it("a home midfield strike drives the ball toward the away goal", () => {
    const layout = frenchClassicLayout();
    const dims = layout.dims;
    const homeMid = createRodState(layout.rods.find((r) => r.side === "home" && r.index === 2)!, dims);
    const rods = [homeMid];
    const ball = createTableBall(dims);
    ball.x = homeMid.spec.x + 0.1;
    ball.z = 0;
    ball.vx = 0;
    ball.vz = 0;
    stepRodKick(homeMid, true, 0, false, 1 / 60, 1, true);
    expect(homeMid.spinVel).toBeGreaterThan(10);
    let peakX = ball.x;
    let peakVx = 0;
    for (let i = 0; i < 40; i++) {
      stepTableBall(ball, dims, rods, 1 / 60);
      stepRodKick(homeMid, false, 0, false, 1 / 60, 1, false);
      peakX = Math.max(peakX, ball.x);
      peakVx = Math.max(peakVx, ball.vx);
    }
    expect(peakVx).toBeGreaterThan(2);
    expect(peakX).toBeGreaterThan(homeMid.spec.x + 0.8);
    expect(homeMid.strikeArc).toBe(0);
  });
});

describe("table AI + setup", () => {
  it("exposes four difficulty profiles", () => {
    expect(TABLE_AI_PROFILES.EASY.reactionSeconds).toBeGreaterThan(TABLE_AI_PROFILES.EXPERT.reactionSeconds);
  });

  it("normalizes match config", () => {
    const cfg = normalizeTableConfig({ firstTo: 99, customMen: [2, 8, 2, 2], opponent: "HUMAN" });
    expect(cfg.firstTo).toBe(21);
    expect(cfg.customMen[0]).toBe(1);
    expect(cfg.opponent).toBe("HUMAN");
  });
});

describe("table match playability (headless)", () => {
  it("can score with scripted home strikes against idle away", () => {
    const layout = frenchClassicLayout();
    const dims = layout.dims;
    const rods = layout.rods.map((s) => createRodState(s, dims));
    const ball = createTableBall(dims);
    let goals = 0;

    // Place ball on home attack rod and strike repeatedly toward goal.
    const att = rods.find((r) => r.spec.side === "home" && r.spec.index === 3)!;
    for (let attempt = 0; attempt < 8 && goals === 0; attempt++) {
      ball.x = att.spec.x + 0.12;
      ball.z = 0;
      ball.vx = 0;
      ball.vz = 0;
      // Clear away men from the lane by sliding them wide.
      for (const r of rods) {
        if (r.spec.side === "away") r.slide = 1;
      }
      stepRodKick(att, true, 0, false, 1 / 60, 1, true);
      for (let i = 0; i < 90; i++) {
        stepRodKick(att, false, 0, false, 1 / 60, 1, false);
        const g = stepTableBall(ball, dims, rods, 1 / 60);
        if (g === "home") {
          goals += 1;
          break;
        }
      }
    }
    expect(goals).toBeGreaterThan(0);
  });

  it("keeps rods responding in an AI bout", () => {
    const layout = frenchClassicLayout();
    const dims = layout.dims;
    const rods = layout.rods.map((s) => createRodState(s, dims));
    const ball = createTableBall(dims);
    serveTableBall(ball, dims, "away");
    const ai = new TableAI("HARD");
    const intent = createTableIntent();
    let strikes = 0;
    let slides = 0;
    let goals = 0;
    let maxSpin = 0;

    for (let frame = 0; frame < 60 * 30; frame++) {
      const dt = 1 / 60;
      const homeRods = rods.filter((r) => r.spec.side === "home");
      let best = homeRods[2]!;
      let bestD = Infinity;
      for (const r of homeRods) {
        const d = Math.abs(r.spec.x - ball.x);
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      const err = (ball.z - best.slide * best.maxSlide) / Math.max(0.2, dims.width / 2);
      const slide = Math.max(-1, Math.min(1, err * 1.4));
      stepRodSlide(best, slide, dt);
      if (Math.abs(slide) > 0.15) slides += 1;
      const lined =
        Math.abs(ball.z - best.slide * best.maxSlide) < dims.manRadius * 4 &&
        Math.abs(ball.x - best.spec.x) < 0.9;
      if (lined && frame % 10 === 0) {
        stepRodKick(best, true, 0, false, dt, 1, true);
        strikes += 1;
      } else {
        stepRodKick(best, false, 0, false, dt, 1, false);
      }
      maxSpin = Math.max(maxSpin, Math.abs(best.spinVel));

      ai.tick(dt, ball, rods.filter((r) => r.spec.side === "away"), dims, intent.away);
      for (const rod of rods.filter((r) => r.spec.side === "away")) {
        if (!intent.away.selected.includes(rod.spec.index)) {
          stepRodKick(rod, false, 0, false, dt, -1, false);
          continue;
        }
        stepRodSlide(rod, intent.away.slide, dt);
        stepRodKick(
          rod,
          intent.away.kickHeld,
          intent.away.kickHoldSeconds,
          intent.away.kickReleased,
          dt,
          -1,
          intent.away.kickPressed,
        );
      }

      const goal = stepTableBall(ball, dims, rods, dt);
      if (goal) {
        goals += 1;
        serveTableBall(ball, dims, goal === "home" ? "away" : "home");
      } else if (Math.hypot(ball.vx, ball.vz) < 0.1 && frame % 80 === 0) {
        ball.vx += (Math.random() - 0.5) * 3;
        ball.vz += (Math.random() - 0.5) * 3;
      }
    }

    expect(strikes).toBeGreaterThan(8);
    expect(slides).toBeGreaterThan(40);
    expect(maxSpin).toBeGreaterThan(8);
    expect(goals + strikes).toBeGreaterThan(10);
  });
});
