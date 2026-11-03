import { describe, expect, it, beforeEach } from "vitest";
import { SaveManager, MITEAM_TEAM_ID, MITEAM_DEFAULT_CLUB_NAME } from "../../core/SaveManager";
import {
  applyMiTeamToDb,
  deleteMiTeam,
  ensureMiTeamSave,
  miteamFillOrder,
  nextEmptySlot,
  restartMiTeam,
  setMiTeamBadge,
  setMiTeamRoster,
  xiComplete,
} from "./MiTeam";
import type { GameDatabase } from "../../core/Database";
import type { PlayerRecord, TeamRecord } from "../../data/schema";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, String(v));
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, configurable: true });

function stubDb(): GameDatabase {
  const players = new Map<string, PlayerRecord>();
  const teams = new Map<string, TeamRecord>();
  const addPlayer = (id: string, pos: PlayerRecord["primaryPosition"] = "CM") => {
    players.set(id, {
      id,
      name: id,
      displayName: id,
      primaryPosition: pos,
      secondaryPositions: [],
      overall: 75,
      pace: 70,
      acceleration: 70,
      passing: 70,
      longPassing: 70,
      vision: 70,
      control: 70,
      dribbling: 70,
      shooting: 70,
      finishing: 70,
      shotPower: 70,
      longShots: 70,
      defending: 70,
      strength: 70,
      stamina: 70,
      composure: 70,
    });
  };
  for (let i = 1; i <= 18; i++) addPlayer(`p${i}`, i === 1 ? "GK" : "CM");
  const memberships: GameDatabase["memberships"] = [];
  const lineups: GameDatabase["lineups"] = [];
  const db = {
    players,
    teams,
    memberships,
    lineups,
    userTeamId: "plymouth_argyle_current",
    getSquad(teamId: string) {
      return memberships
        .filter((m) => m.teamId === teamId)
        .map((m) => {
          const player = players.get(m.playerId)!;
          return {
            player,
            membership: m,
            attrs: player,
            overall: player.overall ?? 70,
            shirtNumber: m.shirtNumber,
          };
        });
    },
  } as unknown as GameDatabase;
  return db;
}

describe("MiTeam save / shell", () => {
  let save: SaveManager;
  let db: GameDatabase;

  beforeEach(() => {
    localStorage.clear();
    save = new SaveManager();
    db = stubDb();
  });

  it("creates default save and prefers GK first in fill order", () => {
    const mt = ensureMiTeamSave(save);
    expect(mt.clubName).toBe(MITEAM_DEFAULT_CLUB_NAME);
    expect(mt.roster).toEqual([]);
    expect(miteamFillOrder()[0]).toBe("GK");
    expect(nextEmptySlot([])).toBe("GK");
  });

  it("applies roster into DB memberships and lineup", () => {
    ensureMiTeamSave(save);
    const slots = miteamFillOrder().slice(0, 11);
    setMiTeamRoster(
      save,
      db,
      slots.map((slot, i) => ({ playerId: `p${i + 1}`, slot, shirtNumber: i + 1 })),
    );
    expect(xiComplete(save.data.miteam!.roster)).toBe(true);
    expect(db.teams.has(MITEAM_TEAM_ID)).toBe(true);
    expect(db.memberships.filter((m) => m.teamId === MITEAM_TEAM_ID)).toHaveLength(11);
    const lineup = db.lineups.find((l) => l.teamId === MITEAM_TEAM_ID);
    expect(lineup?.starters).toHaveLength(11);
  });

  it("restart clears roster but keeps club name and badge; delete removes shell", () => {
    ensureMiTeamSave(save);
    save.data.miteam!.clubName = "Silver City";
    setMiTeamBadge(save, db, "/assets/crests/barcelona.png");
    setMiTeamRoster(save, db, [{ playerId: "p1", slot: "GK", shirtNumber: 1 }]);
    restartMiTeam(save);
    applyMiTeamToDb(db, save);
    expect(save.data.miteam!.clubName).toBe("Silver City");
    expect(save.data.miteam!.badgeAsset).toBe("/assets/crests/barcelona.png");
    expect(save.data.miteam!.roster).toEqual([]);
    expect(db.teams.get(MITEAM_TEAM_ID)?.badgeAsset).toBe("/assets/crests/barcelona.png");
    deleteMiTeam(save, db);
    expect(save.data.miteam).toBeNull();
    expect(db.teams.has(MITEAM_TEAM_ID)).toBe(false);
  });

  it("round-trips miteam through SaveManager load", () => {
    ensureMiTeamSave(save);
    setMiTeamRoster(save, db, [{ playerId: "p1", slot: "GK", shirtNumber: 1 }]);
    save.save();
    const again = new SaveManager();
    expect(again.data.miteam?.roster).toHaveLength(1);
    expect(again.data.miteam?.roster[0]?.slot).toBe("GK");
  });
});
