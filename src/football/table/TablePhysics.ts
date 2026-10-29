import type { TableDims } from "./TableLayouts";
import type { TableBallState } from "./TableBall";
import type { TableRodState } from "./TableRod";
import { rodWorldMen } from "./TableRod";

export type TableGoalSide = "home" | "away" | null;

const FRICTION = 0.42;
const WALL_REST = 0.78;
const MAN_REST = 0.88;
const MAX_SPEED = 11;

export function stepTableBall(
  ball: TableBallState,
  dims: TableDims,
  rods: TableRodState[],
  dt: number,
): TableGoalSide {
  // Integrate
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  // Side walls (z)
  const zLim = dims.width / 2 - ball.radius - 0.04;
  if (ball.z > zLim) {
    ball.z = zLim;
    ball.vz = -Math.abs(ball.vz) * WALL_REST;
  } else if (ball.z < -zLim) {
    ball.z = -zLim;
    ball.vz = Math.abs(ball.vz) * WALL_REST;
  }

  // End walls / goals (x)
  const xLim = dims.length / 2 - ball.radius - 0.02;
  const halfGoal = dims.goalWidth / 2;
  if (ball.x > xLim) {
    if (Math.abs(ball.z) < halfGoal) return "home"; // home scored (ball entered away goal)
    ball.x = xLim;
    ball.vx = -Math.abs(ball.vx) * WALL_REST;
  } else if (ball.x < -xLim) {
    if (Math.abs(ball.z) < halfGoal) return "away"; // away scored
    ball.x = -xLim;
    ball.vx = Math.abs(ball.vx) * WALL_REST;
  }

  // Rod / man collisions
  for (const rod of rods) {
    collideRod(ball, rod, dims);
  }

  // Friction
  const damp = Math.exp(-FRICTION * dt);
  ball.vx *= damp;
  ball.vz *= damp;

  const sp = Math.hypot(ball.vx, ball.vz);
  if (sp > MAX_SPEED) {
    ball.vx = (ball.vx / sp) * MAX_SPEED;
    ball.vz = (ball.vz / sp) * MAX_SPEED;
  }

  return null;
}

function collideRod(ball: TableBallState, rod: TableRodState, dims: TableDims): void {
  const men = rodWorldMen(rod);
  const kickReach = dims.manHeight * 0.55;
  // Foot contact when angle has feet sweeping through the play plane
  const footPhase = Math.sin(rod.angle);
  const active = Math.abs(footPhase) > 0.15 || Math.abs(rod.spinVel) > 1.5;

  for (const man of men) {
    const dx = ball.x - man.x;
    const dz = ball.z - man.z;
    // Men are thin along x (rod axis), wider along z — approximate as circle in xz
    const rad = dims.manRadius + ball.radius;
    const dist = Math.hypot(dx, dz);
    if (dist > rad + 0.02 || dist < 1e-6) continue;

    // Push out
    const nx = dx / dist;
    const nz = dz / dist;
    const overlap = rad - dist;
    ball.x += nx * overlap;
    ball.z += nz * overlap;

    // Relative velocity including rod spin tangential (around rod = x axis → kicks in ±z? wait)
    // Rod along Z, spins around Z? No — foosball rods run across the table (along Z),
    // axis is parallel to Z, men kick in the X direction.
    // Our rods are at fixed X, men spaced along Z → rod axis = Z, rotation around Z → feet move in XY.
    // On a flat table, kick impulse is primarily ±X from angular velocity around Z.
    const spinKick = rod.spinVel * kickReach * (rod.spec.side === "home" ? 1 : -1);
    // Slide velocity along Z
    const slideVel = 0; // discrete slide; approximate from recent motion omitted in v1

    const rvx = ball.vx - spinKick * footPhase;
    const rvz = ball.vz - slideVel;
    const vn = rvx * nx + rvz * nz;
    if (vn >= 0 && !active) continue;

    const j = -(1 + MAN_REST) * vn;
    ball.vx += j * nx + spinKick * 0.55 * (active ? 1 : 0.25);
    ball.vz += j * nz;

    // Nudge from foot phase so resting ball gets lifted by a tap
    if (active && Math.abs(rod.spinVel) > 2) {
      ball.vx += Math.sign(spinKick || (rod.spec.side === "home" ? 1 : -1)) * Math.min(4, Math.abs(rod.spinVel) * 0.18);
    }
  }
}

/** True when ball is nearly stopped (for stuck serve). */
export function tableBallNearlyStill(ball: TableBallState): boolean {
  return Math.hypot(ball.vx, ball.vz) < 0.12;
}
