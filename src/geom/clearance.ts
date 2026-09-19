import { type Polygon, polygonInsideConvex, transformPolygon, boundsOf } from './polygon';
import { polygonDistance } from './distance';
import { type Vec2 } from './vec2';
import { isCollidable, type Scene } from '../scene/types';
import type { VehicleState } from '../sim/model';
import { collisionOutline, type DerivedVehicle } from '../vehicle/derive';

export interface Clearance {
  distance: number;
  obstacleIndex: number;
  /** Closest point on the car. */
  pa: Vec2;
  /** Closest point on the obstacle. */
  pb: Vec2;
}

export function worldOutline(v: DerivedVehicle, s: VehicleState, mirrors: boolean): Polygon[] {
  return collisionOutline(v, mirrors).map((poly) => transformPolygon(poly, s));
}

export function checkClearance(outlineWorld: Polygon[], scene: Scene): Clearance | null {
  let best: Clearance | null = null;
  scene.obstacles.forEach((o, i) => {
    if (!isCollidable(o.kind)) return;
    for (const part of outlineWorld) {
      const r = polygonDistance(part, o.polygon);
      if (!best || r.distance < best.distance) best = { distance: r.distance, obstacleIndex: i, pa: r.pa, pb: r.pb };
    }
  });
  return best;
}

export function isParked(bodyWorld: Polygon, scene: Scene, speed: number): boolean {
  return speed === 0 && polygonInsideConvex(bodyWorld, scene.target);
}

/**
 * Gap from the body to each long side of the target, named by the car's own left and right, plus heading
 * error against the long axis (the longer side of the bounding box: targets are axis-aligned rectangles in v1).
 */
export function parkedOffsets(bodyWorld: Polygon, s: VehicleState, scene: Scene): { left: number; right: number; headingErrorDeg: number } {
  const t = boundsOf([scene.target]);
  const b = boundsOf([bodyWorld]);
  const alongX = t.maxX - t.minX >= t.maxY - t.minY;
  const gapMax = alongX ? t.maxY - b.maxY : t.maxX - b.maxX;
  const gapMin = alongX ? b.minY - t.minY : b.minX - t.minX;
  // The car's left normal is (-sin θ, cos θ); it points at the max side when its lateral component is positive.
  const leftIsMax = (alongX ? Math.cos(s.theta) : -Math.sin(s.theta)) > 0;
  const axis = alongX ? 0 : Math.PI / 2;
  let err = (s.theta - axis) % Math.PI;
  if (err > Math.PI / 2) err -= Math.PI;
  if (err < -Math.PI / 2) err += Math.PI;
  return { left: leftIsMax ? gapMax : gapMin, right: leftIsMax ? gapMin : gapMax, headingErrorDeg: (err * 180) / Math.PI };
}
