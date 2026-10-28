import { describe, expect, it } from "vitest";
import {
  kitFrontPanelBounds,
  kitPhotoContentBounds,
  kitSidePanelWidth,
  sampleKitBaseColor,
} from "./PlayerVisual";

function fillRect(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

describe("kit photo wrap", () => {
  it("keeps solid kit-colour side strips for the back number", () => {
    const side = kitSidePanelWidth(512);
    const front = kitFrontPanelBounds(512);
    // Front panel covers ~front torso only; sides are solid kit colour for the back.
    expect(side).toBeGreaterThan(120);
    expect(front.width).toBeGreaterThan(180);
    expect(front.width).toBeLessThan(260);
    expect(Math.abs(front.left - side)).toBeLessThanOrEqual(1);
    expect(front.right + side).toBeGreaterThanOrEqual(511);
  });

  it("crops matte black / empty margins from kit product shots", () => {
    const w = 32;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    for (let y = 8; y <= 23; y++) {
      for (let x = 8; x <= 23; x++) {
        const i = (y * w + x) * 4;
        data[i] = 0;
        data[i + 1] = 120;
        data[i + 2] = 60;
        data[i + 3] = 255;
      }
    }
    const box = kitPhotoContentBounds(data, w, h);
    expect(box.x).toBeGreaterThanOrEqual(6);
    expect(box.y).toBeGreaterThanOrEqual(6);
    expect(box.x + box.w).toBeLessThanOrEqual(26);
    expect(box.y + box.h).toBeLessThanOrEqual(26);
    expect(box.w).toBeLessThan(w);
    expect(box.h).toBeLessThan(h);
  });

  it("samples yellow fabric over a white schema fallback and pale logos", () => {
    const w = 48;
    const h = 48;
    const data = new Uint8ClampedArray(w * h * 4);
    // Black matte
    fillRect(data, w, 0, 0, w - 1, h - 1, 0, 0, 0);
    // Yellow jersey torso
    fillRect(data, w, 8, 6, 39, 41, 240, 200, 30);
    // Small white sponsor block (should not win)
    fillRect(data, w, 18, 18, 29, 24, 250, 250, 250);

    const hex = sampleKitBaseColor(data, w, h, "#ffffff");
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeGreaterThan(140);
    expect(b).toBeLessThan(80);
    expect(hex.toLowerCase()).not.toBe("#ffffff");
  });
});
