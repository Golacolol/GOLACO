import { clamp, stat01 } from "../../core/math";
import type { Player } from "../players/Player";
import { effectiveComposure } from "./PlayerStats";

export interface PressureSample {
  value: number;
  closest: number;
  count: number;
  frontal: number;
}

export function computePressure(carrier: Player, opponents: Player[]): PressureSample {
  let closest = 99;
  let count = 0;
  let frontal = 0;
  let weighted = 0;
  const faceX = Math.sin(carrier.facing);
  const faceZ = Math.cos(carrier.facing);
  for (const op of opponents) {
    if (op.isGK) continue;
    const dx = op.x - carrier.x;
    const dz = op.z - carrier.z;
    const d = Math.hypot(dx, dz);
    if (d < closest) closest = d;
    if (d > 8.5) continue;
    count += 1;
    const dirLen = d || 1;
    const inFront = (dx / dirLen) * faceX + (dz / dirLen) * faceZ;
    if (inFront > 0.15) frontal += 1;
    const prox = 1 - d / 8.5;
    const def = stat01(op.attrs.defensiveAwareness ?? op.attrs.defending);
    const pace = stat01(op.attrs.pace);
    const jockey = op.jockeying ? 1.28 : 1;
    weighted += prox * (0.55 + def * 0.3 + pace * 0.15) * jockey * (inFront > 0.1 ? 1.18 : 0.82);
  }
  const composure = stat01(effectiveComposure(carrier.attrs));
  const control = stat01(carrier.attrs.control);
  const speedTerm = clamp(carrier.speed / 11, 0, 1) * 0.18;
  const fatigue = (1 - carrier.energy.value) * 0.16;
  const raw = weighted * 0.42 + (count > 1 ? 0.12 * (count - 1) : 0) + speedTerm + fatigue;
  const resist = 0.55 + composure * 0.25 + control * 0.2;
  const value = clamp(raw / resist, 0, 1);
  return { value, closest, count, frontal };
}
