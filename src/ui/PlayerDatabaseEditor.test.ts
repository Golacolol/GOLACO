/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { GameDatabase } from "../core/Database";
import { SaveManager } from "../core/SaveManager";
import { PlayerDatabaseEditor } from "./PlayerDatabaseEditor";

describe("PlayerDatabaseEditor", () => {
  it("opens a searchable player card from the database screen", async () => {
    const db = await GameDatabase.load(new SaveManager());
    const host = document.createElement("div");
    const view = new PlayerDatabaseEditor(host);
    await view.render(db);

    expect(view.root.querySelector("#player-db-search")).toBeTruthy();
    expect(view.root.querySelector(".player-db-results .player-db-row")).toBeTruthy();
    expect(view.root.querySelector(".player-db-card-host .player-card-shell")).toBeTruthy();
    expect(view.root.querySelector(".player-card-edit-panel")).toBeNull();
    expect(view.root.querySelector('[data-char="card-edit"]')?.textContent).toBe("EDIT");

    view.root.querySelector<HTMLElement>('[data-char="card-edit"]')?.click();
    expect(view.root.querySelector(".player-card-edit-panel")).toBeTruthy();
    expect(view.root.querySelector(".player-card-edit-section-title")?.textContent).toMatch(/Details/i);
    expect(view.root.querySelector('[data-char="card-view"]')?.textContent).toBe("CARD");
    expect(view.root.querySelector(".player-card-flip-label")?.textContent).toMatch(/OVR/);
  });

  it("filters the list and steps players with the card arrows", async () => {
    const db = await GameDatabase.load(new SaveManager());
    const host = document.createElement("div");
    const view = new PlayerDatabaseEditor(host);
    await view.render(db);

    const search = view.root.querySelector<HTMLInputElement>("#player-db-search")!;
    search.value = "gk";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    const rows = [...view.root.querySelectorAll<HTMLElement>(".player-db-row")];
    expect(rows.length).toBeGreaterThan(0);
    const firstId = rows[0]!.getAttribute("data-player-pick");
    expect(firstId).toBeTruthy();

    view.root.querySelector<HTMLElement>('[data-char="card-flip"][data-dir="next"]')?.click();
    const after = view.root.querySelector(".player-db-row.on")?.getAttribute("data-player-pick");
    if (rows.length > 1) expect(after).not.toBe(firstId);
    expect(view.root.querySelector(".player-card")).toBeTruthy();
  });
});
