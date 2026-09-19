import type { VehicleDims } from '../vehicle/types';
import type { VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';
import { type Vec2, vec } from './vec2';

/** Lateral (a) and longitudinal (b) offsets of the turning-circle reference point from the rear-axle centre. */
function referenceOffsets(dims: VehicleDims): { a: number; b: number } {
  const L = dims.wheelbase;
  return dims.turningCircle.kind === 'kerb'
    ? { a: dims.trackFront / 2, b: L }
    : { a: dims.widthBody / 2, b: L + dims.frontOverhang };
}

/** Smallest turning-circle diameter the reference point can trace (R → 0⁺). Below this the spec is inconsistent. */
export function minimumTurningDiameter(dims: VehicleDims): number {
  const { a, b } = referenceOffsets(dims);
  return 2 * Math.hypot(a, b);
}

/**
 * Max steer angle (rad) that makes the reference point trace the quoted
 * turning circle. Bicycle model: rear-axle-centre radius R = L / tan(delta).
 * Reference point at lateral offset a and longitudinal offset b from the
 * rear-axle centre traces sqrt((R + a)^2 + b^2) = D / 2.
 */
export function steerFromTurningCircle(dims: VehicleDims): number {
  const { diameter } = dims.turningCircle;
  const min = minimumTurningDiameter(dims);
  if (!(diameter > min)) {
    throw new RangeError(`turning circle ${diameter} m is not feasible for a ${dims.turningCircle.kind} reference point; must exceed ${min.toFixed(3)} m`);
  }
  const { a, b } = referenceOffsets(dims);
  const half = diameter / 2;
  const R = Math.sqrt(half * half - b * b) - a;
  return Math.atan(dims.wheelbase / R);
}

export const GUIDE_MIN_STEER = (0.5 * Math.PI) / 180;

export type GuideKind = 'innerRear' | 'outerFront' | 'outerCorner';

export interface GuideCircle {
  center: Vec2;
  radius: number;
  kind: GuideKind;
}

/** Signed rear-axle radius (positive = turning left). */
function signedRadius(steer: number, wheelbase: number): number {
  return wheelbase / Math.tan(steer);
}

export function instantaneousCentre(s: VehicleState, wheelbase: number): Vec2 | null {
  if (Math.abs(s.steer) < GUIDE_MIN_STEER) return null;
  const R = signedRadius(s.steer, wheelbase);
  // Left normal of heading is (-sin, cos); ICR = rear axle + R * leftNormal.
  return vec(s.x - R * Math.sin(s.theta), s.y + R * Math.cos(s.theta));
}

export function guideCircles(s: VehicleState, v: DerivedVehicle): GuideCircle[] {
  const c = instantaneousCentre(s, v.dims.wheelbase);
  if (!c) return [];
  const R = Math.abs(signedRadius(s.steer, v.dims.wheelbase));
  const L = v.dims.wheelbase;
  const innerRear = R - v.dims.trackRear / 2;
  const outerFront = Math.hypot(R + v.dims.trackFront / 2, L);
  const outerCorner = Math.hypot(R + v.dims.widthBody / 2, L + v.dims.frontOverhang);
  return [
    { center: c, radius: innerRear, kind: 'innerRear' },
    { center: c, radius: outerFront, kind: 'outerFront' },
    { center: c, radius: outerCorner, kind: 'outerCorner' },
  ];
}
