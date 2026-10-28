/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { CharacterSelect, formationToPitchPercent, separatePitchMarkers } from "./CharacterSelect";
import { kitMarkerHtml } from "./Portrait";
import type { SquadPlayer } from "../core/Database";
import type { PlayerRecord } from "../data/schema";

function makePlayer(id: string, name: string, pos: string, number: number): SquadPlayer {
  const player: PlayerRecord = {
    id,
    name,
    displayName: name,
    primaryPosition: pos as PlayerRecord["primaryPosition"],
    secondaryPositions: [],
    pace: 80,
    passing: 70,
    longPassing: 65,
    vision: 68,
    control: 72,
    dribbling: 74,
    shooting: 66,
    finishing: 64,
    shotPower: 70,
    longShots: 60,
    defending: 55,
    strength: 70,
    stamina: 78,
    composure: 70,
  };
  return {
    player,
    attrs: player,
    overall: 74,
    shirtNumber: number,
    membership: { playerId: id, teamId: "plymouth_argyle_current", shirtNumber: number, squadRole: "FIRST_TEAM" },
  };
}

function squad(): SquadPlayer[] {
  return [
    makePlayer("gk", "G. Keeper", "GK", 1),
    makePlayer("p1", "M. Cooper", "CM", 8),
    makePlayer("p2", "R. Hardie", "ST", 9),
  ];
}

