/**
 * TABLE foosball input — separate from football KeyboardControls.
 * Home: 1–5 select (latched), Space kick, WASD/arrows slide.
 * Away: 6–0 select (latched), Enter kick, IJKL slide.
 */

export interface TableSideIntent {
  /** Rod indices 0..3 selected (multi). Empty = none. */
  selected: number[];
  /** Slide along rod: −1..1 (negative = toward −Z). */
  slide: number;
  kickHeld: boolean;
  kickHoldSeconds: number;
  kickReleased: boolean;
  /** Rising edge this frame — fires an immediate strike. */
  kickPressed: boolean;
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

function emptySide(selected: number[] = []): TableSideIntent {
  return {
    selected: [...selected],
    slide: 0,
    kickHeld: false,
    kickHoldSeconds: 0,
    kickReleased: false,
    kickPressed: false,
    selectAll: false,
  };
}

export function createTableIntent(): TableIntent {
  return {
    // Default midfield rod — most useful starting handle.
    home: emptySide([2]),
    away: emptySide([2]),
    cycleView: false,
    zoomIn: false,
    zoomOut: false,
    pause: false,
  };
}

export class TableInput {
  private keys = new Set<string>();
  private viewLatch = false;
  private pauseLatch = false;
  private homeHold = 0;
  private awayHold = 0;
  private homeWasHeld = false;
  private awayWasHeld = false;
  private homePressedEdge = false;
  private awayPressedEdge = false;
  /** Latched rod selection — digits tap to change, release keeps control. */
  private homeSelected: number[] = [2];
  private awaySelected: number[] = [2];
  private prevHomeMask = "";
  private prevAwayMask = "";

  constructor() {
    window.addEventListener("keydown", this.onDown, true);
    window.addEventListener("keyup", this.onUp, true);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown, true);
    window.removeEventListener("keyup", this.onUp, true);
  }

  private onDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const was = this.keys.has(e.code);
    this.keys.add(e.code);
    if (!was && (e.code === "Space")) this.homePressedEdge = true;
    if (!was && (e.code === "Enter" || e.code === "NumpadEnter")) this.awayPressedEdge = true;
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

  private readHomeMask(): number[] {
    const homeSel: number[] = [];
    if (this.held("Digit1") || this.held("Numpad1")) homeSel.push(0);
    if (this.held("Digit2") || this.held("Numpad2")) homeSel.push(1);
    if (this.held("Digit3") || this.held("Numpad3")) homeSel.push(2);
    if (this.held("Digit4") || this.held("Numpad4")) homeSel.push(3);
    if (this.held("Digit5") || this.held("Numpad5")) return [0, 1, 2, 3];
    return homeSel;
  }

  private readAwayMask(): number[] {
    if (this.held("Digit0") || this.held("Numpad0")) return [0, 1, 2, 3];
    const awaySel: number[] = [];
    if (this.held("Digit6") || this.held("Numpad6")) awaySel.push(0);
    if (this.held("Digit7") || this.held("Numpad7")) awaySel.push(1);
    if (this.held("Digit8") || this.held("Numpad8")) awaySel.push(2);
    if (this.held("Digit9") || this.held("Numpad9")) awaySel.push(3);
    return awaySel;
  }

  poll(intent: TableIntent, dt: number): void {
    const homeMask = this.readHomeMask();
    const homeKey = homeMask.join(",");
    if (homeMask.length && homeKey !== this.prevHomeMask) {
      this.homeSelected = [...homeMask];
    }
    this.prevHomeMask = homeKey;

    const awayMask = this.readAwayMask();
    const awayKey = awayMask.join(",");
    if (awayMask.length && awayKey !== this.prevAwayMask) {
      this.awaySelected = [...awayMask];
    }
    this.prevAwayMask = awayKey;

    let homeSlide = 0;
    if (this.held("KeyA") || this.held("ArrowLeft")) homeSlide -= 1;
    if (this.held("KeyD") || this.held("ArrowRight")) homeSlide += 1;
    // W / ↑ → −Z (screen-up on the default table view); was inverted.
    if (this.held("KeyW") || this.held("ArrowUp")) homeSlide -= 0.85;
    if (this.held("KeyS") || this.held("ArrowDown")) homeSlide += 0.85;

    let awaySlide = 0;
    if (this.held("KeyJ")) awaySlide -= 1;
    if (this.held("KeyL")) awaySlide += 1;
    if (this.held("KeyI")) awaySlide -= 0.85;
    if (this.held("KeyK")) awaySlide += 0.85;

    const homeKick = this.held("Space");
    const awayKick = this.held("Enter") || this.held("NumpadEnter");

    const homePressed = this.homePressedEdge;
    const awayPressed = this.awayPressedEdge;
    this.homePressedEdge = false;
    this.awayPressedEdge = false;

    let homeReleased = false;
    if (homeKick) {
      this.homeHold += dt;
      this.homeWasHeld = true;
    } else {
      if (this.homeWasHeld) homeReleased = true;
      this.homeWasHeld = false;
      this.homeHold = 0;
    }

    let awayReleased = false;
    if (awayKick) {
      this.awayHold += dt;
      this.awayWasHeld = true;
    } else {
      if (this.awayWasHeld) awayReleased = true;
      this.awayWasHeld = false;
      this.awayHold = 0;
    }

    intent.home = {
      selected: [...this.homeSelected],
      slide: Math.max(-1, Math.min(1, homeSlide)),
      kickHeld: homeKick,
      kickHoldSeconds: this.homeHold,
      kickReleased: homeReleased,
      kickPressed: homePressed,
      selectAll: this.homeSelected.length === 4,
    };
    intent.away = {
      selected: [...this.awaySelected],
      slide: Math.max(-1, Math.min(1, awaySlide)),
      kickHeld: awayKick,
      kickHoldSeconds: this.awayHold,
      kickReleased: awayReleased,
      kickPressed: awayPressed,
      selectAll: this.awaySelected.length === 4,
    };

    const view = this.held("KeyV");
    intent.cycleView = view && !this.viewLatch;
    this.viewLatch = view;

    intent.zoomIn = this.held("Equal") || this.held("NumpadAdd");
    intent.zoomOut = this.held("Minus") || this.held("NumpadSubtract");

    const pause = this.held("Escape");
    intent.pause = pause && !this.pauseLatch;
    this.pauseLatch = pause;
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
