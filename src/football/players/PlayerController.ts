import type { InputIntent } from "../controls/InputIntent";
import { movePlayer } from "./PlayerMovement";
import type { Player } from "./Player";

export function controlPlayer(
  player: Player,
  intent: InputIntent,
  dt: number,
  pressure = 0,
  extras?: { accelMul?: number; speedMul?: number; turnMul?: number; drainMul?: number; grip?: number },
): void {
  movePlayer(player, dt, intent.moveX, intent.moveZ, intent.sprint || intent.boost, intent.jockey, {
    hasBall: player.hasBall,
    pressure,
    boost: intent.boost,
    ...extras,
  });
}
