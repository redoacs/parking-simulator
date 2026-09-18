import { type Vec2, sub, dot, dist, perp, normalize, cross } from './vec2';
import type { Polygon } from './polygon';

export interface PolygonDistance {
  /** > 0 gap, 0 touching, < 0 penetration depth. */
  distance: number;
  pa: Vec2;
  pb: Vec2;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

function segmentsIntersect(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): boolean {
  const d1 = cross(sub(a1, a0), sub(b0, a0));
  const d2 = cross(sub(a1, a0), sub(b1, a0));
  const d3 = cross(sub(b1, b0), sub(a0, b0));
  const d4 = cross(sub(b1, b0), sub(a1, b0));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function segmentDistance(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): { d: number; pa: Vec2; pb: Vec2 } {
  if (segmentsIntersect(a0, a1, b0, b1)) {
    // Any interior point works; use the intersection.
    const r = sub(a1, a0);
    const s = sub(b1, b0);
    const t = cross(sub(b0, a0), s) / cross(r, s);
    const p = { x: a0.x + r.x * t, y: a0.y + r.y * t };
    return { d: 0, pa: p, pb: p };
  }
  const candidates: Array<[Vec2, Vec2]> = [
    [a0, closestPointOnSegment(a0, b0, b1)],
    [a1, closestPointOnSegment(a1, b0, b1)],
    [closestPointOnSegment(b0, a0, a1), b0],
    [closestPointOnSegment(b1, a0, a1), b1],
  ];
  let best = candidates[0]!;
  let bestD = dist(best[0], best[1]);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!;
    const d = dist(c[0], c[1]);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { d: bestD, pa: best[0], pb: best[1] };
}

function project(poly: Polygon, axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Separating-axis minimum overlap for convex polygons. 0 when separated or touching. */
export function convexPenetration(a: Polygon, b: Polygon): number {
  let minOverlap = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const axis = normalize(perp(sub(poly[(i + 1) % poly.length]!, poly[i]!)));
      const [amin, amax] = project(a, axis);
      const [bmin, bmax] = project(b, axis);
      const overlap = Math.min(amax - bmin, bmax - amin);
      if (overlap <= 1e-12) return 0;
      if (overlap < minOverlap) minOverlap = overlap;
    }
  }
  return minOverlap;
}

export function polygonDistance(a: Polygon, b: Polygon): PolygonDistance {
  const pen = convexPenetration(a, b);
  let best: PolygonDistance = { distance: Infinity, pa: a[0]!, pb: b[0]! };
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const r = segmentDistance(a0, a1, b[j]!, b[(j + 1) % b.length]!);
      if (r.d < best.distance) best = { distance: r.d, pa: r.pa, pb: r.pb };
    }
  }
  if (pen > 0) return { distance: -pen, pa: best.pa, pb: best.pb };
  return best;
}
