import { describe, expect, it } from 'vitest';
import { pointInConvex, rect, transformPolygon } from '../geom/polygon';
import type { Params, Scene } from '../scene/types';
import { PRESETS, defaultParams } from '../scene/presets';
import { deriveVehicle } from '../vehicle/derive';
import { validateVehicleSpec } from '../vehicle/validate';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { domainFor, drivingDomain, rectPolygon } from './domain';
import { validateManeuver } from './validate';
const v = deriveVehicle(validateVehicleSpec(taos));
describe('finite driving area', () => {
  it('rejects cutting a concave corner even when all car corners are individually inside the road union', () => {
    const roads = [
      { minX: -5, minY: -5, maxX: 0, maxY: 5 },
      { minX: 0, minY: -5, maxX: 5, maxY: 0 },
    ];
    const car = { ...v, body: rect(-3, -1, 3, 1) };
    const state = { x: -0.25, y: -0.25, theta: -Math.PI / 4, steer: 0, speed: 0 };
    const scene: Scene = {
      bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      drivingArea: roads,
      parkingHeadings: [0],
      obstacles: [],
      target: rect(-5, -5, 0, 0),
      start: state,
    };
    expect(transformPolygon(car.body, state).every((p) => roads.some((r) => pointInConvex(p, rectPolygon(r))))).toBe(true);
    expect(domainFor(scene, car, false).clearance(state)).toBeLessThan(0);
    expect(validateManeuver([{ input: { speed: 0, steer: 0 }, steps: 1 }], scene, car, false)).toBeNull();
  });
  for (const preset of PRESETS)
    it(`${preset.id} keeps the modeled area inside Fit bounds without tiny complement cells`, () => {
      for (const choice of ['min', 'default', 'max'] as const) {
        const params = Object.fromEntries(preset.params.map((p) => [p.key, p[choice]]));
        const scene = preset.build(params),
          d = drivingDomain(scene.drivingArea);
        for (const r of scene.drivingArea) {
          expect(r.minX).toBeGreaterThanOrEqual(scene.bounds.minX);
          expect(r.maxX).toBeLessThanOrEqual(scene.bounds.maxX);
          expect(r.minY).toBeGreaterThanOrEqual(scene.bounds.minY);
          expect(r.maxY).toBeLessThanOrEqual(scene.bounds.maxY);
        }
        for (const r of d.blocked) {
          expect(r.maxX - r.minX).toBeGreaterThan(1e-6);
          expect(r.maxY - r.minY).toBeGreaterThan(1e-6);
        }
        expect(domainFor(scene, v, true).clearance(scene.start)).toBeGreaterThan(0);
      }
    });
  it('blocks land beside the garage and driveway for both width orderings', () => {
    const preset = PRESETS.find((p) => p.id === 'garage')!;
    for (const [interiorWidth, drivewayWidth] of [
      [2.6, 4],
      [4, 2.5],
    ]) {
      const p: Params = { ...defaultParams(preset), interiorWidth: interiorWidth!, drivewayWidth: drivewayWidth! },
        scene = preset.build(p);
      const contains = (x: number, y: number) => scene.drivingArea.some((r) => pointInConvex({ x, y }, rectPolygon(r)));
      expect(contains(p.interiorWidth! / 2, -p.drivewayLength! / 2)).toBe(true);
      expect(contains(p.interiorWidth! / 2 + p.drivewayWidth! / 2 + 0.4, -p.drivewayLength! / 2)).toBe(false);
      expect(contains(p.interiorWidth! + 0.5, p.interiorDepth! / 2)).toBe(false);
    }
  });
});
