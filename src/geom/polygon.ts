import { type Vec2, vec, sub, cross, normalize, perp, scale, add } from './vec2';

/** Counter-clockwise, convex. */
export type Polygon = Vec2[];

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Pose {
  x: number;
  y: number;
  theta: number;
}

export function rect(minX: number, minY: number, maxX: number, maxY: number): Polygon {
  return [vec(minX, minY), vec(maxX, minY), vec(maxX, maxY), vec(minX, maxY)];
}

export function rectCentered(cx: number, cy: number, w: number, h: number): Polygon {
  return rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
}

/** Strip of `width` centred on segment a→b. */
export function rectFromSegment(a: Vec2, b: Vec2, width: number): Polygon {
  const n = scale(normalize(perp(sub(b, a))), width / 2);
  return [sub(a, n), sub(b, n), add(b, n), add(a, n)];
}

export function transformPolygon(poly: Polygon, pose: Pose): Polygon {
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  return poly.map((p) => vec(pose.x + p.x * c - p.y * s, pose.y + p.x * s + p.y * c));
}

export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function isConvex(poly: Polygon): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const c = poly[(i + 2) % n]!;
    if (cross(sub(b, a), sub(c, b)) < -1e-12) return false;
  }
  return true;
}

export function boundsOf(polys: Polygon[]): Rect {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Boundary counts as inside. */
export function pointInConvex(p: Vec2, poly: Polygon): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    if (cross(sub(b, a), sub(p, a)) < -1e-9) return false;
  }
  return true;
}

export function polygonInsideConvex(inner: Polygon, outer: Polygon): boolean {
  return inner.every((p) => pointInConvex(p, outer));
}

/** Triangle list (fan from vertex 0) for a convex polygon. */
export function fanTriangles(poly: Polygon): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i + 1 < poly.length; i++) out.push(poly[0]!, poly[i]!, poly[i + 1]!);
  return out;
}
