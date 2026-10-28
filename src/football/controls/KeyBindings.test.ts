import { describe, expect, it } from "vitest";
import { codeLabel, controlsLegend, DEFAULT_KEY_BINDINGS, mergeKeyBindings } from "./KeyBindings";

describe("key bindings", () => {
  it("fills missing keys from the defaults", () => {
    const merged = mergeKeyBindings({ pass: "KeyM" });
    expect(merged.pass).toBe("KeyM");
    expect(merged.shoot).toBe(DEFAULT_KEY_BINDINGS.shoot);
    expect(merged.homePortraits).toBe(DEFAULT_KEY_BINDINGS.homePortraits);
    expect(merged.awayPortraits).toBe(DEFAULT_KEY_BINDINGS.awayPortraits);
  });

  it("defaults home/away portrait toggles to O and P", () => {
    expect(DEFAULT_KEY_BINDINGS.homePortraits).toBe("KeyO");
    expect(DEFAULT_KEY_BINDINGS.awayPortraits).toBe("KeyP");
  });

  it("defaults home/away 3D player visibility toggles to U and I", () => {
    expect(DEFAULT_KEY_BINDINGS.homePlayers).toBe("KeyU");
    expect(DEFAULT_KEY_BINDINGS.awayPlayers).toBe("KeyI");
    expect(mergeKeyBindings({}).homePlayers).toBe("KeyU");
    expect(mergeKeyBindings({}).awayPlayers).toBe("KeyI");
  });

  it("defaults second presser to B", () => {
    expect(DEFAULT_KEY_BINDINGS.secondaryPress).toBe("KeyB");
  });

  it("defaults chip to F", () => {
    expect(DEFAULT_KEY_BINDINGS.chip).toBe("KeyF");
    expect(controlsLegend(DEFAULT_KEY_BINDINGS)).toContain("F chip");
  });

  it("prints a compact legend of the current map", () => {
    expect(codeLabel("KeyW")).toBe("W");
    expect(codeLabel("Space")).toBe("Space");
    const text = controlsLegend(DEFAULT_KEY_BINDINGS);
    expect(text).toContain("WASD move");
    expect(text).toContain("Space pass");
    expect(text).toContain("X shoot");
  });
});
