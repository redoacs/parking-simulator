import type { VehicleState } from './model';

const STRIDE = 5;

/** Fixed-capacity ring buffer of VehicleState, oldest dropped first. */
export class StateHistory {
  private readonly buf: Float64Array;
  private start = 0;
  private count = 0;
  private dropped = 0;

  constructor(public readonly capacity: number) {
    this.buf = new Float64Array(capacity * STRIDE);
  }

  get length(): number {
    return this.count;
  }

  /** States dropped off the old end; `evicted + length` is a position that survives eviction. */
  get evicted(): number {
    return this.dropped;
  }

  push(s: VehicleState): void {
    const idx = (this.start + this.count) % this.capacity;
    this.write(idx, s);
    if (this.count < this.capacity) this.count++;
    else {
      this.start = (this.start + 1) % this.capacity;
      this.dropped++;
    }
  }

  pop(): VehicleState | undefined {
    if (this.count === 0) return undefined;
    this.count--;
    return this.read((this.start + this.count) % this.capacity);
  }

  last(): VehicleState | undefined {
    return this.count === 0 ? undefined : this.at(this.count - 1);
  }

  at(i: number): VehicleState {
    if (i < 0 || i >= this.count) throw new RangeError(`history index ${i} out of range`);
    return this.read((this.start + i) % this.capacity);
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
    this.dropped = 0;
  }

  forEach(fn: (s: VehicleState, i: number) => void): void {
    for (let i = 0; i < this.count; i++) fn(this.at(i), i);
  }

  private write(idx: number, s: VehicleState): void {
    const o = idx * STRIDE;
    this.buf[o] = s.x;
    this.buf[o + 1] = s.y;
    this.buf[o + 2] = s.theta;
    this.buf[o + 3] = s.steer;
    this.buf[o + 4] = s.speed;
  }

  private read(idx: number): VehicleState {
    const o = idx * STRIDE;
    return { x: this.buf[o]!, y: this.buf[o + 1]!, theta: this.buf[o + 2]!, steer: this.buf[o + 3]!, speed: this.buf[o + 4]! };
  }
}
