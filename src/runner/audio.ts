/**
 * Master volume for a mounted game: every audio node the emulator creates
 * connects to one GainNode, which connects to the host's output node.
 */

export interface MasterGain {
  /** The GainNode the emulator connects to (null without an AudioContext). */
  readonly node: GainNode | null;
  readonly volume: number;
  setVolume(volume: number): void;
  dispose(): void;
}

/** Clamp to 0..1; returns null for non-numbers/NaN/Infinity. */
export function clampVolume(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, v));
}

export function createMasterGain(ctx: AudioContext | null, output?: AudioNode, initial?: number): MasterGain {
  let volume = clampVolume(initial) ?? 1;
  let node: GainNode | null = null;
  if (ctx) {
    try {
      node = ctx.createGain();
      node.gain.value = volume;
      node.connect(output ?? ctx.destination);
    } catch (e) {
      console.warn('[runner] master gain unavailable:', e);
      node = null;
    }
  }
  return {
    get node() { return node; },
    get volume() { return volume; },
    setVolume(v: number) {
      const c = clampVolume(v);
      if (c === null) return;
      volume = c;
      if (node) node.gain.value = c;
    },
    dispose() {
      try { node?.disconnect(); } catch { /* already disconnected */ }
      node = null;
    },
  };
}
