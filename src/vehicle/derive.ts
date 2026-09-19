import { type Polygon, rect, rectCentered } from '../geom/polygon';
import { vec, type Vec2 } from '../geom/vec2';
import { steerFromTurningCircle } from '../geom/turning';
import { dimsOf, type VehicleDims, type VehicleSpec } from './types';

export interface Wheel {
  hub: Vec2;
  steered: boolean;
  /** Wheel-local rectangle centred at the origin, +x forward. */
  outline: Polygon;
}

export interface DerivedVehicle {
  spec: VehicleSpec;
  dims: VehicleDims;
  maxSteer: number;
  /** Body footprint, vehicle frame (origin rear-axle centre, +x forward, +y left). Rectangle: conservative. */
  body: Polygon;
  /** [left, right] */
  mirrors: [Polygon, Polygon];
  wheels: Wheel[];
}

export function deriveVehicle(spec: VehicleSpec): DerivedVehicle {
  const d = dimsOf(spec);
  const halfW = d.widthBody / 2;
  const body = rect(-d.rearOverhang, -halfW, d.wheelbase + d.frontOverhang, halfW);
  const mx0 = d.mirrorLongitudinal - d.mirrorLength / 2;
  const mx1 = d.mirrorLongitudinal + d.mirrorLength / 2;
  const mirrors: [Polygon, Polygon] = [rect(mx0, halfW, mx1, d.widthMirrors / 2), rect(mx0, -d.widthMirrors / 2, mx1, -halfW)];
  const wheelOutline = rectCentered(0, 0, d.wheelDiameter, d.tireWidth);
  const wheels: Wheel[] = [
    { hub: vec(d.wheelbase, d.trackFront / 2), steered: true, outline: wheelOutline },
    { hub: vec(d.wheelbase, -d.trackFront / 2), steered: true, outline: wheelOutline },
    { hub: vec(0, d.trackRear / 2), steered: false, outline: wheelOutline },
    { hub: vec(0, -d.trackRear / 2), steered: false, outline: wheelOutline },
  ];
  return { spec, dims: d, maxSteer: steerFromTurningCircle(d), body, mirrors, wheels };
}

export function collisionOutline(v: DerivedVehicle, mirrors: boolean): Polygon[] {
  return mirrors ? [v.body, v.mirrors[0], v.mirrors[1]] : [v.body];
}
