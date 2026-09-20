/*
 * Dubins word equations adapted from Andrew Walker's Dubins-Curves, src/dubins.c.
 * https://github.com/AndrewWalker/Dubins-Curves
 * Copyright (c) 2008-2018, Andrew Walker
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import type { Pose } from '../geom/polygon';
export interface Leg {
  steer: number;
  distance: number;
}
const tau = 2 * Math.PI;
const mod = (n: number) => n - tau * Math.floor(n / tau);

/** Six same-gear connections. Search prefixes may change gear; this is not Reeds–Shepp. */
export function dubins(from: Pose, to: Pose, radius: number, maxSteer: number, gear: 1 | -1): Leg[][] {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const d = Math.hypot(dx, dy) / radius;
  const direction = Math.atan2(dy, dx);
  const a = mod(from.theta + (gear < 0 ? Math.PI : 0) - direction);
  const b = mod(to.theta + (gear < 0 ? Math.PI : 0) - direction);
  const sa = Math.sin(a),
    sb = Math.sin(b),
    ca = Math.cos(a),
    cb = Math.cos(b),
    cab = Math.cos(a - b);
  const words: Leg[][] = [];
  const add = (turns: number[], lengths: number[]) => {
    words.push(
      lengths
        .map((n, i) => ({ steer: turns[i]! * gear * maxSteer, distance: n * radius * gear }))
        .filter((l) => Math.abs(l.distance) > 1e-9),
    );
  };
  let q = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
  if (q >= -1e-12) {
    const t = Math.atan2(cb - ca, d + sa - sb);
    add([1, 0, 1], [mod(t - a), Math.sqrt(Math.max(0, q)), mod(b - t)]);
  }
  q = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
  if (q >= -1e-12) {
    const t = Math.atan2(ca - cb, d - sa + sb);
    add([-1, 0, -1], [mod(a - t), Math.sqrt(Math.max(0, q)), mod(t - b)]);
  }
  q = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
  if (q >= -1e-12) {
    const p = Math.sqrt(Math.max(0, q)),
      t = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
    add([1, 0, -1], [mod(t - a), p, mod(t - b)]);
  }
  q = -2 + d * d + 2 * cab - 2 * d * (sa + sb);
  if (q >= -1e-12) {
    const p = Math.sqrt(Math.max(0, q)),
      t = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
    add([-1, 0, 1], [mod(a - t), p, mod(b - t)]);
  }
  q = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8;
  if (Math.abs(q) <= 1) {
    const p = mod(tau - Math.acos(q)),
      t = mod(a - Math.atan2(ca - cb, d - sa + sb) + p / 2);
    add([-1, 1, -1], [t, p, mod(a - b - t + p)]);
  }
  q = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8;
  if (Math.abs(q) <= 1) {
    const p = mod(tau - Math.acos(q)),
      t = mod(-a - Math.atan2(ca - cb, d + sa - sb) + p / 2);
    add([1, -1, 1], [t, p, mod(b - a - t + p)]);
  }
  return words;
}