describe("character select", () => {
  it("defaults to team select with a formation pitch", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    view.setSquad("Plymouth Argyle", squad(), "#007A3D", {
      formation: "4-2-3-1",
      roster: [...squad(), makePlayer("b1", "B. Ench", "CM", 14)],
      starterSlots: ["GK", "CAM", "ST"],
      team: {
        id: "plymouth_argyle_current",
        name: "Plymouth Argyle",
        abbreviation: "ARG",
        primaryColor: "#007A3D",
        secondaryColor: "#C5A572",
      },
    });
    view.render();
    expect(view.controlMode).toBe("TEAM");
    expect(view.root.querySelector(".team-pitch")).toBeTruthy();
    expect(view.root.querySelector(".team-bench")).toBeTruthy();
    expect(view.root.querySelector(".team-roster")).toBeTruthy();
    expect(view.root.querySelector(".team-roster-card")).toBeTruthy();
    const title = view.root.querySelector(".char-team-title");
    expect(title).toBeTruthy();
    expect(title?.querySelector(".char-team-crest")).toBeTruthy();
    expect(title?.textContent).toContain("Plymouth Argyle");
    expect(view.root.textContent).toContain("START AS TEAM");
    expect(view.root.textContent).toContain("SUBSTITUTES");
    expect(view.root.textContent).toContain("SQUAD");
  });

  it("shows the player card when player select is chosen", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    view.setSquad("Plymouth Argyle", squad());
    view.setControlMode("PLAYER");
    view.render();
    expect(view.root.querySelector(".char-stats")).toBeTruthy();
    expect(view.root.querySelector(".team-pitch")).toBeNull();
    expect(view.root.textContent).toContain("START AS PLAYER");
    expect(view.root.textContent).toContain("SIMULATE");
  });

  it("swaps a bench player onto a pitch slot", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    const starters = squad();
    const bench = makePlayer("b1", "B. Ench", "CM", 14);
    view.setSquad("Plymouth Argyle", starters, "#007A3D", {
      formation: "4-2-3-1",
      roster: [...starters, bench],
      starterSlots: ["GK", "CAM", "ST"],
    });
    const target = view.xi.find((x) => x.player.player.id === "p1") ?? view.xi[1];
    expect(target).toBeTruthy();
    const outId = target.player.player.id;
    view.placePlayerOnSlot("b1", target.slot);
    expect(view.xi.find((x) => x.slot === target.slot)?.player.player.id).toBe("b1");
    expect(view.bench.some((p) => p.player.id === outId)).toBe(true);
  });

  it("swaps two on-field starters between pitch slots", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    view.setSquad("Plymouth Argyle", squad(), "#007A3D", {
      formation: "4-2-3-1",
      starterSlots: ["GK", "CAM", "ST"],
    });
    const outfield = view.xi.filter((x) => x.slot !== "GK");
    expect(outfield.length).toBeGreaterThanOrEqual(2);
    const a = outfield[0];
    const b = outfield[1];
    const aId = a.player.player.id;
    const bId = b.player.player.id;
    const aSlot = a.slot;
    const bSlot = b.slot;
    view.placePlayerOnSlot(aId, bSlot);
    expect(view.xi.find((x) => x.slot === bSlot)?.player.player.id).toBe(aId);
    expect(view.xi.find((x) => x.slot === aSlot)?.player.player.id).toBe(bId);
  });

  it("stores slight pitch position nudges on the edited lineup", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    view.setSquad("Plymouth Argyle", squad(), "#007A3D", {
      formation: "4-2-3-1",
      starterSlots: ["GK", "CAM", "ST"],
    });
    const slot = view.xi.find((x) => x.player.player.id === "p1")?.slot ?? view.xi[1].slot;
    view.nudgeSlot(slot, 0.08, -0.1);
    const edited = view.getEditedLineup().starters.find((s) => s.slot === slot);
    expect(edited?.offsetX).toBeCloseTo(0.08);
    expect(edited?.offsetZ).toBeCloseTo(-0.1);
    view.nudgeSlot(slot, 0.5, 0.5);
    const clamped = view.getEditedLineup().starters.find((s) => s.slot === slot);
    expect(clamped?.offsetX).toBeLessThanOrEqual(0.28);
    expect(Math.abs(clamped?.offsetZ ?? 0)).toBeLessThanOrEqual(0.4);
  });

  it("selects a pitch player in the squad list for the formation card", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    view.setSquad("Plymouth Argyle", squad(), "#007A3D", {
      formation: "4-2-3-1",
      starterSlots: ["GK", "CAM", "ST"],
    });
    const target = view.xi.find((x) => x.player.player.id === "p2") ?? view.xi[view.xi.length - 1];
    view.selectPlayerId(target.player.player.id);
    view.render();
    expect(view.current().player.id).toBe(target.player.player.id);
    expect(view.root.querySelector(".roster-row.on .roster-num")?.textContent).toBe(String(target.player.shirtNumber));
    expect(view.root.querySelector(".team-roster-card .char-num")?.textContent).toBe(`#${target.player.shirtNumber}`);
    expect(view.root.querySelector(`.pitch-token.on[data-id="${target.player.player.id}"]`)).toBeTruthy();
  });

  it("spot practice keeps the formation panel with a highlighted Select Player button", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    view.setSquad("Plymouth Argyle", squad(), "#007A3D", {
      formation: "4-2-3-1",
      starterSlots: ["GK", "CAM", "ST"],
      purpose: "spot",
    });
    view.render();
    expect(view.purpose).toBe("spot");
    expect(view.controlMode).toBe("TEAM");
    expect(view.root.querySelector(".team-pitch")).toBeTruthy();
    expect(view.root.querySelector('[data-char="mode-player"]')?.classList.contains("on")).toBe(true);
    expect(view.root.querySelector('[data-char="mode-team"]')).toBeNull();
    expect(view.root.querySelector('[data-char="simulate"]')).toBeNull();
    const start = view.root.querySelector(".spot-select-btn") as HTMLButtonElement | null;
    expect(start?.classList.contains("on")).toBe(true);
    expect(start?.textContent).toMatch(/^SELECT /);
    expect(view.root.textContent).toContain("Select the taker");
    view.setControlMode("PLAYER");
    expect(view.controlMode).toBe("TEAM");
    const target = view.xi.find((x) => x.player.player.id === "p2") ?? view.xi[view.xi.length - 1];
    view.selectPlayerId(target.player.player.id);
    view.render();
    expect(view.root.querySelector(".pitch-token.on")?.getAttribute("data-id")).toBe(target.player.player.id);
    const surname = (target.player.player.displayName || target.player.player.name).split(" ").pop()!.toUpperCase();
    expect(view.root.querySelector(".spot-select-btn")?.textContent).toContain(surname);
  });

  it("keeps goalkeeper tokens above the pitch floor so kit text stays visible", () => {
    const { bottom: gk } = formationToPitchPercent(0.07, 0);
    const { bottom: mid } = formationToPitchPercent(0.5, 0);
    const { bottom: st } = formationToPitchPercent(0.82, 0);
    expect(gk).toBeGreaterThanOrEqual(1);
    expect(gk).toBeLessThan(3);
    expect(mid).toBeGreaterThan(38);
    expect(mid).toBeLessThan(st - 10);
    expect(st).toBeGreaterThan(64);
    expect(st).toBeLessThan(72);
  });

  it("centres the formation laterally on the pitch", () => {
    const { left: centre } = formationToPitchPercent(0.5, 0);
    const { left: leftWing } = formationToPitchPercent(0.5, -0.4);
    const { left: rightWing } = formationToPitchPercent(0.5, 0.4);
    expect(centre).toBeLessThan(50);
    expect(centre).toBeGreaterThan(47);
    expect(centre - leftWing).toBeCloseTo(rightWing - centre, 5);
  });

  it("orders the squad list GK through strikers, with substitutes after in the same order", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    const starters = [
      makePlayer("st", "S. Triker", "ST", 9),
      makePlayer("gk", "G. Keeper", "GK", 1),
      makePlayer("lb", "L. Back", "LB", 3),
      makePlayer("rb", "R. Back", "RB", 2),
      makePlayer("rcb", "R. Centre", "CB", 5),
      makePlayer("lcb", "L. Centre", "CB", 6),
      makePlayer("lm", "L. Mid", "LM", 11),
      makePlayer("rm", "R. Mid", "RM", 7),
      makePlayer("rcm", "R. Midfield", "CM", 8),
      makePlayer("lcm", "L. Midfield", "CM", 4),
      makePlayer("lst", "L. Striker", "ST", 10),
    ];
    const bench = [
      makePlayer("bst", "B. Striker", "ST", 19),
      makePlayer("bgk", "B. Keeper", "GK", 13),
      makePlayer("bcm", "B. Mid", "CM", 14),
      makePlayer("brb", "B. Back", "RB", 12),
    ];
    view.setSquad("Plymouth Argyle", starters, "#007A3D", {
      formation: "4-4-2",
      roster: [...starters, ...bench],
      starterSlots: ["RST", "GK", "LB", "RB", "RCB", "LCB", "LM", "RM", "RCM", "LCM", "LST"],
    });
    view.render();
    const rows = [...view.root.querySelectorAll(".roster-row")].map((row) => ({
      num: row.querySelector(".roster-num")?.textContent ?? "",
      role: row.querySelector(".roster-role")?.textContent ?? "",
    }));
    const xi = rows.filter((r) => r.role === "XI");
    const sub = rows.filter((r) => r.role === "SUB");
    expect(xi.length).toBe(11);
    expect(rows.slice(0, 11).every((r) => r.role === "XI")).toBe(true);
    expect(rows.slice(11).every((r) => r.role === "SUB")).toBe(true);
    expect(xi.map((r) => r.num)).toEqual(["1", "2", "5", "6", "3", "7", "8", "4", "11", "9", "10"]);
    expect(sub.map((r) => r.num)).toEqual(["13", "12", "14", "19"]);
  });

  it("shows pause formation nav with Apply/Back and hides player/team mode toggles", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new CharacterSelect(host);
    const starters = squad();
    view.setContext("pause", { subsRemaining: 3 });
    view.setSquad("Argyle", starters, "#007A3D", {
      formation: "4-2-3-1",
      roster: [...starters, makePlayer("b1", "B. Ench", "CM", 14)],
      starterSlots: ["GK", "CAM", "ST"],
    });
    view.render();
    expect(view.root.querySelector('[data-char="pause-apply"]')?.textContent).toBe("APPLY");
    expect(view.root.querySelector('[data-char="pause-apply"]')?.classList.contains("needs-apply")).toBe(false);
    expect(view.root.querySelector('[data-char="pause-back"]')?.textContent).toBe("BACK");
    expect(view.root.querySelector('[data-char="mode-player"]')).toBeNull();
    expect(view.root.textContent).toContain("3 substitutions remaining");
    expect(view.root.querySelector(".pitch-kit")).toBeNull();
    const badge = view.root.querySelector(".pitch-token .portrait-badge-kit") as HTMLElement | null;
    expect(badge?.querySelector(".num")?.textContent).toBeTruthy();
    expect(badge?.querySelector(".sur")?.textContent).toBeTruthy();
    expect(badge?.style.color.toLowerCase()).toBe("rgb(255, 255, 255)");
    expect(view.root.querySelector(".bench-card .portrait-badge-kit .sur")?.textContent).toBe("ENCH");
    expect(view.root.querySelector(".bench-meta")).toBeNull();
    view.setFormation("4-4-2");
    view.render();
    expect(view.root.querySelector('[data-char="pause-apply"]')?.classList.contains("needs-apply")).toBe(true);
    view.dispose();
    host.remove();
  });

  it("uses secondary colour for kit-marker text and captions PNG under the circle", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = new CharacterSelect(host);
    const withArt = makePlayer("p2", "R. Hardie", "ST", 9);
    withArt.player.appearance = { portraitAsset: "/portraits/hardie.png" };
    view.setSquad("Argyle", [makePlayer("gk", "G. Keeper", "GK", 1), withArt], "#007A3D", {
      formation: "4-2-3-1",
      secondaryColor: "#C5A572",
      starterSlots: ["GK", "ST"],
    });
    view.render();
    const gkBadge = view.root.querySelector(".pitch-token .portrait-badge-kit") as HTMLElement | null;
    expect(gkBadge?.style.background.toLowerCase()).toBe("rgb(31, 174, 91)");
    expect(gkBadge?.style.color.toLowerCase()).toBe("rgb(255, 255, 255)");
    expect(gkBadge?.querySelector(".num")?.textContent).toBe("1");
    const photo = view.root.querySelector('[data-id="p2"] .kit-marker-photo');
    expect(photo).toBeTruthy();
    expect(photo?.querySelector(".kit-marker-num")?.textContent).toBe("9");
    expect(photo?.querySelector(".kit-marker-name")?.textContent).toBe("HARDIE");
    const stBadge = photo?.querySelector(".portrait-badge-kit") as HTMLElement | null;
    // Photo markers keep caption in secondary; hidden fallback badge still carries team colours.
    expect(stBadge?.style.color.toLowerCase()).toBe("rgb(197, 165, 114)");
    view.dispose();
    host.remove();
  });

  it("separates overlapping outfield markers without moving the goalkeeper", () => {
    const gk = { id: "GK", left: 48.5, bottom: 5, pinned: true };
    const a = { id: "RCB", left: 52, bottom: 18 };
    const b = { id: "RB", left: 53, bottom: 19 };
    const out = separatePitchMarkers([gk, a, b]);
    expect(out.get("GK")).toEqual({ left: 48.5, bottom: 5 });
    const pa = out.get("RCB")!;
    const pb = out.get("RB")!;
    const nx = (pb.left - pa.left) / 12.5;
    const ny = (pb.bottom - pa.bottom) / 13.5;
    expect(Math.hypot(nx, ny)).toBeGreaterThanOrEqual(0.98);
  });

  it("opens a dedicated Kit Select panel with HOME/AWAY on the team-name line", () => {
    const host = document.createElement("div");
    const view = new CharacterSelect(host);
    const team = {
      id: "plymouth_argyle_current",
      name: "Plymouth Argyle",
      abbreviation: "ARG",
      teamType: "CURRENT_TEAM" as const,
      primaryColor: "#007A3D",
      secondaryColor: "#C5A572",
      defaultKit: { shirt: "#007A3D", shorts: "#ffffff", socks: "#007A3D" },
      awayKit: { shirt: "#ffffff", shorts: "#111111", socks: "#ffffff", numberColor: "#111111" },
      goalkeeperKit: { shirt: "#111111", shorts: "#111111", socks: "#111111" },
      defaultStadiumId: "home_park",
      defaultFormation: "4-2-3-1",
    };
    view.setContext("select");
    view.setSquad("Plymouth Argyle", squad(), "#007A3D", {
      formation: "4-2-3-1",
      roster: squad(),
      starterSlots: ["GK", "CAM", "ST"],
      team,
      opponentHomeKit: { shirt: "#0A8F4A", shorts: "#fff", socks: "#0A8F4A" },
      userIsAwaySide: true,
    });
    view.render();
    expect(view.root.querySelector(".char-panel-team")).toBeTruthy();
    expect(view.root.querySelector(".kit-name-chips")).toBeNull();
    expect(view.root.textContent).toContain("KIT SELECT");
    view.setControlMode("KIT");
    view.render();
    expect(view.controlMode).toBe("KIT");
    expect(view.root.querySelector(".char-panel-kit")).toBeTruthy();
    expect(view.root.querySelector(".team-pitch")).toBeNull();
    expect(view.root.querySelector(".kit-preview-host")).toBeTruthy();
    const title = view.root.querySelector(".char-team-title");
    expect(title?.querySelector(".kit-name-chips")).toBeTruthy();
    expect(title?.querySelector('[data-kit="home"]')).toBeTruthy();
    expect(title?.querySelector('[data-kit="away"]')).toBeTruthy();
    expect(view.root.querySelectorAll(".kit-card").length).toBe(3);
    view.setKitChoice("away");
    view.render();
    expect(view.selectedMatchKit()?.shirt.toLowerCase()).toBe("#ffffff");
    expect(view.root.querySelector('.kit-card.on[data-kit="away"]')).toBeTruthy();
    expect(view.root.querySelector(".kit-select-summary-choice")?.textContent).toBe("AWAY");
    view.setContext("pause");
    view.render();
    expect(view.root.querySelector(".char-panel-kit")).toBeNull();
    expect(view.root.textContent).not.toContain("KIT SELECT");
  });
});

describe("kitMarkerHtml", () => {
  it("puts number above surname on the badge fill", () => {
    const html = kitMarkerHtml({ name: "M. Cooper" }, 8, {
      primaryColor: "#007A3D",
      textColor: "#ffffff",
    });
    expect(html).toContain('class="num">8<');
    expect(html).toContain(">COOPER</span>");
    expect(html).not.toContain("kit-marker-photo");
  });
});
