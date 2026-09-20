import { describe, expect, it } from 'vitest';
import taos from './data/taos-trendline-mx-2025.json';
import { validateVehicleSpec, VehicleSpecError } from './validate';
import { dimsOf, isUnverified, NUMERIC_FIELDS } from './types';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

describe('validateVehicleSpec', () => {
  it('accepts the Taos data', () => {
    const spec = validateVehicleSpec(taos);
    const d = dimsOf(spec);
    expect(d.wheelbase).toBe(2.689);
    expect(d.turningCircle).toEqual({ diameter: 10.7, kind: 'kerb' });
    expect(isUnverified(spec.frontOverhang)).toBe(true);
    expect(isUnverified(spec.wheelbase)).toBe(false);
  });

  it('uses explicit confidence even when note wording changes', () => {
    const raw = clone(taos);
    raw.frontOverhang.source.note = 'Una estimación';
    raw.wheelbase.source.note = 'unverified is a word in this quotation';
    const spec = validateVehicleSpec(raw);
    expect(isUnverified(spec.frontOverhang)).toBe(true);
    expect(isUnverified(spec.wheelbase)).toBe(false);
    const uncertain = ([...NUMERIC_FIELDS, 'turningCircle'] as const).filter((field) => isUnverified(spec[field])).sort();
    expect(uncertain).toEqual([
      'frontOverhang',
      'mirrorLength',
      'mirrorLongitudinal',
      'rearOverhang',
      'trackFront',
      'trackRear',
      'turningCircle',
      'widthBody',
      'widthMirrors',
    ]);
  });

  it.each([undefined, null, true, 'unknown'])('rejects invalid or missing confidence: %s', (confidence) => {
    const raw = clone(taos);
    (raw.length.source as Record<string, unknown>).confidence = confidence;
    expect(() => validateVehicleSpec(raw)).toThrow(/source.confidence/);
  });

  it('rejects a broken length identity', () => {
    const bad = clone(taos);
    bad.frontOverhang.value = 1.0;
    expect(() => validateVehicleSpec(bad)).toThrow(VehicleSpecError);
    try {
      validateVehicleSpec(bad);
    } catch (e) {
      expect((e as VehicleSpecError).field).toBe('length');
    }
  });

  it('rejects a missing source', () => {
    const bad = clone(taos) as unknown as Record<string, unknown>;
    bad.trackFront = { value: 1.572 };
    expect(() => validateVehicleSpec(bad)).toThrow(/trackFront/);
  });

  it('rejects non-positive numbers', () => {
    const bad = clone(taos);
    bad.tireWidth.value = 0;
    expect(() => validateVehicleSpec(bad)).toThrow(/tireWidth/);
  });

  it('rejects mirrors narrower than the body', () => {
    const bad = clone(taos);
    bad.widthMirrors.value = 1.8;
    expect(() => validateVehicleSpec(bad)).toThrow(/widthMirrors/);
  });

  it('rejects an unknown turning circle kind', () => {
    const bad = clone(taos) as unknown as { turningCircle: { value: { kind: string } } };
    bad.turningCircle.value.kind = 'curb';
    expect(() => validateVehicleSpec(bad)).toThrow(/turningCircle/);
  });

  it('rejects a turning circle the wheel geometry cannot trace', () => {
    const kerb = clone(taos);
    kerb.turningCircle.value.diameter = 5.5; // below 2·hypot(trackFront/2, wheelbase) ≈ 5.603
    expect(() => validateVehicleSpec(kerb)).toThrow(/turningCircle.*not feasible/);
    const wall = clone(taos) as unknown as { turningCircle: { value: { diameter: number; kind: string } } };
    wall.turningCircle.value.kind = 'wall';
    wall.turningCircle.value.diameter = 7.0; // below 2·hypot(widthBody/2, wheelbase + frontOverhang) ≈ 7.352
    expect(() => validateVehicleSpec(wall)).toThrow(/turningCircle.*not feasible/);
  });
});
