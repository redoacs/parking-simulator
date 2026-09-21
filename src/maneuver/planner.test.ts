import { expect, it } from 'vitest';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { deriveVehicle } from '../vehicle/derive';
import { validateVehicleSpec } from '../vehicle/validate';
import { PRESETS, defaultParams } from '../scene/presets';
import { planManeuver } from './planner';
const v = deriveVehicle(validateVehicleSpec(taos));
const cases: [string, string, Record<string, number>][] = [
  ['garage-default', 'garage', {}],
  ['parallel-mirrors-off', 'parallel', {}],
  ['perpendicular-mirrors-off', 'perpendicular', {}],
  ['garage-side-mirrors-off', 'garage', { approachAngle: 90 }],
  ['parallel-no-kerb', 'parallel', { kerb: 0 }],
  ['perpendicular-no-neighbours', 'perpendicular', { neighbours: 0 }],
  ['garage-wide-drive', 'garage', { drivewayWidth: 4, interiorWidth: 2.6 }],
  ['garage-narrow-drive', 'garage', { drivewayWidth: 2.5, interiorWidth: 4 }],
  ['perpendicular-min', 'perpendicular', { bayWidth: 2.3, bayDepth: 4.5, aisleWidth: 5 }],
  ['parallel-narrow-lane', 'parallel', { laneWidth: 2.5 }],
  ['garage-side-tight', 'garage', { approachAngle: 90, doorWidth: 2.2, interiorWidth: 2.6, interiorDepth: 5, drivewayWidth: 3 }],
  ['parallel-default', 'parallel', {}],
  ['perpendicular-default', 'perpendicular', {}],
  ['parallel-tight', 'parallel', { spotLength: 5.5, spotWidth: 2.3, laneWidth: 3 }],
  ['parallel-min', 'parallel', { spotLength: 5, spotWidth: 2, laneWidth: 2.5 }],
  ['parallel-spacious', 'parallel', { spotLength: 8, spotWidth: 3, laneWidth: 5 }],
  ['perpendicular-tight', 'perpendicular', { bayWidth: 2.3, bayDepth: 4.7, aisleWidth: 5 }],
  ['perpendicular-spacious', 'perpendicular', { bayWidth: 3.2, bayDepth: 6, aisleWidth: 8 }],
  ['garage-tight', 'garage', { doorWidth: 2.2, interiorWidth: 2.6, interiorDepth: 5, drivewayWidth: 2.5, drivewayLength: 3 }],
  ['garage-side', 'garage', { approachAngle: 90 }],
  ['garage-side-wide', 'garage', { approachAngle: 90, doorWidth: 3, interiorWidth: 4, drivewayWidth: 4, drivewayLength: 8 }],
];
for (const [name, id, overrides] of cases)
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
      } else expect(result.status).toBe('limit');
    },
    120000,
  );

it('bounds an unfinished search by nodes and time without claiming impossibility', () => {
  const p = PRESETS[0]!,
    scene = p.build(defaultParams(p));
  expect(planManeuver(scene, v, true, 0, 60000)).toEqual({ status: 'limit', expanded: 0 });
  expect(planManeuver(scene, v, true, 100000, 0)).toEqual({ status: 'limit', expanded: 0 });
});
