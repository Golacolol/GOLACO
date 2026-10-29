import * as THREE from "three";
import { layoutById } from "./TableLayouts";
import type { TableLayout } from "./TableLayouts";
import { createRodState, stepRodKick, stepRodSlide, type TableRodState } from "./TableRod";
import { createTableBall, serveTableBall, type TableBallState } from "./TableBall";
import { stepTableBall } from "./TablePhysics";
import { TableCamera } from "./TableCamera";
import { TableInput, createTableIntent, type TableIntent } from "./TableInput";
import { TableAI } from "./TableAI";
import { TableVisual } from "./TableVisual";
import { TableHUD } from "./TableHUD";
import { normalizeTableConfig, type TableMatchConfig } from "./TableSetup";

export type TableMatchPhase = "serve" | "play" | "goal" | "over";

export class TableMatch {
  readonly config: TableMatchConfig;
  readonly layout: TableLayout;
  readonly camera: TableCamera;
  readonly rods: TableRodState[];
  readonly ball: TableBallState;
  readonly visual: TableVisual;
  readonly input: TableInput;
  readonly intent: TableIntent;
  readonly ai: TableAI;
  readonly hud: TableHUD;

  homeScore = 0;
  awayScore = 0;
  phase: TableMatchPhase = "serve";
  winner: "home" | "away" | null = null;
  private serveT = 0;
  private goalT = 0;
  private nextServeToward: "home" | "away" = "away";
  private light: THREE.DirectionalLight;
  private amb: THREE.AmbientLight;
  private disposed = false;
  paused = false;

  constructor(
    private scene: THREE.Scene,
    aspect: number,
    uiParent: HTMLElement,
    config?: Partial<TableMatchConfig>,
  ) {
    this.config = normalizeTableConfig(config);
    this.layout = layoutById(this.config.layoutId, this.config.customMen);
    this.camera = new TableCamera(aspect);
    this.rods = this.layout.rods.map((spec) => createRodState(spec, this.layout.dims));
    this.ball = createTableBall(this.layout.dims);
    this.visual = new TableVisual(this.layout);
    this.input = new TableInput();
    this.intent = createTableIntent();
    this.ai = new TableAI(this.config.difficulty);
    this.hud = new TableHUD(uiParent);

    this.amb = new THREE.AmbientLight(0xfff5e8, 0.55);
    this.light = new THREE.DirectionalLight(0xffe8cc, 1.15);
    this.light.position.set(4, 14, 6);
    this.light.castShadow = true;
    this.scene.add(this.amb);
    this.scene.add(this.light);
    this.scene.add(this.visual.group);
    this.scene.background = new THREE.Color(0x1a1510);

    this.hud.show();
    this.beginServe(this.nextServeToward);
  }

  private homeRods(): TableRodState[] {
    return this.rods.filter((r) => r.spec.side === "home");
  }

  private awayRods(): TableRodState[] {
    return this.rods.filter((r) => r.spec.side === "away");
  }

  private beginServe(toward: "home" | "away"): void {
    this.phase = "serve";
    this.serveT = 0.85;
    serveTableBall(this.ball, this.layout.dims, toward);
    // Soft serve
    this.ball.vx *= 0.55;
    this.ball.vz *= 0.55;
  }

  private applySide(
    side: "home" | "away",
    selected: number[],
    slide: number,
    kickHeld: boolean,
    kickHold: number,
    kickReleased: boolean,
    dt: number,
  ): void {
    const rods = side === "home" ? this.homeRods() : this.awayRods();
    const sign = side === "home" ? 1 : -1;
    for (const rod of rods) {
      if (!selected.includes(rod.spec.index)) continue;
      stepRodSlide(rod, slide, dt);
      stepRodKick(rod, kickHeld, kickHold, kickReleased, dt, sign);
    }
  }

  update(dt: number): { pauseRequested: boolean } {
    if (this.disposed) return { pauseRequested: false };
    this.input.poll(this.intent, dt);
    if (this.intent.pause) return { pauseRequested: true };
    if (this.paused) return { pauseRequested: false };

    if (this.intent.cycleView) this.camera.cycleView();
    if (this.intent.zoomIn) this.camera.adjustZoom(0.03);
    if (this.intent.zoomOut) this.camera.adjustZoom(-0.03);

    // AI fills away intent when needed
    if (this.config.opponent === "AI" && this.phase === "play") {
      this.ai.tick(dt, this.ball, this.awayRods(), this.layout.dims, this.intent.away);
    }

    if (this.phase === "serve") {
      this.serveT -= dt;
      if (this.serveT <= 0) this.phase = "play";
    } else if (this.phase === "goal") {
      this.goalT -= dt;
      if (this.goalT <= 0) {
        if (this.winner) this.phase = "over";
        else this.beginServe(this.nextServeToward);
      }
    } else if (this.phase === "play") {
      this.applySide(
        "home",
        this.intent.home.selected,
        this.intent.home.slide,
        this.intent.home.kickHeld,
        this.intent.home.kickHoldSeconds,
        this.intent.home.kickReleased,
        dt,
      );
      if (this.config.opponent === "HUMAN" || this.config.opponent === "AI") {
        this.applySide(
          "away",
          this.intent.away.selected,
          this.intent.away.slide,
          this.intent.away.kickHeld,
          this.intent.away.kickHoldSeconds,
          this.intent.away.kickReleased,
          dt,
        );
      }

      // Decay unselected rods' spin lightly already handled in stepRodKick when not kicked
      for (const rod of this.rods) {
        const sel =
          rod.spec.side === "home"
            ? this.intent.home.selected.includes(rod.spec.index)
            : this.intent.away.selected.includes(rod.spec.index);
        if (!sel) stepRodKick(rod, false, 0, false, dt, rod.spec.side === "home" ? 1 : -1);
      }

      const goal = stepTableBall(this.ball, this.layout.dims, this.rods, dt);
      if (goal) {
        if (goal === "home") this.homeScore += 1;
        else this.awayScore += 1;
        this.phase = "goal";
        this.goalT = 1.1;
        this.nextServeToward = goal === "home" ? "away" : "home";
        if (this.homeScore >= this.config.firstTo) this.winner = "home";
        if (this.awayScore >= this.config.firstTo) this.winner = "away";
      }
    }

    this.visual.sync(
      this.rods,
      this.ball,
      this.intent.home.selected,
      this.intent.away.selected,
    );
    this.camera.update(this.layout.dims, this.ball.x, this.ball.z);
    this.hud.update({
      home: this.homeScore,
      away: this.awayScore,
      firstTo: this.config.firstTo,
      opponent: this.config.opponent,
      difficulty: this.config.difficulty,
      view: this.camera.view,
      serving: this.phase === "serve" ? this.nextServeToward : null,
      winner: this.winner,
    });

    return { pauseRequested: false };
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
    this.scene.remove(this.visual.group);
    this.scene.remove(this.light);
    this.scene.remove(this.amb);
  }
}
