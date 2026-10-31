import type { Player } from "../players/Player";
import { supportTarget } from "./SupportAI";
import { blendTowardSupportSpot } from "./SupportSpotCalculator";
import { pitchClamp } from "../pitch/PitchZones";
import { HALF_LENGTH } from "../constants";
import { classifyFootballRole, type MatchPhase } from "./MatchBrain";
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
    // Inside the attacking box: drive toward goal centre, not a side-to-side shuffle.
    if (room < 18 && Math.abs(player.z) < 20) {
      const goalX = player.oppGoalX();
      return pitchClamp(goalX - dir * 2.4, player.z * 0.35, 2.2);
    }
    if (room < 4) {
      return pitchClamp(player.x - dir * 3.5, player.z * 0.55, 2.5);
    }
    return pitchClamp(player.x + dir * Math.min(8, room), player.z * 0.92, 2.2);
  }
  const s = supportTarget(player, ballX, ballZ, carrier, teammates, opponents, phase, playStyle);
  if (carrier) {
    const foot = classifyFootballRole(player);
    // Support-spot grid is midfield-centric — don't pull FB/W inside off their channel.
    if (foot === "FB" || foot === "W" || foot === "WM") {
      return pitchClamp(s.x, s.z, 2.2);
    }
    const progress = (carrier.x * carrier.attackSign + HALF_LENGTH) / (HALF_LENGTH * 2);
    const blended = blendTowardSupportSpot(player, carrier, opponents, s.x, s.z, {
      buildup: progress < 0.55,
      blend: progress < 0.55 ? 0.48 : 0.42,
    });
    return pitchClamp(blended.x, blended.z, 2.2);
  }
  return pitchClamp(s.x, s.z, 2.2);
}
