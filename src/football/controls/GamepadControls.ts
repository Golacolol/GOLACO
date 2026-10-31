import type { InputIntent } from "./InputIntent";

const DEAD = 0.18;

function axis(v: number): number {
  return Math.abs(v) < DEAD ? 0 : v;
}

export class GamepadControls {
  private passLatch = false;
  private shootLatch = false;
  private throughLatch = false;
  private chipLatch = false;
  private crossLatch = false;
  private switchLatch = false;
  private pauseLatch = false;
  private aLatch = false;
  private bLatch = false;
  private xLatch = false;
  private yLatch = false;
  private viewLatch = false;
  private trackLatch = false;
  private rbLatch = false;

  poll(intent: InputIntent, dt: number): void {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads.find((p) => p);
    if (!gp) return;

    const lx = axis(gp.axes[0] ?? 0);
    const ly = axis(gp.axes[1] ?? 0);
    const rx = axis(gp.axes[2] ?? 0);
    const ry = axis(gp.axes[3] ?? 0);
    intent.moveX += lx;
    // Stick up is negative Y; map to −Z so screen-up matches the sideline camera.
    intent.moveZ += ly;
    intent.aimX += rx !== 0 || ry !== 0 ? rx : lx;
    intent.aimY += rx !== 0 || ry !== 0 ? ry : ly;

    const buttons = gp.buttons;
    const a = buttons[0]?.pressed ?? false;
    const b = buttons[1]?.pressed ?? false;
    const x = buttons[2]?.pressed ?? false;
    const y = buttons[3]?.pressed ?? false;
    const lb = buttons[4]?.pressed ?? false;
    const rb = buttons[5]?.pressed ?? false;
    const lt = (buttons[6]?.value ?? 0) > 0.4 || (buttons[6]?.pressed ?? false);
    const rt = (buttons[7]?.value ?? 0) > 0.25 || (buttons[7]?.pressed ?? false);
    const start = buttons[9]?.pressed ?? false;

    intent.boost = intent.boost || rt;
    intent.sprint = intent.sprint || rt || intent.boost;
    intent.jockey = intent.jockey || lt;

    if (a) {
      intent.passHeld = true;
      intent.passHold += dt;
    } else if (this.passLatch && intent.passHold > 0) {
      intent.pass = true;
    }
    this.passLatch = a;

    if (b) {
      intent.shootHeld = true;
      intent.shootHold += dt;
    } else if (this.shootLatch && intent.shootHold > 0) {
      intent.shoot = true;
    }
    this.shootLatch = b;

    if (y && !this.throughLatch) intent.through = true;
    this.throughLatch = y;
    // Left-stick click = chip (explicit loft).
    const l3 = buttons[10]?.pressed ?? false;
    if (l3 && !this.chipLatch) intent.chip = true;
    this.chipLatch = l3;
    if (x && !this.crossLatch) intent.cross = true;
    this.crossLatch = x;
    if ((lb) && !this.switchLatch) intent.switchPlayer = true;
    this.switchLatch = lb;
    if (rb && !this.rbLatch) intent.tackle = true;
    this.rbLatch = rb;
    const dpadUp = buttons[12]?.pressed ?? false;
    const dpadDown = buttons[13]?.pressed ?? false;
    if (dpadUp && !this.viewLatch) intent.cycleView = true;
    this.viewLatch = dpadUp;
    if (dpadDown && !this.trackLatch) intent.cycleTrack = true;
    this.trackLatch = dpadDown;
    if (start && !this.pauseLatch) intent.pause = true;
    this.pauseLatch = start;

    if (a && !this.aLatch) intent.celebrateA = true;
    if (b && !this.bLatch) intent.celebrateB = true;
    if (x && !this.xLatch) intent.celebrateX = true;
    if (y && !this.yLatch) intent.celebrateY = true;
    this.aLatch = a;
    this.bLatch = b;
    this.xLatch = x;
    this.yLatch = y;

    if (lx || ly || rx || ry || a || b || x || y || lt || rt || lb) intent.anyGameplay = true;
  }

  connected(): boolean {
    return (navigator.getGamepads?.() ?? []).some((p) => !!p);
  }
}
