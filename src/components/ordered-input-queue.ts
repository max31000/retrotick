/**
 * Runs input actions in order. An action marked `delayed` waits two animation frames before it
 * runs (so e.g. a pressed button is painted before the release arrives); every action queued
 * after it waits too, so a fast press-release-press never reaches the emulator out of order.
 */
export class OrderedInputQueue {
  private queue: { fn: () => void; delayed: boolean }[] = [];
  private waiting = false;

  push(fn: () => void, delayed = false): void {
    this.queue.push({ fn, delayed });
    if (!this.waiting) this.drain();
  }

  private drain(): void {
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (head.delayed) {
        this.waiting = true;
        head.delayed = false;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          this.waiting = false;
          this.drain();
        }));
        return;
      }
      this.queue.shift();
      head.fn();
    }
  }
}
