import * as THREE from "three";
import type { Match } from "../Match";
import type { Player } from "../players/Player";
import type { Team } from "../teams/Team";
import { playerFormationRole } from "../teams/Formation";

export type UnitLineRole = "DEF" | "MID" | "FWD";

export interface UnitLineSideSettings {
  showDef: boolean;
  showMid: boolean;
  showAtt: boolean;
  defColor: string;
  midColor: string;
  attColor: string;
}

export interface UnitLineSettings {
  home: UnitLineSideSettings;
  away: UnitLineSideSettings;
}

type LineKey = `${"home" | "away"}-${UnitLineRole}`;

export class UnitLines {
  private group = new THREE.Group();
  private added = false;
  private lines = new Map<LineKey, THREE.Line>();

  update(scene: THREE.Scene, match: Match, settings: UnitLineSettings): void {
    const anyOn =
      settings.home.showDef ||
      settings.home.showMid ||
      settings.home.showAtt ||
      settings.away.showDef ||
      settings.away.showMid ||
      settings.away.showAtt;
    if (!anyOn) {
      this.group.visible = false;
      return;
    }
    if (!this.added) {
      this.group.name = "unitLines";
      scene.add(this.group);
      this.added = true;
    }
    this.group.visible = true;
    this.paintSide("home", match.home, settings.home);
    this.paintSide("away", match.away, settings.away);
  }

  dispose(scene: THREE.Scene): void {
    if (this.added) scene.remove(this.group);
    this.added = false;
    for (const line of this.lines.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.lines.clear();
    this.group.clear();
  }

  private paintSide(
    side: "home" | "away",
    team: Team,
    settings: UnitLineSideSettings,
  ): void {
    this.paintRole(side, "DEF", team, settings.showDef, settings.defColor);
    this.paintRole(side, "MID", team, settings.showMid, settings.midColor);
    this.paintRole(side, "FWD", team, settings.showAtt, settings.attColor);
  }

  private paintRole(
    side: "home" | "away",
    role: UnitLineRole,
    team: Team,
    show: boolean,
    color: string,
  ): void {
    const key: LineKey = `${side}-${role}`;
    const players = team.players
      .filter((p) => playerFormationRole(p.isGK, p.slot, team.lineup.formation) === role)
      .sort((a, b) => a.z - b.z);
    if (!show || players.length < 2) {
      const existing = this.lines.get(key);
      if (existing) existing.visible = false;
      return;
    }

    let line = this.lines.get(key);
    if (!line) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(11 * 3);
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({
        color: parseColor(color),
        transparent: true,
        opacity: 0.92,
        depthTest: true,
        depthWrite: false,
      });
      line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.renderOrder = 8;
      this.lines.set(key, line);
      this.group.add(line);
    }

    line.visible = true;
    (line.material as THREE.LineBasicMaterial).color.setHex(parseColor(color));
    const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const y = 0.18;
    const n = Math.min(players.length, 11);
    for (let i = 0; i < n; i++) {
      const p = players[i];
      const posed = posedPlayer(p);
      attr.setXYZ(i, posed.x, y, posed.z);
    }
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
    line.geometry.computeBoundingSphere();
  }
}

function posedPlayer(player: Player): { x: number; z: number } {
  // Prefer live mesh pose when available (matches on-pitch interpolation).
  if (player.mesh) {
    return { x: player.mesh.position.x, z: player.mesh.position.z };
  }
  return { x: player.x, z: player.z };
}

function parseColor(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 0xffffff;
  return Number.parseInt(m[1], 16);
}

export function defaultUnitLineSide(teamPrimary = "#007A3D"): UnitLineSideSettings {
  return {
    showDef: false,
    showMid: false,
    showAtt: false,
    defColor: "#3db7ff",
    midColor: "#ffd24a",
    attColor: teamPrimary.startsWith("#") ? teamPrimary : "#ff5a6a",
  };
}
