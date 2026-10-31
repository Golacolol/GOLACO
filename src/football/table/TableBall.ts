import type { TableDims } from "./TableLayouts";

export interface TableBallState {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  radius: number;
}

export function createTableBall(dims: TableDims): TableBallState {
  return {
    x: 0,
    z: 0,
    y: dims.playY + dims.ballRadius,
    vx: 0,
    vz: 0,
    radius: dims.ballRadius,
  };
}

export function serveTableBall(ball: TableBallState, dims: TableDims, toward: "home" | "away"): void {
  ball.x = 0;
  ball.z = (Math.random() - 0.5) * dims.width * 0.25;
  ball.y = dims.playY + dims.ballRadius;
  const dir = toward === "home" ? -1 : 1;
  ball.vx = dir * (2.6 + Math.random() * 1.6);
  ball.vz = (Math.random() - 0.5) * 1.8;
}

export function resetTableBallIdle(ball: TableBallState, dims: TableDims): void {
  ball.x = 0;
  ball.z = 0;
  ball.y = dims.playY + dims.ballRadius;
  ball.vx = 0;
  ball.vz = 0;
}

/**
 * Animate a scored ball into the black goal mouth (past the goal line, drop into abyss).
 * `scoredBy` is the side that scored (home attacks +x).
 */
export function stepGoalSink(
  ball: TableBallState,
  dims: TableDims,
  scoredBy: "home" | "away",
  dt: number,
): void {
  const sign = scoredBy === "home" ? 1 : -1;
  const mouthX = sign * (dims.length / 2);
  const abyssX = sign * (dims.length / 2 + dims.goalDepth * 0.92);
  // Keep driving past the line into the dark box.
  if ((ball.x - mouthX) * sign < dims.goalDepth * 0.15) {
    ball.vx = sign * Math.max(Math.abs(ball.vx), 4.2);
  } else {
    ball.vx = sign * Math.max(Math.abs(ball.vx) * 0.92, 2.4);
  }
  ball.x += ball.vx * dt;
  if ((ball.x - abyssX) * sign > 0) ball.x = abyssX;
  ball.vz *= Math.exp(-2.8 * dt);
  ball.z = Math.max(-dims.goalWidth * 0.42, Math.min(dims.goalWidth * 0.42, ball.z));
  // Drop into the abyss once inside the mouth.
  const depth = Math.max(0, (ball.x - mouthX) * sign);
  const drop = Math.min(1, depth / Math.max(0.12, dims.goalDepth * 0.55));
  ball.y = dims.playY + dims.ballRadius * (1 - drop) - drop * 0.22;
}
