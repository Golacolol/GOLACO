import type { LineupRecord, TeamKit, TeamRecord } from "../../data/schema";
import type { SquadPlayer } from "../../core/Database";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import { getFormation, remapPlayersToFormation } from "./Formation";
import { applyKickOffShape } from "../ai/KickOff";
import { Player, type Side } from "../players/Player";
import { heightScaleFromCm } from "../players/PlayerStats";

export class Team {
  readonly record: TeamRecord;
  readonly lineup: LineupRecord;
  readonly side: Side;
  /** True after half-time — this team has swapped pitch ends. */
  endsFlipped = false;
  readonly players: Player[] = [];
  readonly kit: TeamKit;
  bench: SquadPlayer[] = [];
  roster: SquadPlayer[] = [];
  subsUsed = 0;
  static readonly MAX_SUBS = 5;

  constructor(record: TeamRecord, lineup: LineupRecord, side: Side, squad: SquadPlayer[], fullSquad: SquadPlayer[] = [], kit?: TeamKit) {
    this.record = record;
    this.lineup = lineup;
    this.side = side;
    this.kit = kit ?? record.defaultKit;
    this.roster = fullSquad.length ? fullSquad : squad;
    const formation = getFormation(lineup.formation);
    lineup.starters.forEach((slot, i) => {
      const sp = squad[i] ?? squad.find((s) => s.player.id === slot.playerId);
      if (!sp) return;
      const form = formation.find((f) => f.id === slot.slot) ?? formation[i];
      const p = this.makePlayer(sp, slot.slot);
      this.placeAnchor(p, form.x + (slot.offsetX ?? 0), form.z + (slot.offsetZ ?? 0));
      p.x = p.anchorX;
      p.z = p.anchorZ;
      this.players.push(p);
    });
    const onIds = new Set(this.players.map((p) => p.id));
    this.bench = this.roster.filter((s) => !onIds.has(s.player.id));
  }

  makePlayer(sp: SquadPlayer, slot: string): Player {
    const appearance = { ...sp.player.appearance };
    if (appearance.heightScale == null && sp.player.heightCm) {
      appearance.heightScale = heightScaleFromCm(sp.player.heightCm);
    }
    return new Player({
      id: sp.player.id,
      name: sp.player.name,
      displayName: sp.player.displayName,
      shirtNumber: sp.shirtNumber,
      position: sp.player.primaryPosition,
      slot,
      side: this.side,
      attrs: sp.attrs,
      overall: sp.overall,
      appearance,
    });
  }

  substitute(offId: string, onId: string): { off: Player; on: Player } | null {
    if (this.subsUsed >= Team.MAX_SUBS) return null;
    const offIdx = this.players.findIndex((p) => p.id === offId);
    const incoming = this.bench.find((s) => s.player.id === onId);
    if (offIdx < 0 || !incoming) return null;
    const off = this.players[offIdx];
    if (off.isGK !== (incoming.player.primaryPosition === "GK")) return null;
    const next = this.makePlayer(incoming, off.slot);
    next.attackSign = off.attackSign;
    next.x = off.x;
    next.z = off.z;
    next.anchorX = off.anchorX;
    next.anchorZ = off.anchorZ;
    next.facing = off.facing;
    this.players[offIdx] = next;
    this.bench = this.bench.filter((s) => s.player.id !== onId);
    const offRecord = this.roster.find((s) => s.player.id === offId);
    if (offRecord) this.bench.push(offRecord);
    this.subsUsed += 1;
    this.lineup.starters = this.players.map((p) => ({ playerId: p.id, slot: p.slot }));
    return { off, on: next };
  }

  applyFormation(name: string): void {
    const from = this.lineup.formation;
    this.lineup.formation = name;
    const form = getFormation(name);
    const mapped = remapPlayersToFormation(
      this.players.map((p) => ({ id: p.id, slot: p.slot, isGK: p.isGK })),
      name,
      from,
    );
    for (const row of mapped) {
      const p = this.players.find((x) => x.id === row.id);
      const slot = form.find((f) => f.id === row.slot);
      if (!p || !slot) continue;
      p.slot = row.slot;
      this.placeAnchor(p, slot.x, slot.z);
    }
    this.lineup.starters = this.players.map((p) => ({ playerId: p.id, slot: p.slot }));
  }

  placeAnchor(player: Player, nx: number, nz: number): void {
    const dir = this.endsFlipped ? (this.side === "home" ? -1 : 1) : this.side === "home" ? 1 : -1;
    const xFromOwn = (nx - 0.5) * HALF_LENGTH * 2;
    player.anchorX = dir * xFromOwn;
    // Full pitch width (nz is ±0.5-ish formation lateral); do not half-squeeze shape.
    player.anchorZ = dir * nz * HALF_WIDTH * 2;
    player.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    player.attackSign = dir;
  }

  /** Swap this team's pitch end (called for both teams at half-time). */
  flipEnds(): void {
    this.endsFlipped = !this.endsFlipped;
    for (const p of this.players) p.attackSign = -p.attackSign;
  }

  resetKickoff(kicking: boolean): void {
    const formation = getFormation(this.lineup.formation);
    this.players.forEach((p, i) => {
      const form = formation.find((f) => f.id === p.slot) ?? formation[i];
      const starter = this.lineup.starters.find((s) => s.playerId === p.id);
      this.placeAnchor(p, form.x + (starter?.offsetX ?? 0), form.z + (starter?.offsetZ ?? 0));
      p.x = p.anchorX;
      p.z = p.anchorZ;
      p.vx = 0;
      p.vz = 0;
      p.hasBall = false;
    });
    applyKickOffShape(this.players, kicking);
  }

  gk(): Player {
    return this.players.find((p) => p.isGK) ?? this.players[0];
  }
}
