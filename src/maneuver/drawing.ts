import { rectFromSegment } from '../geom/polygon';
import type { ColoredPolygon, RGBA } from '../render/polygons';
import { COLORS, vehiclePolygons } from '../render/scenePolys';
import type { VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';
import type { Maneuver } from './types';
const forward: RGBA = [0.35, 0.9, 1, 0.85],
  reverse: RGBA = [1, 0.55, 0.85, 0.9];
export function maneuverPath(plan: Maneuver): ColoredPolygon[] {
  const out: ColoredPolygon[] = [];
  let travelled = 0;
  for (let i = 1; i < plan.states.length; i++) {
    const a = plan.states[i - 1]!,
      b = plan.states[i]!,
      d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-10) continue;
    travelled += d;
    if (b.speed < 0 && travelled % 0.3 > 0.18) continue;
    out.push({ polygon: rectFromSegment(a, b, 0.06), color: b.speed < 0 ? reverse : forward });
  }
  return out;
}
export function ghostPolygons(v: DerivedVehicle, s: VehicleState, mirrors: boolean): ColoredPolygon[] {
  return vehiclePolygons(v, s, mirrors).map((p) => ({
    ...p,
    color: p.color === COLORS.body || p.color === COLORS.mirror ? [0.8, 0.45, 1, 0.58] : p.color,
  }));
}
