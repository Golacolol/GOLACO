import type { Player } from "../players/Player";
import { supportTarget } from "./SupportAI";
import { blendTowardSupportSpot } from "./SupportSpotCalculator";
import { pitchClamp } from "../pitch/PitchZones";
import { HALF_LENGTH } from "../constants";
import type { MatchPhase } from "./MatchBrain";
import type { PlayStyleProfile } from "./PlayStyle";

export function attackingSupport(
  player: Player,
  ballX: number,
  ballZ: number,
  hasBall: boolean,
  carrier: Player | null = null,
  teammates: Player[] = [],
  opponents: Player[] = [],
  phase?: MatchPhase,
  playStyle?: PlayStyleProfile,
): { x: number; z: number } {
  if (hasBall) {
    if (player.runTargetX !== 0 || player.runTargetZ !== 0) {
      return pitchClamp(player.runTargetX, player.runTargetZ, 2.2);
    }
    const dir = player.attackSign;
    // Don't drive into the byline — recycle or cut inside near the end.
    const room = HALF_LENGTH - 2.5 - Math.abs(player.x);
    if (room < 4) {
      return pitchClamp(player.x - dir * 3.5, player.z * 0.55, 2.5);
    }
    return pitchClamp(player.x + dir * Math.min(8, room), player.z * 0.92, 2.2);
  }
  const s = supportTarget(player, ballX, ballZ, carrier, teammates, opponents, phase, playStyle);
  if (carrier) {
    const progress = (carrier.x * carrier.attackSign + HALF_LENGTH) / (HALF_LENGTH * 2);
    const blended = blendTowardSupportSpot(player, carrier, opponents, s.x, s.z, {
      buildup: progress < 0.55,
      blend: 0.38,
    });
    return pitchClamp(blended.x, blended.z, 2.2);
  }
  return pitchClamp(s.x, s.z, 2.2);
}
