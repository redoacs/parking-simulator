import { rectFromSegment, transformPolygon } from '../geom/polygon';
import type { Clearance } from '../geom/clearance';
import type { GuideCircle } from '../geom/turning';
import type { Scene, ObstacleKind } from '../scene/types';
import type { VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';
import type { ColoredPolygon, RGBA } from './polygons';
import type { RingInstance } from './renderer';

export const COLORS = {
  wall: [0.42, 0.45, 0.5, 1] as RGBA,
  kerb: [0.6, 0.56, 0.42, 1] as RGBA,
  car: [0.29, 0.33, 0.39, 1] as RGBA,
  line: [0.9, 0.91, 0.93, 0.8] as RGBA,
  targetFill: [0.24, 0.86, 0.52, 0.1] as RGBA,
  targetEdge: [0.24, 0.86, 0.52, 0.8] as RGBA,
  body: [0.23, 0.51, 0.96, 0.92] as RGBA,
  mirror: [0.38, 0.65, 0.98, 0.92] as RGBA,
  wheel: [0.08, 0.08, 0.09, 1] as RGBA,
  envelope: [1.0, 0.55, 0.1, 0.35] as RGBA,
  ok: [0.24, 0.86, 0.52, 1] as RGBA,
  warn: [0.96, 0.73, 0.26, 1] as RGBA,
  bad: [1.0, 0.36, 0.36, 1] as RGBA,
  guide: [0.9, 0.9, 1.0, 0.45] as RGBA,
} as const;

export type Band = 'ok' | 'warn' | 'bad';

export function bandFor(distance: number): Band {
  if (distance >= 0.3) return 'ok';
  if (distance >= 0.1) return 'warn';
  return 'bad';
}

const kindColor: Record<ObstacleKind, RGBA> = { wall: COLORS.wall, kerb: COLORS.kerb, car: COLORS.car, line: COLORS.line };

export function scenePolygons(scene: Scene): ColoredPolygon[] {
  const out: ColoredPolygon[] = [{ polygon: scene.target, color: COLORS.targetFill }];
  const t = scene.target;
  for (let i = 0; i < t.length; i++) out.push({ polygon: rectFromSegment(t[i]!, t[(i + 1) % t.length]!, 0.03), color: COLORS.targetEdge });
  for (const o of scene.obstacles) out.push({ polygon: o.polygon, color: kindColor[o.kind] });
  return out;
}

export function vehiclePolygons(v: DerivedVehicle, s: VehicleState, mirrors: boolean): ColoredPolygon[] {
  const out: ColoredPolygon[] = [];
  // Body first, wheels on top: in plan view every tyre lies inside the body outline,
  // so wheels drawn beneath the 0.92-alpha body would be invisible.
  out.push({ polygon: transformPolygon(v.body, s), color: COLORS.body });
  for (const w of v.wheels) {
    const local = transformPolygon(w.outline, { x: w.hub.x, y: w.hub.y, theta: w.steered ? s.steer : 0 });
    out.push({ polygon: transformPolygon(local, s), color: COLORS.wheel });
  }
  if (mirrors) for (const m of v.mirrors) out.push({ polygon: transformPolygon(m, s), color: COLORS.mirror });
  return out;
}

export function rulerPolygon(c: Clearance): ColoredPolygon | null {
  if (c.distance <= 0) return null;
  return { polygon: rectFromSegment(c.pa, c.pb, 0.04), color: COLORS[bandFor(c.distance)] };
}

export function ringInstancesFor(guides: GuideCircle[], thicknessM: number): RingInstance[] {
  return guides.map((g) => ({ center: g.center, radius: g.radius, thickness: thicknessM, color: COLORS.guide }));
}
