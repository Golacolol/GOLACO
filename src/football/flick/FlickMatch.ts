import * as THREE from "three";
import { FlickAI } from "./FlickAI";
import { checkFlickGoal, createFlickBall, resetFlickBall, type FlickBallState } from "./FlickBall";
import { FlickCamera } from "./FlickCamera";
import {
  applyFlickImpulse,
  kickoffFormation,
  type FlickFigureState,
  type FlickSide,
} from "./FlickFigure";
import { FlickHUD } from "./FlickHUD";
import { FlickInput, pickFigureAt } from "./FlickInput";
import { ballThreatensGoal, FLICK_PITCH } from "./FlickPitch";
import { everythingSettled, FLICK_SETTLE_HOLD, stepFlickWorld } from "./FlickPhysics";
import { normalizeFlickConfig, type FlickMatchConfig } from "./FlickSetup";
import { FlickVisual } from "./FlickVisual";

export type FlickMatchPhase = "kickoff" | "aim" | "moving" | "settle" | "goal" | "over";

/**
 * Who may flick right now.
 * - outfieldTurn: active side's outfield (and GK in hotseat)
 * - gkWindow: human GK while AI outfield turn when ball threatens human goal
 */
export type FlickControlMode = "outfield" | "gkWindow";

export class FlickMatch {
  readonly config: FlickMatchConfig;
  readonly camera: FlickCamera;
  readonly figures: FlickFigureState[];
  readonly ball: FlickBallState;
  readonly visual: FlickVisual;
  readonly input: FlickInput;
  readonly ai: FlickAI;
  readonly hud: FlickHUD;

  homeScore = 0;
  awayScore = 0;
  phase: FlickMatchPhase = "kickoff";
  /** Side about to take (or taking) the outfield flick. */
  turnSide: FlickSide = "home";
  controlMode: FlickControlMode = "outfield";
  winner: "home" | "away" | null = null;
  paused = false;

  private settleT = 0;
  private kickoffT = 0.6;
  private goalT = 0;
  private selectedId: string | null = null;
  private pointerWasDown = false;
  /** What the last completed flick was — drives turn advance vs GK window. */
  private lastFlickKind: "outfield" | "gk" | null = null;
  /** After AI outfield settle with threat: wait for human GK before advancing turn. */
  private pendingGkAfterAi = false;
  /** True when the flick in flight came from the post-AI GK window. */
  private flickedGkFromWindow = false;
  /** Seconds left to flick GK before the window auto-skips. */
  private gkWindowT = 0;
  private light: THREE.DirectionalLight;
  private amb: THREE.AmbientLight;
  private disposed = false;

  constructor(
    private scene: THREE.Scene,
    aspect: number,
    uiParent: HTMLElement,
    config?: Partial<FlickMatchConfig>,
  ) {
    this.config = normalizeFlickConfig(config);
    this.camera = new FlickCamera(aspect);
    this.figures = kickoffFormation(FLICK_PITCH);
    this.ball = createFlickBall(FLICK_PITCH);
    this.visual = new FlickVisual(this.config.homeColor, this.config.awayColor, FLICK_PITCH);
    this.input = new FlickInput();
    this.ai = new FlickAI(this.config.difficulty);
    this.hud = new FlickHUD(uiParent);

    this.amb = new THREE.AmbientLight(0xfff5e8, 0.58);
    this.light = new THREE.DirectionalLight(0xffe8cc, 1.1);
    this.light.position.set(3, 12, 5);
    this.light.castShadow = true;
    this.scene.add(this.amb);
    this.scene.add(this.light);
    this.scene.add(this.visual.group);
    this.scene.background = new THREE.Color(0x1a1510);

    this.hud.show();
    this.beginKickoff("home");
  }

  /** Bind pointer to the game canvas (call once after construct when canvas is known). */
  attachCanvas(canvas: HTMLCanvasElement): void {
    this.input.attach(canvas, this.camera.camera, FLICK_PITCH.playY);
  }

  private humanSide(): FlickSide {
    return this.config.humanSide;
  }

  private aiSide(): FlickSide {
    return this.humanSide() === "home" ? "away" : "home";
  }

  private beginKickoff(nextTurn: FlickSide): void {
    this.phase = "kickoff";
    this.kickoffT = 0.55;
    this.turnSide = nextTurn;
    this.controlMode = "outfield";
    this.selectedId = null;
    this.input.clearSelection();
    // Reset positions lightly — full formation only at match start already done;
    // after goals keep positions but centre ball.
    resetFlickBall(this.ball, FLICK_PITCH);
    for (const f of this.figures) {
      f.vx = 0;
      f.vz = 0;
      f.leanX = 0;
      f.leanZ = 0;
      f.settled = true;
    }
  }

