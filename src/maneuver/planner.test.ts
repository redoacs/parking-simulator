import { expect, it, vi } from 'vitest';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { deriveVehicle } from '../vehicle/derive';
import { validateVehicleSpec } from '../vehicle/validate';
import { PRESETS, defaultParams } from '../scene/presets';
import { planManeuver } from './planner';
import { boundsOf } from '../geom/polygon';
import { checkClearance, worldOutline } from '../geom/clearance';
import * as replay from './validate';
const v = deriveVehicle(validateVehicleSpec(taos));
const cases: [string, string, Record<string, number>, ('centered' | 'adjusted')?][] = [
  ['garage-default', 'garage', {}, 'centered'],
  ['garage-default-mirrors-off', 'garage', {}, 'centered'],
  ['parallel-mirrors-off', 'parallel', {}, 'centered'],
  ['perpendicular-mirrors-off', 'perpendicular', {}, 'centered'],
  ['garage-side-mirrors-off', 'garage', { approachAngle: 90 }, 'centered'],
  ['parallel-no-kerb', 'parallel', { kerb: 0 }, 'centered'],
  ['parallel-no-kerb-mirrors-off', 'parallel', { kerb: 0 }, 'centered'],
  ['parallel-overhang', 'parallel', { spotWidth: 2 }, 'adjusted'],
  ['perpendicular-no-neighbours', 'perpendicular', { neighbours: 0 }, 'centered'],
  ['perpendicular-no-neighbours-mirrors-off', 'perpendicular', { neighbours: 0 }, 'centered'],
  ['garage-wide-drive', 'garage', { drivewayWidth: 4, interiorWidth: 2.6 }],
  ['garage-narrow-drive', 'garage', { drivewayWidth: 2.5, interiorWidth: 4 }],
  ['perpendicular-min', 'perpendicular', { bayWidth: 2.3, bayDepth: 4.5, aisleWidth: 5 }],
  ['parallel-narrow-lane', 'parallel', { laneWidth: 2.5 }],
  ['garage-side-tight', 'garage', { approachAngle: 90, doorWidth: 2.2, interiorWidth: 2.6, interiorDepth: 5, drivewayWidth: 3 }],
  ['parallel-default', 'parallel', {}, 'centered'],
  ['perpendicular-default', 'perpendicular', {}, 'centered'],
  ['parallel-tight', 'parallel', { spotLength: 5.5, spotWidth: 2.3, laneWidth: 3 }],
  ['parallel-min', 'parallel', { spotLength: 5, spotWidth: 2, laneWidth: 2.5 }],
  ['parallel-spacious', 'parallel', { spotLength: 8, spotWidth: 3, laneWidth: 5 }],
  ['perpendicular-tight', 'perpendicular', { bayWidth: 2.3, bayDepth: 4.7, aisleWidth: 5 }],
  ['perpendicular-spacious', 'perpendicular', { bayWidth: 3.2, bayDepth: 6, aisleWidth: 8 }],
  ['garage-tight', 'garage', { doorWidth: 2.2, interiorWidth: 2.6, interiorDepth: 5, drivewayWidth: 2.5, drivewayLength: 3 }],
  ['garage-side', 'garage', { approachAngle: 90 }, 'centered'],
  ['garage-side-wide', 'garage', { approachAngle: 90, doorWidth: 3, interiorWidth: 4, drivewayWidth: 4, drivewayLength: 8 }],
];
for (const [name, id, overrides, expected] of cases)
  it(
    name,
    () => {
      const preset = PRESETS.find((p) => p.id === id)!;
      const p = { ...defaultParams(preset), ...overrides };
      const scene = preset.build(p),
        mirrors = !name.includes('mirrors-off');
      const result = planManeuver(scene, v, mirrors, 100000, 60000);
      if (name.endsWith('-min')) {
        expect(result.expanded).toBeLessThanOrEqual(100000);
      } else expect(result.status).toBe('found');
      if (result.status === 'found') {
        const m = result.maneuver;
        expect(m.states[0]).toEqual(scene.start);
        expect(m.clearance).toBeGreaterThanOrEqual(0.01);
        expect(m.states.at(-1)!.speed).toBe(0);
        expect(m.states.at(-1)!.steer).toBeCloseTo(0, 10);
        expect(m.distance).toBeGreaterThan(0);
        expect(m.commands.reduce((sum, c) => sum + c.steps, 0)).toBe(m.states.length - 1);
        const parts = worldOutline(v, m.states.at(-1)!, mirrors),
          box = boundsOf(parts),
          bay = boundsOf([scene.target]);
        const measured = Math.min(
          box.minX - bay.minX,
          bay.maxX - box.maxX,
          box.minY - bay.minY,
          bay.maxY - box.maxY,
          checkClearance(parts, scene)!.distance,
        );
        expect(m.parkedMargin).toBeCloseTo(measured, 10);
        if (name === 'parallel-overhang') {
          expect(m.parkedMargin).toBeCloseTo(-0.116166, 5);
        }
        if (expected) {
          expect(m.placement).toBe(expected);
          expect(result.reason).toBe('target');
        }
        if (expected === 'centered') {
          expect(m.centerOffset).toBeLessThan(0.001);
          expect(m.parkedMargin).toBeCloseTo(
            Math.min((bay.maxX - bay.minX - box.maxX + box.minX) / 2, (bay.maxY - bay.minY - box.maxY + box.minY) / 2),
            6,
          );
        }
      } else expect(result.status).toBe('limit');
    },
    120000,
  );

it('bounds an unfinished search by nodes and time without claiming impossibility', () => {
  const p = PRESETS[0]!,
    scene = p.build(defaultParams(p));
  expect(planManeuver(scene, v, true, 0, 60000)).toEqual({ status: 'limit', expanded: 0, reason: 'expansions' });
  expect(planManeuver(scene, v, true, 100000, 0)).toEqual({ status: 'limit', expanded: 0, reason: 'time' });
});

it('continues to another candidate after an improving route fails authoritative replay', () => {
  const p = PRESETS.find((p) => p.id === 'garage')!,
    scene = p.build(defaultParams(p));
  const validator = vi.spyOn(replay, 'validateManeuver').mockImplementationOnce(() => null);
  try {
    const result = planManeuver(scene, v, true);
    expect(validator.mock.calls.length).toBeGreaterThan(1);
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.maneuver.placement).toBe('centered');
      expect(result.maneuver.parkedMargin).toBeCloseTo(0.451, 6);
    }
  } finally {
    validator.mockRestore();
  }
});

it('retains its validated fallback at the budget when subsequent candidates fail replay', () => {
  const p = PRESETS.find((p) => p.id === 'garage')!,
    scene = p.build(defaultParams(p));
  // Already legally parked, 10 cm before the bay center. Later replay rejection must not erase it.
  scene.start = { x: 1.5, y: 1.3245, theta: Math.PI / 2, speed: 0, steer: 0 };
  const validate = replay.validateManeuver;
  const validator = vi
    .spyOn(replay, 'validateManeuver')
    .mockImplementation(() => null)
    .mockImplementationOnce(validate);
  try {
    const result = planManeuver(scene, v, true, 1, 60000);
    expect(validator.mock.calls.length).toBeGreaterThan(1);
    expect(result.status).toBe('found');
    expect(result.reason).toBe('expansions');
    if (result.status === 'found') {
      expect(result.maneuver.placement).toBe('bestFound');
      expect(result.maneuver.centerOffset).toBeCloseTo(0.1, 8);
      expect(result.maneuver.clearance).toBeGreaterThanOrEqual(0.01);
    }
  } finally {
    validator.mockRestore();
  }
});
