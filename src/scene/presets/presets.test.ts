import { describe, expect, it } from 'vitest';
import { PRESETS, getPreset, defaultParams, clampParams } from './index';
import { isConvex, signedArea, transformPolygon, boundsOf } from '../../geom/polygon';
import { convexPenetration, polygonDistance } from '../../geom/distance';
import { isCollidable } from '../types';
import taos from '../../vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from '../../vehicle/validate';
import { deriveVehicle, collisionOutline } from '../../vehicle/derive';

const vehicle = deriveVehicle(validateVehicleSpec(taos));

/** Every combination of each param at min and max, plus the defaults. */
function paramGrid(def: (typeof PRESETS)[number]): Record<string, number>[] {
  let combos: Record<string, number>[] = [{}];
  for (const p of def.params) {
    combos = combos.flatMap((c) => [
      { ...c, [p.key]: p.min },
      { ...c, [p.key]: p.max },
    ]);
  }
  return [defaultParams(def), ...combos];
}

describe.each(PRESETS.map((p) => [p.id, p] as const))('preset %s', (_id, def) => {
  it.each(paramGrid(def).map((p, i) => [i, p] as const))('is valid for param set %i', (_i, params) => {
    const scene = def.build(params);
    // Since v1.2 every scene starts with the car pointing up the screen, so up/down match forward/reverse.
    expect(scene.start.theta).toBeCloseTo(Math.PI / 2, 12);
    expect(isConvex(scene.target)).toBe(true);
    for (const o of scene.obstacles) {
      expect(isConvex(o.polygon)).toBe(true);
      expect(signedArea(o.polygon)).toBeGreaterThan(0);
      expect(o.height).toBeGreaterThanOrEqual(0);
    }
    const solid = scene.obstacles.filter((o) => isCollidable(o.kind));
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        expect(convexPenetration(solid[i]!.polygon, solid[j]!.polygon)).toBe(0);
      }
    }
    // start pose has positive clearance for the Taos with mirrors
    const outline = collisionOutline(vehicle, true).map((poly) => transformPolygon(poly, scene.start));
    for (const o of solid) {
      for (const part of outline) expect(polygonDistance(part, o.polygon).distance).toBeGreaterThan(0);
    }
    // everything lies inside bounds
    const all = boundsOf([scene.target, ...scene.obstacles.map((o) => o.polygon), ...outline]);
    expect(all.minX).toBeGreaterThanOrEqual(scene.bounds.minX);
    expect(all.minY).toBeGreaterThanOrEqual(scene.bounds.minY);
    expect(all.maxX).toBeLessThanOrEqual(scene.bounds.maxX);
    expect(all.maxY).toBeLessThanOrEqual(scene.bounds.maxY);
  });
});

describe('registry', () => {
  it('has three presets with unique ids', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['parallel', 'perpendicular', 'garage']);
    expect(getPreset('garage')?.name).toMatch(/garage/i);
    expect(getPreset('nope')).toBeUndefined();
  });
  it('clampParams clamps, fills defaults, drops unknown keys', () => {
    const def = getPreset('parallel')!;
    const out = clampParams(def, { spotLength: 99, bogus: 1 });
    expect(out.spotLength).toBe(def.params.find((p) => p.key === 'spotLength')!.max);
    expect(out.laneWidth).toBe(def.params.find((p) => p.key === 'laneWidth')!.default);
    expect('bogus' in out).toBe(false);
  });
});

describe('optional scene features (spec §2)', () => {
  const kinds = (id: string, overrides: Record<string, number>): string[] => {
    const def = getPreset(id)!;
    return def.build({ ...defaultParams(def), ...overrides }).obstacles.map((o) => o.kind);
  };
  it('parallel: kerb flag defaults on; kerb: 0 removes the kerb obstacle', () => {
    expect(kinds('parallel', {}).filter((k) => k === 'kerb')).toHaveLength(1);
    expect(kinds('parallel', { kerb: 0 })).not.toContain('kerb');
  });
  it('perpendicular: neighbours flag defaults on; neighbours: 0 removes both neighbour cars', () => {
    expect(kinds('perpendicular', {}).filter((k) => k === 'car')).toHaveLength(2);
    expect(kinds('perpendicular', { neighbours: 0 })).not.toContain('car');
  });
});

describe('v1.1 preset fixes', () => {
  it('perpendicular: neighbour cars stay behind the bay line in the shortest bay', () => {
    const def = getPreset('perpendicular')!;
    const scene = def.build({ ...defaultParams(def), bayDepth: 4.5 });
    const cars = scene.obstacles.filter((o) => o.kind === 'car');
    expect(cars).toHaveLength(2);
    // The bay line is one end of the target's depth, which end depending on which way the scene was turned, so require
    // the neighbours to stay within the target's depth at both ends.
    const carDepth = boundsOf(cars.map((c) => c.polygon));
    const bay = boundsOf([scene.target]);
    expect(carDepth.minX).toBeGreaterThanOrEqual(bay.minX);
    expect(carDepth.maxX).toBeLessThanOrEqual(bay.maxX);
  });
  it('garage: clampParams reports the door and driveway widths the scene is built with', () => {
    const def = getPreset('garage')!;
    const out = clampParams(def, { ...defaultParams(def), doorWidth: 3.0, interiorWidth: 2.6, drivewayWidth: 2.5 });
    expect(out.doorWidth).toBe(2.6);
    expect(out.drivewayWidth).toBe(2.6);
    // Already-consistent params pass through untouched.
    expect(clampParams(def, defaultParams(def))).toEqual(defaultParams(def));
  });
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: clampParams is idempotent on every grid point of each param pair', (_id, def) => {
    // A hash written from clamped params must decode to the same scene.
    const values = (p: (typeof def.params)[number]): number[] => {
      const out: number[] = [];
      for (let i = 0; p.min + i * p.step <= p.max + 1e-9; i++) out.push(p.min + i * p.step);
      return out;
    };
    for (const a of def.params) {
      for (const b of def.params) {
        if (a.key >= b.key) continue;
        for (const va of values(a)) {
          for (const vb of values(b)) {
            const once = clampParams(def, { ...defaultParams(def), [a.key]: va, [b.key]: vb });
            expect(clampParams(def, once)).toEqual(once);
          }
        }
      }
    }
  });
});
