import { describe, expect, it } from 'vitest';
import taos from './data/taos-trendline-mx-2025.json';
import { validateVehicleSpec, VehicleSpecError } from './validate';
import { dimsOf, isUnverified } from './types';

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
});
