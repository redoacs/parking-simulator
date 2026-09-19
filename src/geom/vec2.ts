export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z-component of the 3D cross product; positive when b is CCW from a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? a : { x: a.x / l, y: a.y / l };
}
