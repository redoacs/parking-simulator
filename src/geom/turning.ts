import type { VehicleDims } from '../vehicle/types';

/**
 * Max steer angle (rad) that makes the reference point trace the quoted
 * turning circle. Bicycle model: rear-axle-centre radius R = L / tan(delta).
 * Reference point at lateral offset a and longitudinal offset b from the
 * rear-axle centre traces sqrt((R + a)^2 + b^2) = D / 2.
 */
export function steerFromTurningCircle(dims: VehicleDims): number {
  const { diameter, kind } = dims.turningCircle;
  const L = dims.wheelbase;
  const a = kind === 'kerb' ? dims.trackFront / 2 : dims.widthBody / 2;
  const b = kind === 'kerb' ? L : L + dims.frontOverhang;
  const half = diameter / 2;
  const R = Math.sqrt(half * half - b * b) - a;
  return Math.atan(L / R);
}
