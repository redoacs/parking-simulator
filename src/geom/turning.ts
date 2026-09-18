import type { VehicleDims } from '../vehicle/types';

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
