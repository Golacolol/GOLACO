import type { InputIntent } from "./InputIntent";
import { DEFAULT_KEY_BINDINGS, type KeyBindings, mergeKeyBindings } from "./KeyBindings";

export class KeyboardControls {
  private keys = new Set<string>();
  private passLatch = false;
  private shootLatch = false;
  private throughLatch = false;
  private chipLatch = false;
  private switchLatch = false;
  private pauseLatch = false;
  private crossLatch = false;
  private tackleLatch = false;
  private viewLatch = false;
  private trackLatch = false;
  private homePortraitsLatch = false;
  private awayPortraitsLatch = false;
  private homePlayersLatch = false;
  private awayPlayersLatch = false;
  bindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  setBindings(next: Partial<KeyBindings> | null | undefined): void {
    this.bindings = mergeKeyBindings(next);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
  }

  private onDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  };

  private onUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private held(code: string): boolean {
    if (code === "ShiftLeft" || code === "ShiftRight") return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    if (code === "ControlLeft" || code === "ControlRight") return this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    return this.keys.has(code);
  }

  poll(intent: InputIntent, dt: number): void {
    const b = this.bindings;
    const up = this.held(b.up) || this.keys.has("ArrowUp");
    const down = this.held(b.down) || this.keys.has("ArrowDown");
    const left = this.held(b.left) || this.keys.has("ArrowLeft");
    const right = this.held(b.right) || this.keys.has("ArrowRight");
    intent.moveX += (right ? 1 : 0) - (left ? 1 : 0);
    intent.moveZ += (up ? 1 : 0) - (down ? 1 : 0);
    intent.aimX += intent.moveX;
    intent.aimY += (up ? 1 : 0) - (down ? 1 : 0);
    intent.boost = intent.boost || this.held(b.boost);
    intent.sprint = intent.sprint || this.held(b.sprint) || intent.boost;
    intent.jockey = intent.jockey || this.held(b.jockey);

    const space = this.held(b.pass);
    const throughMod = this.held(b.through);
    const throughIsModifier = b.through.startsWith("Shift") || b.through.startsWith("Control") || b.through.startsWith("Alt");
    if (space) {
      intent.passHeld = true;
      intent.passHold += dt;
      if (throughIsModifier && throughMod && !this.throughLatch) {
        intent.through = true;
        this.throughLatch = true;
      }
    } else if (this.passLatch && intent.passHold > 0) {
      // Hold Space streams passes while attacking / presses while defending — no fire-on-release.
    }
    if (!space) {
      this.passLatch = false;
      this.throughLatch = false;
      if (!intent.pass && !intent.through) intent.passHold = 0;
    } else this.passLatch = true;
    if (!throughIsModifier && throughMod && !this.throughLatch) {
      intent.through = true;
      this.throughLatch = true;
    }
    if (!throughIsModifier && !throughMod) this.throughLatch = false;

    const chip = this.held(b.chip);
    if (chip && !this.chipLatch) intent.chip = true;
    this.chipLatch = chip;

    intent.secondaryPressHeld = this.held(b.secondaryPress);

    const shootKey = this.held(b.shoot);
    if (shootKey) {
      intent.shootHeld = true;
      intent.shootHold += dt;
    } else if (this.shootLatch && intent.shootHold > 0) {
      intent.shoot = true;
    }
    if (!shootKey) this.shootLatch = false;
    else this.shootLatch = true;
    if (!shootKey && !intent.shoot && !intent.shootHeld) intent.shootHold = 0;

    const cross = this.held(b.cross);
    if (cross && !this.crossLatch) intent.cross = true;
    this.crossLatch = cross;

    const sw = this.held(b.switch);
    if (sw && !this.switchLatch) intent.switchPlayer = true;
    this.switchLatch = sw;

    const tackle = this.held(b.tackle);
    if (tackle && !this.tackleLatch) intent.tackle = true;
    this.tackleLatch = tackle;

    const view = this.held(b.view);
    if (view && !this.viewLatch) intent.cycleView = true;
    this.viewLatch = view;

    const track = this.held(b.track);
    if (track && !this.trackLatch) intent.cycleTrack = true;
    this.trackLatch = track;

    const homePortraits = this.held(b.homePortraits);
    if (homePortraits && !this.homePortraitsLatch) intent.toggleHomePortraits = true;
    this.homePortraitsLatch = homePortraits;

    const awayPortraits = this.held(b.awayPortraits);
    if (awayPortraits && !this.awayPortraitsLatch) intent.toggleAwayPortraits = true;
    this.awayPortraitsLatch = awayPortraits;

    const homePlayers = this.held(b.homePlayers);
    if (homePlayers && !this.homePlayersLatch) intent.toggleHomePlayers = true;
    this.homePlayersLatch = homePlayers;

    const awayPlayers = this.held(b.awayPlayers);
    if (awayPlayers && !this.awayPlayersLatch) intent.toggleAwayPlayers = true;
    this.awayPlayersLatch = awayPlayers;

    const esc = this.held(b.pause);
    if (esc && !this.pauseLatch) intent.pause = true;
    this.pauseLatch = esc;

    if (this.keys.has("KeyZ") || this.keys.has("Digit1")) intent.celebrateA = true;
    if (this.keys.has("KeyF")) intent.celebrateB = true;
    if (this.keys.has("KeyH")) intent.celebrateY = true;
    if (this.keys.has("Enter") || space) intent.skip = true;

    if (this.keys.has("Equal") || this.keys.has("NumpadAdd")) intent.zoomIn = true;
    if (this.keys.has("Minus") || this.keys.has("NumpadSubtract")) intent.zoomOut = true;

    if (up || down || left || right || space || shootKey || cross || sw || tackle || intent.sprint || intent.boost || intent.jockey) {
      intent.anyGameplay = true;
    }
  }

  get hasAnyKey(): boolean {
    return this.keys.size > 0;
  }
}
