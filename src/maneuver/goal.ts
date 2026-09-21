import { boundsOf, polygonInsideConvex, transformPolygon } from '../geom/polygon';
import type { Scene } from '../scene/types';
import type { VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';

export function targetGeometry(scene: Scene, v: DerivedVehicle) {
  const b = boundsOf([scene.target]);
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
    theta: b.maxY - b.minY > b.maxX - b.minX ? Math.PI / 2 : 0,
    bodyOffset: (v.dims.wheelbase + v.dims.frontOverhang - v.dims.rearOverhang) / 2,
  };
}
/** A tolerance region remains usable when an exact goal connection cannot fit. Collision is checked separately. */
export function isManeuverGoal(s: VehicleState, scene: Scene, v: DerivedVehicle): boolean {
  const g = targetGeometry(scene, v),
    dx = s.x + g.bodyOffset * Math.cos(s.theta) - g.x,
    dy = s.y + g.bodyOffset * Math.sin(s.theta) - g.y;
  const heading = Math.min(
    ...scene.parkingHeadings.map((theta) => Math.abs(Math.atan2(Math.sin(s.theta - theta), Math.cos(s.theta - theta)))),
  );
  return (
    heading <= (1.5 * Math.PI) / 180 + 1e-10 &&
    Math.abs(dx * Math.cos(g.theta) + dy * Math.sin(g.theta)) <= 0.25 &&
    Math.abs(-dx * Math.sin(g.theta) + dy * Math.cos(g.theta)) <= 0.15 &&
    polygonInsideConvex(transformPolygon(v.body, s), scene.target)
  );
}
