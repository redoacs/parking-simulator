export interface Source {
  url: string;
  accessed: string;
  note?: string;
}

export interface Cited<T> {
  value: T;
  source: Source;
}

export type TurningCircleKind = 'kerb' | 'wall';

export interface TurningCircle {
  diameter: number;
  kind: TurningCircleKind;
}

export interface VehicleSpec {
  id: string;
  name: string;
  market: string;
  modelYear: number;
  length: Cited<number>;
  widthBody: Cited<number>;
  widthMirrors: Cited<number>;
  height: Cited<number>;
  wheelbase: Cited<number>;
  frontOverhang: Cited<number>;
  rearOverhang: Cited<number>;
  trackFront: Cited<number>;
  trackRear: Cited<number>;
  turningCircle: Cited<TurningCircle>;
  tireWidth: Cited<number>;
  wheelDiameter: Cited<number>;
  /** Distance from rear axle to mirror housing centre, vehicle frame. */
  mirrorLongitudinal: Cited<number>;
  mirrorLength: Cited<number>;
}

export const NUMERIC_FIELDS = [
  'length',
  'widthBody',
  'widthMirrors',
  'height',
  'wheelbase',
  'frontOverhang',
  'rearOverhang',
  'trackFront',
  'trackRear',
  'tireWidth',
  'wheelDiameter',
  'mirrorLongitudinal',
  'mirrorLength',
] as const;

export type NumericField = (typeof NUMERIC_FIELDS)[number];

export type VehicleDims = { [K in NumericField]: number } & { turningCircle: TurningCircle };

export function dimsOf(spec: VehicleSpec): VehicleDims {
  const out = {} as Record<NumericField, number>;
  for (const f of NUMERIC_FIELDS) out[f] = spec[f].value;
  return { ...out, turningCircle: spec.turningCircle.value };
}

export function isUnverified(c: Cited<unknown>): boolean {
  return (c.source.note ?? '').startsWith('unverified');
}
