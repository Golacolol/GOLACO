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
  ball.vx = dir * (1.8 + Math.random() * 1.2);
  ball.vz = (Math.random() - 0.5) * 1.4;
}

export function resetTableBallIdle(ball: TableBallState, dims: TableDims): void {
  ball.x = 0;
  ball.z = 0;
  ball.y = dims.playY + dims.ballRadius;
  ball.vx = 0;
  ball.vz = 0;
}
