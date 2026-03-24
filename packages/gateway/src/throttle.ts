export class ThrottledBuffer {
  private buffer: string = "";
  private lastSent: string = "";
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    private editFn: (text: string) => Promise<void>,
    private intervalMs: number = 1000,
  ) {}

  append(content: string): void {
    this.buffer += content;
  }

  start(): void {
    this.intervalId = setInterval(() => {
      if (this.buffer !== this.lastSent) {
        const current = this.buffer;
        this.editFn(current).catch(() => {});
        this.lastSent = current;
      }
    }, this.intervalMs);
  }

  async flush(): Promise<void> {
    clearInterval(this.intervalId);
    this.intervalId = undefined;
    if (this.buffer !== this.lastSent) {
      const current = this.buffer;
      try {
        await this.editFn(current);
        this.lastSent = current;
      } catch {
        // silent ignore
      }
    }
  }

  stop(): void {
    clearInterval(this.intervalId);
    this.intervalId = undefined;
  }
}
