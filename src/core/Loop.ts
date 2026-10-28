const PHYSICS_HZ = 60;
const PHYSICS_DT = 1 / PHYSICS_HZ;
const MAX_FRAME = 0.05;

export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private running = false;
  private raf = 0;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
    private readonly aiUpdate: (dt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(now: number): void {
    if (!this.running) return;
    let frame = (now - this.last) / 1000;
    this.last = now;
    if (frame > MAX_FRAME) frame = MAX_FRAME;
    this.accumulator += frame;
    while (this.accumulator >= PHYSICS_DT) {
      this.update(PHYSICS_DT);
      this.aiUpdate(PHYSICS_DT);
      this.accumulator -= PHYSICS_DT;
    }
    this.render(this.accumulator / PHYSICS_DT);
    this.raf = requestAnimationFrame(this.tick);
  }
}
