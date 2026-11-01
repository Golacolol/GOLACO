import * as THREE from "three";
import { hexColor } from "../../core/math";
import { Stadium } from "../stadium/Stadium";
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
import { ballThreatensGoal, clampGkPosition, FLICK_PITCH } from "./FlickPitch";
import { everythingSettled, FLICK_SETTLE_HOLD, stepFlickWorld } from "./FlickPhysics";
import {
  normalizeFlickConfig,
  type FlickMatchConfig,
  type FlickWorldContext,
} from "./FlickSetup";
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
  readonly stadium: Stadium;

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
  /** Side that last scored — conceding side takes the next kickoff. */
  private lastScorer: FlickSide | null = null;
  private disposed = false;

  constructor(
    private scene: THREE.Scene,
    aspect: number,
    uiParent: HTMLElement,
    config: Partial<FlickMatchConfig> | undefined,
    world: FlickWorldContext,
  ) {
    this.config = normalizeFlickConfig({
      ...config,
      homeColor: hexColor(world.homePrimary),
      awayColor: hexColor(world.awayPrimary),
    });
    this.camera = new FlickCamera(aspect);
    this.figures = kickoffFormation(FLICK_PITCH);
    this.ball = createFlickBall(FLICK_PITCH);
    this.visual = new FlickVisual(this.config.homeColor, this.config.awayColor, FLICK_PITCH);
    this.input = new FlickInput();
    this.ai = new FlickAI(this.config.difficulty);
    this.hud = new FlickHUD(uiParent);

    this.stadium = new Stadium(
      this.scene,
      world.stadium,
      world.advertising,
      world.homePrimary,
      world.awayPrimary,
      world.env,
      { home: world.homeKit, away: world.awayKit },
    );
    this.stadium.applyEnvironment(world.env, world.graphicsPreset);

    // Pieces only — Stadium already owns pitch, goals, lights, and sky.
    this.scene.add(this.visual.group);

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
    // GK window is turn-based only — open play lets the human flick GK anytime.
    if (this.config.turnBased && this.pendingGkAfterAi) {
      this.controlMode = "gkWindow";
      this.gkWindowT = 7;
      this.ai.resetThink();
      return;
    }
    this.pendingGkAfterAi = false;
    this.controlMode = "outfield";
    if (this.shouldRunAi()) this.ai.resetThink();
  }

  private isAiOutfieldTurn(): boolean {
    return this.config.opponent === "AI" && this.turnSide === this.aiSide();
  }

  /** AI may flick now: its turn in classic mode, or anytime settled in open play. */
  private shouldRunAi(): boolean {
    if (this.config.opponent !== "AI") return false;
    if (this.phase !== "aim") return false;
    if (this.controlMode === "gkWindow") return false;
    if (!this.config.turnBased) return true;
    return this.turnSide === this.aiSide();
  }

  /** Outfield flick targets only — GKs are positioned, never flicked. */
  canSelectFigure(f: FlickFigureState): boolean {
    if (this.phase !== "aim") return false;
    if (f.isGK) return false;
    if (this.controlMode === "gkWindow") return false;
    if (!this.config.turnBased) {
      if (this.config.opponent === "HUMAN") return true;
      return f.side === this.humanSide();
    }
    if (f.side !== this.turnSide) return false;
    if (this.isAiOutfieldTurn()) return false;
    return true;
  }

  /** Drag-to-place the keeper inside their goal area. */
  canDragGk(f: FlickFigureState): boolean {
    if (!f.isGK) return false;
    if (this.phase === "goal" || this.phase === "over" || this.phase === "kickoff") return false;
    if (this.config.opponent === "HUMAN") return true;
    return f.side === this.humanSide();
  }

  private applyFlick(fig: FlickFigureState, pullDx: number, pullDz: number): void {
    if (fig.isGK) return;
    if (!applyFlickImpulse(fig, pullDx, pullDz)) return;
    this.flickedGkFromWindow = this.controlMode === "gkWindow";
    this.lastFlickKind = this.flickedGkFromWindow ? "gk" : "outfield";
    if (this.controlMode === "gkWindow") this.pendingGkAfterAi = false;
    this.phase = "moving";
    this.settleT = 0;
    this.selectedId = null;
    this.input.clearSelection();
    this.controlMode = "outfield";
  }

  /**
   * Keepers do not flick — slide them in the box with WASD/arrows, or drag.
   * Called every frame during live play so the human can save while the AI attacks.
   */
  private updateGkControl(dt: number): void {
    for (const f of this.figures) {
      if (!f.isGK) continue;
      f.vx = 0;
      f.vz = 0;
      f.settled = true;
      const pinned = clampGkPosition(f.x, f.z, f.side, FLICK_PITCH);
      f.x = pinned.x;
      f.z = pinned.z;
    }

    // Drag place: follow pointer while a GK is selected.
    const aim = this.input.getAim();
    if (this.selectedId && aim.active) {
      const fig = this.figures.find((f) => f.id === this.selectedId);
      if (fig?.isGK && this.canDragGk(fig)) {
        const placed = clampGkPosition(aim.dragX, aim.dragZ, fig.side, FLICK_PITCH);
        fig.x = placed.x;
        fig.z = placed.z;
        return;
      }
    }

    const axes = this.input.gkMoveAxes();
    if (axes.x === 0 && axes.z === 0) return;
    const speed = 16;
    const selectedGk = this.selectedId
      ? this.figures.find((f) => f.id === this.selectedId && f.isGK)
      : null;
    for (const f of this.figures) {
      if (!f.isGK || !this.canDragGk(f)) continue;
      // Hotseat: keys drive the selected keeper, otherwise home.
      if (this.config.opponent === "HUMAN") {
        if (selectedGk ? f.id !== selectedGk.id : f.side !== "home") continue;
      }
      // Away defends +X: "forward" (W) steps toward midfield (−X).
      const dx = (f.side === "home" ? axes.x : -axes.x) * speed * dt;
      const dz = axes.z * speed * dt;
      const next = clampGkPosition(f.x + dx, f.z + dz, f.side, FLICK_PITCH);
      f.x = next.x;
      f.z = next.z;
    }
  }

  private advanceTurn(): void {
    this.turnSide = this.turnSide === "home" ? "away" : "home";
    this.pendingGkAfterAi = false;
    this.enterAim();
  }

  /** Award a goal as soon as the ball is over the line (do not wait for settle). */
  private tryRegisterGoal(): boolean {
    if (this.phase === "goal" || this.phase === "over" || this.phase === "kickoff") return false;
    const scored = checkFlickGoal(this.ball, FLICK_PITCH);
    if (!scored) return false;
    if (scored === "home") this.homeScore += 1;
    else this.awayScore += 1;
    this.lastScorer = scored;
    // Pin the ball in the net so it cannot wander and skip the reset.
    const hl = FLICK_PITCH.length / 2;
    this.ball.vx = 0;
    this.ball.vz = 0;
    for (const f of this.figures) {
      f.vx = 0;
      f.vz = 0;
      f.settled = true;
    }
    if (scored === "home") this.ball.x = Math.max(this.ball.x, hl + this.ball.radius + 0.15);
    else this.ball.x = Math.min(this.ball.x, -hl - this.ball.radius - 0.15);
    this.phase = "goal";
    this.goalT = 1.2;
    this.pendingGkAfterAi = false;
    this.selectedId = null;
    this.input.clearSelection();
    if (this.homeScore >= this.config.firstTo) this.winner = "home";
    else if (this.awayScore >= this.config.firstTo) this.winner = "away";
    return true;
  }

  private afterSettle(): void {
    if (this.tryRegisterGoal()) return;

    // Open play: no turns — reopen aim so human and AI can both contest the next flick.
    if (!this.config.turnBased) {
      this.flickedGkFromWindow = false;
      this.pendingGkAfterAi = false;
      this.enterAim();
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
    // Conceding side always restarts (including after an own goal).
    const scorer: FlickSide =
      this.lastScorer ?? (this.ball.x > 0 ? "home" : "away");
    const conceded: FlickSide = scorer === "home" ? "away" : "home";
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
    this.lastScorer = null;
    this.beginKickoff(conceded);
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
      this.updateGkControl(dt);
      this.updateAim(dt, poll);
    } else if (this.phase === "moving" || this.phase === "settle") {
      stepFlickWorld(this.figures, this.ball, dt, FLICK_PITCH);
      this.updateGkControl(dt);
      if (this.tryRegisterGoal()) {
        // scored mid-flight
      } else if (everythingSettled(this.figures, this.ball)) {
        this.settleT += dt;
        this.phase = "settle";
        if (this.settleT >= FLICK_SETTLE_HOLD) this.afterSettle();
      } else {
        this.settleT = 0;
        this.phase = "moving";
      }
    }

    this.syncVisual();
    this.camera.update(FLICK_PITCH, this.ball.x, this.ball.z);
    this.stadium.update(dt, this.camera.camera.position);
    this.hud.update({
      home: this.homeScore,
      away: this.awayScore,
      firstTo: this.config.firstTo,
      opponent: this.config.opponent,
      difficulty: this.config.difficulty,
      view: this.camera.view,
      turn: this.turnLabel(),
      turnBased: this.config.turnBased,
      gkWindow: this.controlMode === "gkWindow" && this.phase === "aim",
      winner: this.winner,
      phase: this.phase,
    });

    return { pauseRequested: false };
  }

  private turnLabel(): string {
    if (!this.config.turnBased) return "OPEN PLAY";
    if (this.controlMode === "gkWindow") return `${this.humanSide().toUpperCase()} GK`;
    return this.turnSide.toUpperCase();
  }

  private updateAim(dt: number, poll: ReturnType<FlickInput["poll"]>): void {
    const aim = this.input.getAim();
    const down = aim.active;
    const selected = this.selectedId
      ? this.figures.find((f) => f.id === this.selectedId) ?? null
      : null;
    const draggingGk = !!(selected?.isGK);

    // GK window: position the keeper (keys/drag), then auto-advance — no flick.
    if (this.controlMode === "gkWindow") {
      this.ai.resetThink();
      this.gkWindowT -= dt;
      this.handleGkOrOutfieldPick(down);
      if (!down && this.pointerWasDown && draggingGk) {
        this.selectedId = null;
        this.input.clearSelection();
      }
      this.pointerWasDown = down;
      if (this.gkWindowT <= 0) {
        this.pendingGkAfterAi = false;
        this.turnSide = this.humanSide();
        this.enterAim();
      }
      return;
    }

    // Classic turn-based: AI exclusively owns outfield flicks on its turn (GK still movable).
    if (this.config.turnBased && this.isAiOutfieldTurn()) {
      this.handleGkOrOutfieldPick(down);
      if (!down && this.pointerWasDown && draggingGk) {
        this.selectedId = null;
        this.input.clearSelection();
      }
      this.pointerWasDown = down;
      if (draggingGk) return;
      const decision = this.ai.update(dt, this.figures, this.ball, this.aiSide());
      if (decision) {
        const fig = this.figures.find((f) => f.id === decision.figureId);
        if (fig && !fig.isGK) this.applyFlick(fig, decision.pullDx, decision.pullDz);
      }
      return;
    }

    // Open play: AI reacts on its difficulty timer while the human can also aim.
    if (!this.config.turnBased && this.shouldRunAi() && !this.selectedId) {
      const decision = this.ai.update(dt, this.figures, this.ball, this.aiSide());
      if (decision) {
        const fig = this.figures.find((f) => f.id === decision.figureId);
        if (fig && !fig.isGK) {
          this.applyFlick(fig, decision.pullDx, decision.pullDz);
          this.pointerWasDown = false;
          return;
        }
      }
    } else if (!this.config.turnBased && this.shouldRunAi() && this.selectedId) {
      this.ai.resetThink();
    }

    this.handleGkOrOutfieldPick(down);

    if (poll.cancelled) {
      this.selectedId = null;
      this.input.clearSelection();
      if (!this.config.turnBased && this.shouldRunAi()) this.ai.resetThink();
    }

    // Release: flick outfield, or finish GK place.
    if (!down && this.pointerWasDown && this.selectedId) {
      const fig = this.figures.find((f) => f.id === this.selectedId);
      if (fig?.isGK) {
        this.selectedId = null;
        this.input.clearSelection();
      } else if (fig) {
        const pullDx = aim.dragX - fig.x;
        const pullDz = aim.dragZ - fig.z;
        this.applyFlick(fig, pullDx, pullDz);
      }
    }

    this.pointerWasDown = down;
  }

  private handleGkOrOutfieldPick(down: boolean): void {
    if (!down || this.pointerWasDown) return;
    const aim = this.input.getAim();
    const hit = { x: aim.dragX, z: aim.dragZ };
    const pad = FLICK_PITCH.figureRadius * 0.45;
    const gk = pickFigureAt(this.figures, hit.x, hit.z, (f) => this.canDragGk(f), pad);
    if (gk) {
      this.selectedId = gk.id;
      this.input.setSelectedFigure(gk.id);
      return;
    }
    if (this.controlMode === "gkWindow") return;
    const fig = pickFigureAt(this.figures, hit.x, hit.z, (f) => this.canSelectFigure(f), pad);
    if (fig) {
      this.selectedId = fig.id;
      this.input.setSelectedFigure(fig.id);
    }
  }

  private syncVisual(): void {
    let aim: { fromX: number; fromZ: number; toX: number; toZ: number } | null = null;
    const raw = this.input.getAim();
    if (this.phase === "aim" && this.selectedId && raw.active) {
      const fig = this.figures.find((f) => f.id === this.selectedId);
      // Aim line only for outfield flicks — GK drag is a place, not a pull-back.
      if (fig && !fig.isGK) {
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
    this.scene.remove(this.stadium.group);
  }
}
