type UpdateCallback = (dt: number) => void;
type RenderCallback = () => void;

const MAX_DELTA_SECONDS = 0.1;

export class GameLoop {
  private rafId: number | null = null;
  private running = false;
  private paused = false;
  private lastFrameMs = 0;

  constructor(private readonly update: UpdateCallback, private readonly render: RenderCallback) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.lastFrameMs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.running) return;
    this.paused = false;
    this.lastFrameMs = performance.now();
  }

  private tick = (timeMs: number): void => {
    if (!this.running) return;
    const rawDelta = (timeMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = timeMs;

    if (!this.paused) {
      this.update(Math.min(rawDelta, MAX_DELTA_SECONDS));
      this.render();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
