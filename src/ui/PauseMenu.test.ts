/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { PauseMenu } from "./PauseMenu";

describe("pause menu", () => {
  it("lists Formation instead of Substitutions", () => {
    const host = document.createElement("div");
    const menu = new PauseMenu(host);
    menu.render(null);
    const labels = [...menu.root.querySelectorAll(".menu-item")].map((el) => el.textContent);
    expect(labels).toContain("Formation");
    expect(labels).not.toContain("Substitutions");
    expect(menu.items.some((i) => i.action === "formation")).toBe(true);
    menu.hide();
    host.remove();
  });
});