  private enterAim(): void {
    this.phase = "aim";
    this.selectedId = null;
    this.input.clearSelection();
    if (this.pendingGkAfterAi) {
      this.controlMode = "gkWindow";
      this.gkWindowT = 7;
      this.ai.resetThink();
      return;
    }
    this.controlMode = "outfield";
    if (this.isAiOutfieldTurn()) this.ai.resetThink();
  }

  private isAiOutfieldTurn(): boolean {
    return this.config.opponent === "AI" && this.turnSide === this.aiSide();
  }

  canSelectFigure(f: FlickFigureState): boolean {
    if (this.phase !== "aim") return false;
    if (this.controlMode === "gkWindow") {
      return f.side === this.humanSide() && f.isGK;
    }
    if (f.side !== this.turnSide) return false;
    if (this.isAiOutfieldTurn()) return false;
    // Own turn: outfield always; GK allowed for human side / hotseat.
    if (f.isGK) {
      if (this.config.opponent === "HUMAN") return true;
      return this.turnSide === this.humanSide();
    }
    return true;
  }

  private applyFlick(fig: FlickFigureState, pullDx: number, pullDz: number): void {
    if (!applyFlickImpulse(fig, pullDx, pullDz)) return;
    this.flickedGkFromWindow = this.controlMode === "gkWindow";
    this.lastFlickKind = this.flickedGkFromWindow || fig.isGK ? "gk" : "outfield";
    if (this.controlMode === "gkWindow") this.pendingGkAfterAi = false;
    this.phase = "moving";
    this.settleT = 0;
    this.selectedId = null;
    this.input.clearSelection();
    this.controlMode = "outfield";
  }

  private advanceTurn(): void {
    this.turnSide = this.turnSide === "home" ? "away" : "home";
    this.pendingGkAfterAi = false;
    this.enterAim();
  }

  private afterSettle(): void {
    const scored = checkFlickGoal(this.ball, FLICK_PITCH);
    if (scored) {
      if (scored === "home") this.homeScore += 1;
      else this.awayScore += 1;
      this.phase = "goal";
      this.goalT = 1.2;
      this.pendingGkAfterAi = false;
      if (this.homeScore >= this.config.firstTo) this.winner = "home";
      else if (this.awayScore >= this.config.firstTo) this.winner = "away";
      return;
    }

    // AI just flicked outfield → optional human GK window, then human's turn.
    if (this.lastFlickKind === "outfield" && this.config.opponent === "AI" && this.turnSide === this.aiSide()) {
      if (ballThreatensGoal(this.ball.x, this.ball.z, this.humanSide(), FLICK_PITCH)) {
        this.pendingGkAfterAi = true;
        this.enterAim();
        return;
      }
      this.advanceTurn();
      return;
    }

    // Human finished GK save after AI attack → now human outfield turn.
    if (this.flickedGkFromWindow && this.config.opponent === "AI") {
      this.flickedGkFromWindow = false;
      this.turnSide = this.humanSide();
      this.pendingGkAfterAi = false;
      this.enterAim();
      return;
    }
    this.flickedGkFromWindow = false;

    this.advanceTurn();
  }

  private onGoalDone(): void {
    if (this.winner) {
      this.phase = "over";
      return;
    }
    // Kickoff toward the side that conceded (they receive).
    const next: FlickSide = this.ball.x > 0 ? "away" : "home";
    // Respawn formation for clean restart.
    const fresh = kickoffFormation(FLICK_PITCH);
    for (let i = 0; i < this.figures.length; i++) {
      const src = fresh[i];
      const dst = this.figures[i];
      if (!src || !dst) continue;
      dst.x = src.x;
      dst.z = src.z;
      dst.vx = 0;
      dst.vz = 0;
      dst.leanX = 0;
      dst.leanZ = 0;
      dst.facing = src.facing;
      dst.settled = true;
    }
    this.beginKickoff(next === "home" ? "away" : "home");
  }

