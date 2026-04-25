export interface Screen {
  onEnter(): void;
  onExit(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export class ScreenManager {
  private readonly stack: Screen[] = [];

  push(screen: Screen): void {
    this.stack.push(screen);
    screen.onEnter();
  }

  pop(): Screen | undefined {
    const current = this.stack.pop();
    current?.onExit();
    return current;
  }

  replace(screen: Screen): void {
    const current = this.stack.pop();
    current?.onExit();
    this.stack.push(screen);
    screen.onEnter();
  }

  top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }
}
