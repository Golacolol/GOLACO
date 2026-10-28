import { GamepadControls } from "./GamepadControls";
import { InputIntent } from "./InputIntent";
import { KeyboardControls } from "./KeyboardControls";
import { clamp, normalize2 } from "../../core/math";

export class InputManager {
  readonly intent = new InputIntent();
  readonly keyboard = new KeyboardControls();
  readonly gamepad = new GamepadControls();
  lastInputAt = performance.now();

  update(dt: number): InputIntent {
    const prevHoldPass = this.intent.passHold;
    const prevHoldShoot = this.intent.shootHold;
    this.intent.resetEdges();
    this.intent.moveX = 0;
    this.intent.moveZ = 0;
    this.intent.aimX = 0;
    this.intent.aimY = 0;
    this.intent.sprint = false;
    this.intent.boost = false;
    this.intent.jockey = false;
    this.intent.passHeld = false;
    this.intent.shootHeld = false;
    this.intent.secondaryPressHeld = false;
    this.intent.zoomIn = false;
    this.intent.zoomOut = false;
    this.intent.passHold = prevHoldPass;
    this.intent.shootHold = prevHoldShoot;
    this.keyboard.poll(this.intent, dt);
    this.gamepad.poll(this.intent, dt);
    const move = normalize2(this.intent.moveX, this.intent.moveZ);
    this.intent.moveX = move.x;
    this.intent.moveZ = move.z;
    this.intent.aimX = clamp(this.intent.aimX, -1, 1);
    this.intent.aimY = clamp(this.intent.aimY, -1, 1);
    if (!this.intent.passHeld && !this.intent.pass && !this.intent.through) this.intent.passHold = 0;
    if (!this.intent.shootHeld && !this.intent.shoot) this.intent.shootHold = 0;
    if (this.intent.anyGameplay || this.keyboard.hasAnyKey) this.lastInputAt = performance.now();
    return this.intent;
  }

  idleSeconds(): number {
    return (performance.now() - this.lastInputAt) / 1000;
  }

  dispose(): void {
    this.keyboard.dispose();
  }
}
