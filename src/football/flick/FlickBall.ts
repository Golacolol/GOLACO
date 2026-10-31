import { FLICK_PITCH, type FlickPitchDims } from "./FlickPitch";

export interface FlickBallState {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  radius: number;
}

export function createFlickBall(dims: FlickPitchDims = FLICK_PITCH): FlickBallState {
  return {
    x: 0,
    z: 0,
    y: dims.playY + dims.ballRadius,
    vx: 0,
    vz: 0,
    radius: dims.ballRadius,
  };
}

export function resetFlickBall(ball: FlickBallState, dims: FlickPitchDims = FLICK_PITCH): void {
  ball.x = 0;
  ball.z = 0;
  ball.y = dims.playY + dims.ballRadius;
  ball.vx = 0;
  ball.vz = 0;
}

export function ballSpeed(ball: FlickBallState): number {
  return Math.hypot(ball.vx, ball.vz);
}

/** Goal if ball centre fully past goal line within goal mouth. */
export function checkFlickGoal(
  ball: FlickBallState,
  dims: FlickPitchDims = FLICK_PITCH,
): "home" | "away" | null {
  const hl = dims.length / 2;
  const halfG = dims.goalWidth / 2;
  if (Math.abs(ball.z) > halfG) return null;
  if (ball.x - ball.radius > hl) return "home";
  if (ball.x + ball.radius < -hl) return "away";
  return null;
}
