import { NUMERIC_FIELDS, type Cited, type Source, type VehicleSpec, dimsOf } from './types';
import { minimumTurningDiameter } from '../geom/turning';

export class VehicleSpecError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`vehicle spec field "${field}": ${message}`);
    this.name = 'VehicleSpecError';
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function readSource(field: string, raw: unknown): Source {
  if (!isRecord(raw)) throw new VehicleSpecError(field, 'missing source');
  if (typeof raw.url !== 'string' || raw.url.length === 0) throw new VehicleSpecError(field, 'source.url required');
  if (typeof raw.accessed !== 'string') throw new VehicleSpecError(field, 'source.accessed required');
  const s: Source = { url: raw.url, accessed: raw.accessed };
  if (typeof raw.note === 'string') s.note = raw.note;
  return s;
}

function readCitedNumber(obj: Record<string, unknown>, field: string): Cited<number> {
  const raw = obj[field];
  if (!isRecord(raw)) throw new VehicleSpecError(field, 'missing');
  const v = raw.value;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new VehicleSpecError(field, 'value must be a positive finite number');
  return { value: v, source: readSource(field, raw.source) };
}

function readString(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.length === 0) throw new VehicleSpecError(field, 'must be a non-empty string');
  return v;
}

export function validateVehicleSpec(raw: unknown): VehicleSpec {
  if (!isRecord(raw)) throw new VehicleSpecError('<root>', 'not an object');
  const nums = {} as Record<(typeof NUMERIC_FIELDS)[number], Cited<number>>;
  for (const f of NUMERIC_FIELDS) nums[f] = readCitedNumber(raw, f);

  const tcRaw = raw.turningCircle;
  if (!isRecord(tcRaw) || !isRecord(tcRaw.value)) throw new VehicleSpecError('turningCircle', 'missing');
  const diameter = tcRaw.value.diameter;
  const kind = tcRaw.value.kind;
  if (typeof diameter !== 'number' || !Number.isFinite(diameter) || diameter <= 0) throw new VehicleSpecError('turningCircle', 'diameter must be positive');
  if (kind !== 'kerb' && kind !== 'wall') throw new VehicleSpecError('turningCircle', `kind must be "kerb" or "wall", got ${String(kind)}`);

  const modelYear = raw.modelYear;
  if (typeof modelYear !== 'number' || !Number.isInteger(modelYear)) throw new VehicleSpecError('modelYear', 'must be an integer');

  const spec: VehicleSpec = {
    id: readString(raw, 'id'),
    name: readString(raw, 'name'),
    market: readString(raw, 'market'),
    modelYear,
    ...nums,
    turningCircle: { value: { diameter, kind }, source: readSource('turningCircle', tcRaw.source) },
  };

  const sum = spec.wheelbase.value + spec.frontOverhang.value + spec.rearOverhang.value;
  if (Math.abs(sum - spec.length.value) > 0.01) {
    throw new VehicleSpecError('length', `wheelbase + overhangs = ${sum.toFixed(3)} but length = ${spec.length.value}`);
  }
  if (spec.widthMirrors.value < spec.widthBody.value) throw new VehicleSpecError('widthMirrors', 'must be >= widthBody');
  if (spec.trackFront.value >= spec.widthBody.value) throw new VehicleSpecError('trackFront', 'must be < widthBody');
  if (spec.trackRear.value >= spec.widthBody.value) throw new VehicleSpecError('trackRear', 'must be < widthBody');
  const minDiameter = minimumTurningDiameter(dimsOf(spec));
  if (spec.turningCircle.value.diameter <= minDiameter) {
    throw new VehicleSpecError('turningCircle', `diameter ${spec.turningCircle.value.diameter} m is not feasible for a ${spec.turningCircle.value.kind} reference point; must exceed ${minDiameter.toFixed(3)} m`);
  }
  return spec;
}
