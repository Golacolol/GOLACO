import type { InputIntent } from "../controls/InputIntent";
import type { Player } from "../players/Player";
import type { Ball } from "../ball/Ball";
import { choosePassTarget } from "./PassingAI";
import { isStriker } from "./AttackingDecision";
import { dist2 } from "../../core/math";
import { GOAL_WIDTH } from "../constants";

export function autoplayIntent(
  player: Player,
  teammates: Player[],
  opponents: Player[],
  ball: Ball,
  intent: InputIntent,
): void {
  const goalX = player.oppGoalX();
  if (player.hasBall) {
    const target = choosePassTarget(player, teammates, opponents, ball, goalX - player.x, 0, "short");
    const toGoal = dist2(player.x, player.z, goalX, 0);
    const nearestDef = opponents.reduce((m, o) => Math.min(m, player.distTo(o.x, o.z)), 40);
    const crowded = nearestDef < 4.2;
    if (toGoal < 22 && Math.abs(player.z) < GOAL_WIDTH + 8) {
      intent.shootHeld = true;
      intent.shootHold = isStriker(player) ? 0.92 : 0.72;
      intent.shoot = Math.random() < 0.04;
      intent.aimX = (Math.random() - 0.5) * 1.4;
      intent.aimY = 0.35 + Math.random() * 0.4;
      intent.moveX = Math.sign(goalX - player.x);
      intent.moveZ = Math.sign(-player.z) * 0.2;
      return;
    }
    const passChance = crowded ? 0.11 : 0.028;
    if (target && (Math.random() < passChance || (crowded && player.energy.value < 0.55))) {
      const long = crowded && nearestDef < 3 && Math.random() < 0.42;
      const through = !long && crowded && Math.random() < 0.22;
      intent.pass = !through;
      intent.through = through;
      intent.passHold = long ? 0.8 : through ? 0.4 : 0.28 + Math.min(0.5, player.distTo(target.x, target.z) / 40);
      intent.aimX = (target.x - player.x) / 30;
      intent.aimY = 0;
      intent.moveX = target.x - player.x;
      intent.moveZ = target.z - player.z;
      return;
    }
    intent.moveX = goalX - player.x;
    intent.moveZ = (target ? target.z : 0) - player.z;
    intent.sprint = toGoal > 28;
    return;
  }
  intent.moveX = ball.x - player.x;
  intent.moveZ = ball.z - player.z;
  intent.sprint = player.distTo(ball.x, ball.z) > 6;
}
