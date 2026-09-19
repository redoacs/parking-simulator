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

/** Target long axis: the longer side of its bounding box (targets are axis-aligned rectangles in v1). */
export function parkedOffsets(s: VehicleState, scene: Scene): { lateral: number; headingErrorDeg: number } {
  const b = boundsOf([scene.target]);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const alongX = b.maxX - b.minX >= b.maxY - b.minY;
  const lateral = alongX ? s.y - cy : -(s.x - cx);
  const axis = alongX ? 0 : Math.PI / 2;
  let err = (s.theta - axis) % Math.PI;
  if (err > Math.PI / 2) err -= Math.PI;
  if (err < -Math.PI / 2) err += Math.PI;
  return { lateral, headingErrorDeg: (err * 180) / Math.PI };
}
