/**
 * TABLE foosball input — separate from football KeyboardControls.
 * Home: 1–5 select, Space kick, WASD/arrows slide.
 * Away: 6–0 select (6–9 rods, 0 = all), Enter kick, IJKL slide.
 */

export interface TableSideIntent {
  /** Rod indices 0..3 selected (multi). Empty = none. */
  selected: number[];
  /** Slide along rod: −1..1 (negative = toward −Z). */
  slide: number;
  kickHeld: boolean;
  kickHoldSeconds: number;
  kickReleased: boolean;
  /** Select-all away via Digit0. */
  selectAll: boolean;
}

export interface TableIntent {
  home: TableSideIntent;
  away: TableSideIntent;
  cycleView: boolean;
  zoomIn: boolean;
  zoomOut: boolean;
  pause: boolean;
}

function emptySide(): TableSideIntent {
  return {
    selected: [],
    slide: 0,
    kickHeld: false,
    kickHoldSeconds: 0,
    kickReleased: false,
    selectAll: false,
  };
}

export function createTableIntent(): TableIntent {
  return {
    home: emptySide(),
    away: emptySide(),
    cycleView: false,
    zoomIn: false,
    zoomOut: false,
    pause: false,
  };
}

export class TableInput {
  private keys = new Set<string>();
  private homeKickLatch = false;
  private awayKickLatch = false;
  private viewLatch = false;
  private pauseLatch = false;
  private homeHold = 0;
  private awayHold = 0;
  private homeWasHeld = false;
  private awayWasHeld = false;

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
  }

  private onDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (
      ["Space", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)
    ) {
      e.preventDefault();
    }
  };

  private onUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private held(code: string): boolean {
    return this.keys.has(code);
  }

  poll(intent: TableIntent, dt: number): void {
    // Home select 1–5 (we have 4 rods: 1–4; 5 = all home)
    const homeSel: number[] = [];
    if (this.held("Digit1") || this.held("Numpad1")) homeSel.push(0);
    if (this.held("Digit2") || this.held("Numpad2")) homeSel.push(1);
    if (this.held("Digit3") || this.held("Numpad3")) homeSel.push(2);
    if (this.held("Digit4") || this.held("Numpad4")) homeSel.push(3);
    if (this.held("Digit5") || this.held("Numpad5")) {
      homeSel.length = 0;
      homeSel.push(0, 1, 2, 3);
    }

    // Away: 6–9 rods; 0 = all
    const awaySel: number[] = [];
    if (this.held("Digit6") || this.held("Numpad6")) awaySel.push(0);
    if (this.held("Digit7") || this.held("Numpad7")) awaySel.push(1);
    if (this.held("Digit8") || this.held("Numpad8")) awaySel.push(2);
    if (this.held("Digit9") || this.held("Numpad9")) awaySel.push(3);
    const awayAll = this.held("Digit0") || this.held("Numpad0");
    if (awayAll) {
      awaySel.length = 0;
      awaySel.push(0, 1, 2, 3);
    }

    // Home slide: WASD + arrows (A/D or Left/Right along rod = ±Z)
    let homeSlide = 0;
    if (this.held("KeyA") || this.held("ArrowLeft")) homeSlide -= 1;
    if (this.held("KeyD") || this.held("ArrowRight")) homeSlide += 1;
    // W/S also slide for ergonomics when facing bird's-eye
    if (this.held("KeyW") || this.held("ArrowUp")) homeSlide -= 0.85;
    if (this.held("KeyS") || this.held("ArrowDown")) homeSlide += 0.85;

    // Away slide: IJKL
    let awaySlide = 0;
    if (this.held("KeyJ")) awaySlide -= 1;
    if (this.held("KeyL")) awaySlide += 1;
    if (this.held("KeyI")) awaySlide -= 0.85;
    if (this.held("KeyK")) awaySlide += 0.85;

    const homeKick = this.held("Space");
    const awayKick = this.held("Enter") || this.held("NumpadEnter");

    let homeReleased = false;
    if (homeKick) {
      this.homeHold += dt;
      this.homeWasHeld = true;
      this.homeKickLatch = true;
    } else {
      if (this.homeWasHeld) homeReleased = true;
      this.homeWasHeld = false;
      if (!this.homeKickLatch) this.homeHold = 0;
      this.homeKickLatch = false;
    }

    let awayReleased = false;
    if (awayKick) {
      this.awayHold += dt;
      this.awayWasHeld = true;
      this.awayKickLatch = true;
    } else {
      if (this.awayWasHeld) awayReleased = true;
      this.awayWasHeld = false;
      if (!this.awayKickLatch) this.awayHold = 0;
      this.awayKickLatch = false;
    }

    intent.home = {
      selected: homeSel,
      slide: Math.max(-1, Math.min(1, homeSlide)),
      kickHeld: homeKick,
      kickHoldSeconds: this.homeHold,
      kickReleased: homeReleased,
      selectAll: homeSel.length === 4,
    };
    intent.away = {
      selected: awaySel,
      slide: Math.max(-1, Math.min(1, awaySlide)),
      kickHeld: awayKick,
      kickHoldSeconds: this.awayHold,
      kickReleased: awayReleased,
      selectAll: awayAll,
    };

    const view = this.held("KeyV");
    intent.cycleView = view && !this.viewLatch;
    this.viewLatch = view;

    intent.zoomIn = this.held("Equal") || this.held("NumpadAdd");
    intent.zoomOut = this.held("Minus") || this.held("NumpadSubtract");

    const pause = this.held("Escape");
    intent.pause = pause && !this.pauseLatch;
    this.pauseLatch = pause;

    if (homeReleased) this.homeHold = 0;
    if (awayReleased) this.awayHold = 0;
  }
}

/** Pure helper for tests — which rod indices a digit mask selects. */
export function rodsFromHomeDigits(digits: number[]): number[] {
  const set = new Set<number>();
  for (const d of digits) {
    if (d === 5) return [0, 1, 2, 3];
    if (d >= 1 && d <= 4) set.add(d - 1);
  }
  return [...set].sort((a, b) => a - b);
}

export function rodsFromAwayDigits(digits: number[]): number[] {
  const set = new Set<number>();
  for (const d of digits) {
    if (d === 0) return [0, 1, 2, 3];
    if (d >= 6 && d <= 9) set.add(d - 6);
  }
  return [...set].sort((a, b) => a - b);
}
