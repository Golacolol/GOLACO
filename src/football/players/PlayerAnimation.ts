export type Gait = "IDLE" | "WALK" | "JOG" | "RUN" | "SPRINT";

export function gaitFromSpeed(speed: number, sprinting: boolean, jockeying: boolean): Gait {
  if (jockeying && speed > 0.4) return "WALK";
  if (speed < 0.45) return "IDLE";
  if (speed < 3.2) return "WALK";
  if (speed < 5.8) return "JOG";
  if (sprinting && speed >= 7.4) return "SPRINT";
  return "RUN";
}

export function gaitCadence(gait: Gait): number {
  switch (gait) {
    case "IDLE":
      return 1.2;
    case "WALK":
      return 6.2;
    case "JOG":
      return 8.1;
    case "RUN":
      return 10.2;
    case "SPRINT":
      return 12.4;
  }
}

export function gaitStride(gait: Gait): number {
  switch (gait) {
    case "IDLE":
      return 0.05;
    case "WALK":
      return 0.38;
    case "JOG":
      return 0.55;
    case "RUN":
      return 0.72;
    case "SPRINT":
      return 0.9;
  }
}
