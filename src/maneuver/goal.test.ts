import { expect, it } from 'vitest';
import { boundsOf, rect } from '../geom/polygon';
import { worldOutline } from '../geom/clearance';
import { PRESETS, defaultParams } from '../scene/presets';
import { deriveVehicle } from '../vehicle/derive';
import { validateVehicleSpec } from '../vehicle/validate';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { compareParking, parkedQuality, targetGeometry } from './goal';

const v = deriveVehicle(validateVehicleSpec(taos));

it('pins the Taos geometry premises for a centered aligned optimum within the goal heading window', () => {
  const body = boundsOf([v.body]);
  const mirrors = boundsOf(v.mirrors);
  expect(mirrors.minX).toBeGreaterThanOrEqual(body.minX);
  expect(mirrors.maxX).toBeLessThanOrEqual(body.maxX);
  // A cos(a) + B sin(|a|) >= A when tan(|a|/2) <= B/A.
  const halfAngle = Math.tan((0.75 * Math.PI) / 180);
  expect(halfAngle).toBeLessThan(v.dims.mirrorLength / v.dims.widthMirrors);
  expect(halfAngle).toBeLessThan(v.dims.widthBody / (body.maxX - body.minX));
  expect(halfAngle).toBeLessThan((body.maxX - body.minX) / v.dims.widthBody);
});
for (const preset of PRESETS)
  for (const mirrors of [true, false])
    it(`${preset.id}, mirrors ${String(mirrors)}: centered margin attains the opposing-edge bound`, () => {
      const scene = preset.build(defaultParams(preset)),
        g = targetGeometry(scene, v),
        bay = boundsOf([scene.target]);
      for (const theta of scene.parkingHeadings) {
        const center = { x: g.x - g.bodyOffset * Math.cos(theta), y: g.y - g.bodyOffset * Math.sin(theta), theta, steer: 0, speed: 0 };
        const box = boundsOf(worldOutline(v, center, mirrors));
        const bound = Math.min((bay.maxX - bay.minX - (box.maxX - box.minX)) / 2, (bay.maxY - bay.minY - (box.maxY - box.minY)) / 2);
        expect(parkedQuality(center, scene, v, mirrors).parkedMargin).toBeCloseTo(bound, 10);
        expect(parkedQuality(center, scene, v, mirrors).centerOffset).toBeLessThan(1e-10);
        // Moving in either axis or tilting inside the allowed heading window cannot improve this bound.
        for (const delta of [-0.025, 0.025]) {
          const tilted = {
            ...center,
            theta: theta + delta,
            x: g.x - g.bodyOffset * Math.cos(theta + delta),
            y: g.y - g.bodyOffset * Math.sin(theta + delta),
          };
          for (const s of [{ ...center, x: center.x + 0.1 }, { ...center, y: center.y - 0.1 }, tilted])
            expect(parkedQuality(s, scene, v, mirrors).parkedMargin).toBeLessThanOrEqual(bound + 1e-10);
        }
      }
    });

it('favors centering on margin plateaus despite floating-point noise, with transitive buckets', () => {
  const centered = { parkedMargin: 0.451, centerOffset: 0 };
  const offCenter = { parkedMargin: 0.451 + 1e-12, centerOffset: 0.2 };
  expect(compareParking(centered, offCenter)).toBeLessThan(0);
  expect(compareParking(offCenter, centered)).toBeGreaterThan(0);
  expect(compareParking({ parkedMargin: 0.452, centerOffset: 0.2 }, centered)).toBeLessThan(0);
  const a = { parkedMargin: 0.4509997, centerOffset: 0.1 };
  const b = { parkedMargin: 0.4510001, centerOffset: 0.2 };
  expect(compareParking(centered, a)).toBeLessThan(0);
  expect(compareParking(a, b)).toBeLessThan(0);
  expect(compareParking(centered, b)).toBeLessThan(0);
});

it('counts solid obstacles, ignores painted obstacles, and reports mirror overhang as a negative edge margin', () => {
  const preset = PRESETS.find((p) => p.id === 'parallel')!;
  const scene = preset.build({ ...defaultParams(preset), spotWidth: 2 });
  const g = targetGeometry(scene, v);
  const s = { x: -1.06, y: g.y - g.bodyOffset, theta: Math.PI / 2, speed: 0, steer: 0 };
  expect(parkedQuality(s, scene, v, true).parkedMargin).toBeCloseTo(-0.109, 10);
  expect(parkedQuality(s, scene, v, false).parkedMargin).toBeCloseTo(0.0195, 10);
  const marker = { kind: 'line' as const, height: 0, polygon: rect(-0.13, s.y, -0.125, s.y + 1) };
  const clear = { ...scene, obstacles: [marker] };
  expect(parkedQuality(s, clear, v, false).parkedMargin).toBeCloseTo(0.0195, 10);
  expect(parkedQuality(s, { ...clear, obstacles: [{ ...marker, kind: 'wall' }] }, v, false).parkedMargin).toBeCloseTo(0.0095, 10);
});
