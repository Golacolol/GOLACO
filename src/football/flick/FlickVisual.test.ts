import { describe, expect, it } from "vitest";
import { PITCH_LENGTH, PITCH_WIDTH } from "../constants";
import { FLICK_PITCH } from "./FlickPitch";
import { FlickVisual } from "./FlickVisual";

describe("FlickVisual on REAL pitch", () => {
  it("uses REAL pitch footprint for flick play", () => {
    expect(FLICK_PITCH.length).toBe(PITCH_LENGTH);
    expect(FLICK_PITCH.width).toBe(PITCH_WIDTH);
    expect(FLICK_PITCH.playY).toBe(0);
  });

  it("does not build a private tabletop board — Stadium hosts the pitch", () => {
    const visual = new FlickVisual(0x034694, 0xffffff);
    expect(visual.hasPrivatePitchBoard()).toBe(false);
    // Only pieces / aim overlays (ball + aim line + aim ring at construct).
    expect(visual.group.children.length).toBe(3);
    expect(visual.group.getObjectByName("flickBall")).toBeTruthy();
    visual.dispose();
  });

  it("builds Subbuteo bases curved-side down with a flat top shelf", () => {
    const visual = new FlickVisual(0x034694, 0xffffff);
    visual.ensureFigures([
      {
        id: "home_ST_0",
        side: "home",
        isGK: false,
        slot: "ST",
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        facing: 0,
        radius: FLICK_PITCH.figureRadius,
        leanX: 0,
        leanZ: 0,
        settled: true,
      },
    ]);
    const base = visual.group.getObjectByName("flickBase") as {
      rotation: { x: number };
      position: { y: number };
      material: { color: { getHex: () => number } };
    } | undefined;
    expect(base).toBeTruthy();
    expect(Math.abs(base!.rotation.x - Math.PI)).toBeLessThan(1e-6);
    // Sphere centre sits one radius above the pitch so the curve touches playY.
    expect(base!.position.y).toBeCloseTo(FLICK_PITCH.playY + FLICK_PITCH.figureRadius, 5);
    // Outfield shell is a darkened team colour — not flat charcoal.
    expect(base!.material.color.getHex()).toBe(FlickVisual.shade(0x034694, 0.42));
    expect(visual.group.getObjectByName("flickBaseRim")).toBeTruthy();
    expect(FLICK_PITCH.ballRadius).toBeGreaterThan(0.5);
    visual.dispose();
  });
});