  update(dt: number): { pauseRequested: boolean } {
    if (this.disposed) return { pauseRequested: false };
    const poll = this.input.poll();
    if (poll.pause) return { pauseRequested: true };
    if (this.paused) return { pauseRequested: false };

    if (poll.cycleView) this.camera.cycleView();

    if (this.phase === "kickoff") {
      this.kickoffT -= dt;
      if (this.kickoffT <= 0) this.enterAim();
    } else if (this.phase === "goal") {
      this.goalT -= dt;
      if (this.goalT <= 0) this.onGoalDone();
    } else if (this.phase === "aim") {
      this.updateAim(dt, poll);
    } else if (this.phase === "moving" || this.phase === "settle") {
      stepFlickWorld(this.figures, this.ball, dt, FLICK_PITCH);
      if (everythingSettled(this.figures, this.ball)) {
        this.settleT += dt;
        this.phase = "settle";
        if (this.settleT >= FLICK_SETTLE_HOLD) this.afterSettle();
      } else {
        this.settleT = 0;
        this.phase = "moving";
      }
      // Allow human GK flick mid-motion if ball becomes a threat during AI attack? Plan says
      // after AI flick while threatening — handled on settle via gkWindow on re-aim.
    }

    this.syncVisual();
    this.camera.update(FLICK_PITCH, this.ball.x, this.ball.z);
    this.hud.update({
      home: this.homeScore,
      away: this.awayScore,
      firstTo: this.config.firstTo,
      opponent: this.config.opponent,
      difficulty: this.config.difficulty,
      view: this.camera.view,
      turn: this.turnLabel(),
      gkWindow: this.controlMode === "gkWindow" && this.phase === "aim",
      winner: this.winner,
      phase: this.phase,
    });

    return { pauseRequested: false };
  }

  private turnLabel(): string {
    if (this.controlMode === "gkWindow") return `${this.humanSide().toUpperCase()} GK`;
    return this.turnSide.toUpperCase();
  }

  private updateAim(dt: number, poll: ReturnType<FlickInput["poll"]>): void {
    // AI outfield flick (never during human GK window).
    if (this.isAiOutfieldTurn() && this.controlMode === "outfield") {
      const decision = this.ai.update(dt, this.figures, this.ball, this.aiSide());
      if (decision) {
        const fig = this.figures.find((f) => f.id === decision.figureId);
        if (fig) this.applyFlick(fig, decision.pullDx, decision.pullDz);
      }
      return;
    }

    if (this.controlMode === "gkWindow") {
      this.ai.resetThink();
      this.gkWindowT -= dt;
      if (this.gkWindowT <= 0) {
        this.pendingGkAfterAi = false;
        this.turnSide = this.humanSide();
        this.enterAim();
        return;
      }
    }

    const aim = this.input.getAim();
    const down = aim.active;

    if (down && !this.pointerWasDown) {
      // Fresh press — pick figure.
      const hit = { x: aim.dragX, z: aim.dragZ };
      const fig = pickFigureAt(this.figures, hit.x, hit.z, (f) => this.canSelectFigure(f));
      if (fig) {
        this.selectedId = fig.id;
        this.input.setSelectedFigure(fig.id);
      }
    }

    if (poll.cancelled) {
      this.selectedId = null;
      this.input.clearSelection();
    }

    // Release: if we had a selection and pointer went up.
    if (!down && this.pointerWasDown && this.selectedId) {
      const fig = this.figures.find((f) => f.id === this.selectedId);
      if (fig) {
        const pullDx = aim.dragX - fig.x;
        const pullDz = aim.dragZ - fig.z;
        this.applyFlick(fig, pullDx, pullDz);
      }
    }

    this.pointerWasDown = down;
  }

  private syncVisual(): void {
    let aim: { fromX: number; fromZ: number; toX: number; toZ: number } | null = null;
    const raw = this.input.getAim();
    if (this.phase === "aim" && this.selectedId && raw.active) {
      const fig = this.figures.find((f) => f.id === this.selectedId);
      if (fig) {
        // Show intended travel (opposite pull).
        const pullDx = raw.dragX - fig.x;
        const pullDz = raw.dragZ - fig.z;
        aim = {
          fromX: fig.x,
          fromZ: fig.z,
          toX: fig.x - pullDx,
          toZ: fig.z - pullDz,
        };
      }
    }
    this.visual.sync(this.figures, this.ball, this.selectedId, aim);
  }

  setAspect(aspect: number): void {
    this.camera.setAspect(aspect);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.input.dispose();
    this.hud.dispose();
    this.visual.dispose();
    this.scene.remove(this.amb);
    this.scene.remove(this.light);
  }
}
