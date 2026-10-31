import type { TableDims } from "./TableLayouts";
import type { TableBallState } from "./TableBall";
import type { TableRodState } from "./TableRod";
import { rodWorldMen } from "./TableRod";

export type TableGoalSide = "home" | "away" | null;

const FRICTION = 0.28;
const WALL_REST = 0.82;
const MAN_REST = 0.7;
const MAX_SPEED = 13;

export function stepTableBall(
  ball: TableBallState,
  dims: TableDims,
  rods: TableRodState[],
  dt: number,
): TableGoalSide {
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  const zLim = dims.width / 2 - ball.radius - 0.04;
  if (ball.z > zLim) {
    ball.z = zLim;
    ball.vz = -Math.abs(ball.vz) * WALL_REST;
  } else if (ball.z < -zLim) {
    ball.z = -zLim;
    ball.vz = Math.abs(ball.vz) * WALL_REST;
  }

  const xLim = dims.length / 2 - ball.radius - 0.02;
  const halfGoal = dims.goalWidth / 2;
  if (ball.x > xLim) {
    if (Math.abs(ball.z) < halfGoal) return "home";
    ball.x = xLim;
    ball.vx = -Math.abs(ball.vx) * WALL_REST;
  } else if (ball.x < -xLim) {
    if (Math.abs(ball.z) < halfGoal) return "away";
    ball.x = -xLim;
    ball.vx = Math.abs(ball.vx) * WALL_REST;
  }

  for (const rod of rods) {
    collideRod(ball, rod, dims);
  }

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
  const attackDir = rod.spec.side === "home" ? 1 : -1;
  const striking = rod.strikeArc > 0.02 || Math.abs(rod.spinVel) > 3;
  const footPhase = Math.sin(rod.angle);
  const still = Math.hypot(ball.vx, ball.vz) < 0.35;
  // Slightly larger hitbox while swinging / when the ball is dead so gaps stay coverable.
  const rad = dims.manRadius + ball.radius + (striking ? 0.07 : still ? 0.04 : 0.01);

  for (const man of men) {
    const dx = ball.x - man.x;
    const dz = ball.z - man.z;
    const dist = Math.hypot(dx, dz);
    if (dist > rad + 0.04 || dist < 1e-6) continue;

    const nx = dx / dist;
    const nz = dz / dist;
    const overlap = rad - dist;
    ball.x += nx * Math.max(0, overlap);
    ball.z += nz * Math.max(0, overlap);

    if (striking) {
      // Hard strike toward the opponent — ignore soft bounce that could reverse the shot.
      const drive = Math.min(9, 3.2 + Math.abs(rod.spinVel) * 0.32);
      const along = ball.vx * attackDir;
      ball.vx = attackDir * Math.max(along, drive);
      ball.vz += (dz !== 0 ? Math.sign(dz) : footPhase) * drive * 0.08;
      continue;
    }

    // Passive block / soft bump — feet down, or ball nearly still next to a man (no dead settle).
    const active = Math.abs(footPhase) > 0.15 || still;
    const rvx = ball.vx;
    const rvz = ball.vz;
    const vn = rvx * nx + rvz * nz;
    if (vn >= 0 && !active) continue;

    const j = -(1 + MAN_REST) * vn;
    ball.vx += j * nx;
    ball.vz += j * nz;
    if (active) {
      ball.vx += attackDir * (still ? 0.85 : 0.35);
      if (still) ball.vz += nz * 0.55;
    }
  }
}

export function tableBallNearlyStill(ball: TableBallState): boolean {
  return Math.hypot(ball.vx, ball.vz) < 0.12;
}
