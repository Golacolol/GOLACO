/**
 * Pass-receive steering — single integration per frame, arrival-time sprint,
 * natural pace caps. Fixes double movePlayer stacking that made receivers
 * explode toward the ball.
 */
import { clamp } from "../../core/math";
import type { Ball } from "../ball/Ball";
import type { Player } from "../players/Player";
import { topSpeedFromPace } from "../players/PlayerMovement";

export interface ReceiveAim {
  x: number;
  z: number;
  /** Sprint only when a jog would arrive late relative to the ball. */
  sprint: boolean;
  /** Soft cap so receive runs never exceed natural top speed. */
  speedMul: number;
  accelMul: number;
}

/**
 * Lead the intercept a short way along the ball path for ground passes.
 * Longer lead on faster balls; keep it modest so players don't overshoot.
 */
export function receiveLeadSeconds(ball: Ball): number {
  const ground = Math.hypot(ball.vx, ball.vz);
  // Longer lead on fast ground / through so receivers face the ball at contact.
  return clamp(0.22 + ground * 0.016, 0.18, 0.55);
}

export function receiveAimPoint(ball: Ball, leadSec?: number): { x: number; z: number } {
  const lead = leadSec ?? receiveLeadSeconds(ball);
  return {
    x: ball.x + ball.vx * lead,
    z: ball.z + ball.vz * lead,
  };
}

/**
 * Decide sprint vs jog from arrival timing — never force sprint on every receive.
 */
export function planReceiveRun(
  receiver: Player,
  ball: Ball,
  opts?: { speedMul?: number },
): ReceiveAim {
  const aim = receiveAimPoint(ball);
  const dist = Math.hypot(aim.x - receiver.x, aim.z - receiver.z);
  const ground = Math.hypot(ball.vx, ball.vz);
  const ballEta = ground > 0.45 ? dist / ground : dist / 7;
  const baseMul = opts?.speedMul ?? 1;
  const jog = topSpeedFromPace(receiver.attrs.pace, false, false) * baseMul * 0.92;
  const timeAtJog = dist / Math.max(jog, 1.2);
  // Late to the meet → sprint; otherwise jog / stride into the ball.
  const late = timeAtJog > ballEta * 0.92 && dist > 2.6;
  const far = dist > 14 && ground > 6;
  // Dying / underhit release: FBs were jogging while attackers sprinted onto the loose ball.
  const stranded = ground < 3.2 && dist > 3.2;
  return {
    x: aim.x,
    z: aim.z,
    sprint: late || far || stranded,
    // Cap below open-play chase bursts — receive must look human.
    // Stranded outlets get a touch more urgency so restarts actually stick.
    speedMul: baseMul * (stranded ? 1.05 : 0.96),
    accelMul: stranded ? 1.18 : 1.05,
  };
}

/** True when aerial / lofted logic should own the run (landing prediction). */
export function receiveIsAerialOwned(ball: Ball, incomingAerial: boolean, _hasLanding = false): boolean {
  // Ground passes always set a landing marker for the camera — that must NOT disable steerPassReceiver.
  void _hasLanding;
  return incomingAerial || ball.y > 1.12;
}
