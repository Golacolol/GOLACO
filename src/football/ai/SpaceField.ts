import { clamp } from "../../core/math";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import type { Player } from "../players/Player";

export interface SpaceSample {
  x: number;
  z: number;
  dx: number;
  dz: number;
  score: number;
  kind: "forward" | "diagonal" | "lateral" | "back";
}

const DIRS: { dx: number; dz: number; kind: SpaceSample["kind"] }[] = [
  { dx: 1, dz: 0, kind: "forward" },
  { dx: 0.82, dz: 0.57, kind: "diagonal" },
  { dx: 0.82, dz: -0.57, kind: "diagonal" },
  { dx: 0.2, dz: 0.98, kind: "lateral" },
  { dx: 0.2, dz: -0.98, kind: "lateral" },
  { dx: 0.5, dz: 0.86, kind: "diagonal" },
  { dx: 0.5, dz: -0.86, kind: "diagonal" },
  { dx: -0.55, dz: 0.35, kind: "back" },
  { dx: -0.55, dz: -0.35, kind: "back" },
];

export function spaceScoreAt(
  x: number,
  z: number,
  carrier: Player,
  opponents: Player[],
  teammates: Player[],
): number {
  const goalX = carrier.oppGoalX();
  const fwd = (x - carrier.x) * carrier.attackSign;
  let nearest = 40;
  let density = 0;
  for (const o of opponents) {
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < nearest) nearest = d;
    if (d < 8) density += (8 - d) / 8;
  }
  let mateCrowd = 0;
  for (const t of teammates) {
    if (t.id === carrier.id) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < 4.5) mateCrowd += (4.5 - d) / 4.5;
  }
  const sideline = Math.max(0, Math.abs(z) - (HALF_WIDTH - 6)) / 4;
  const corner = Math.max(0, Math.abs(z) - 16) / 8 * (Math.abs(x) > HALF_LENGTH - 16 ? 1 : 0.45);
  const towardGoal = 1 - Math.min(1, Math.abs(goalX - x) / 80);
  const width = clamp(Math.abs(z) / 22, 0, 1) * 0.12;
  // Reward cutting inside when already wide.
  const cutInside =
    Math.abs(carrier.z) > 12 && Math.abs(z) < Math.abs(carrier.z) - 1.5 ? 0.55 : 0;
  return (
    nearest * 0.22 +
    fwd * 0.08 +
    towardGoal * 1.4 +
    width +
    cutInside -
    density * 1.35 -
    mateCrowd * 0.7 -
    sideline * 1.55 -
    corner * 2.4
  );
}

export function bestAvailableSpace(
  carrier: Player,
  opponents: Player[],
  teammates: Player[],
  distances = [5.5, 11],
): SpaceSample {
  const fwdSign = carrier.attackSign;
  let best: SpaceSample = {
    x: carrier.x + fwdSign * 8,
    z: carrier.z,
    dx: fwdSign,
    dz: 0,
    score: -999,
    kind: "forward",
  };
  for (const dist of distances) {
    for (const dir of DIRS) {
      const dx = dir.dx * fwdSign;
      const dz = dir.dz;
      const x = clamp(carrier.x + dx * dist, -HALF_LENGTH + 2, HALF_LENGTH - 2);
      const z = clamp(carrier.z + dz * dist, -HALF_WIDTH + 1.5, HALF_WIDTH - 1.5);
      const score = spaceScoreAt(x, z, carrier, opponents, teammates);
      if (score > best.score) best = { x, z, dx, dz, score, kind: dir.kind };
    }
  }
  return best;
}

export function forwardPathCongested(carrier: Player, opponents: Player[]): boolean {
  const fwd = carrier.attackSign;
  let hits = 0;
  for (const o of opponents) {
    const dx = (o.x - carrier.x) * fwd;
    const dz = Math.abs(o.z - carrier.z);
    if (dx > 0 && dx < 10 && dz < 3.2) hits += 1;
  }
  return hits >= 2;
}

/** v0.4 baseline: carriers were steered toward the goal, not sampled space. */
export function v04GoalwardTarget(carrier: Player): { x: number; z: number } {
  const dir = carrier.attackSign;
  return { x: carrier.x + dir * 14, z: carrier.z * 0.72 };
}
