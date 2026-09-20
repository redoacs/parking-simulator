import { describe, expect, it } from 'vitest';
import { rect } from '../geom/polygon';
import { checkClearance, worldOutline } from '../geom/clearance';
import type { Scene } from '../scene/types';
import { getPreset, defaultParams } from '../scene/presets';
import { deriveVehicle } from '../vehicle/derive';
import { validateVehicleSpec } from '../vehicle/validate';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { SIM_DT, simParamsFor } from '../sim/model';
import { commandsFor } from './controls';
import { targetGeometry } from './goal';
import { validateManeuver } from './validate';
const v = deriveVehicle(validateVehicleSpec(taos)),
  sp = simParamsFor(v);
const stop = [{ input: { speed: 0, steer: 0 }, steps: 1 }];
const offset = (v.dims.wheelbase + v.dims.frontOverhang - v.dims.rearOverhang) / 2;
const open: Scene = {
  bounds: { minX: -20, minY: -20, maxX: 20, maxY: 20 },
  drivingArea: [{ minX: -20, minY: -20, maxX: 20, maxY: 20 }],
  parkingHeadings: [0],
  obstacles: [],
  target: rect(offset - 2.4, -1.1, offset + 2.4, 1.1),
  start: { x: 0, y: 0, theta: 0, steer: 0, speed: 0 },
};

describe('authoritative control replay', () => {
  it('replays a straight garage entry including fractional final tick and stops centred', () => {
    const preset = getPreset('garage')!,
      scene = preset.build(defaultParams(preset)),
      g = targetGeometry(scene, v);
    const distance = g.y - g.bodyOffset - scene.start.y;
    const plan = validateManeuver(commandsFor([{ steer: 0, distance }], 0, sp), scene, v, true)!;
    expect(plan).not.toBeNull();
    expect(plan.distance).toBeCloseTo(distance, 9);
    expect(plan.states.at(-1)!.speed).toBe(0);
    expect(plan.states.at(-1)!.y).toBeCloseTo(g.y - g.bodyOffset, 9);
    const sampled = Math.min(...plan.states.map((s) => checkClearance(worldOutline(v, s, true), scene)!.distance));
    expect(plan.clearance).toBeLessThan(sampled);
    expect(plan.clearance).toBeCloseTo(sampled - SIM_DT / 2, 9);
  });
  it('detects an obstacle crossed between coarse route endpoints', () => {
    const scene = { ...open, target: rect(offset + 8 - 2.4, -1.1, offset + 8 + 2.4, 1.1) };
    const commands = commandsFor([{ steer: 0, distance: 8 }], 0, sp);
    expect(validateManeuver(commands, scene, v, true)).not.toBeNull();
    const blocked = { ...scene, obstacles: [{ kind: 'wall' as const, height: 1, polygon: rect(5, -3, 5.01, 3) }] };
    expect(checkClearance(worldOutline(v, scene.start, true), blocked)!.distance).toBeGreaterThan(0);
    expect(checkClearance(worldOutline(v, { ...scene.start, x: 8 }, true), blocked)!.distance).toBeGreaterThan(0);
    expect(validateManeuver(commands, blocked, v, true)).toBeNull();
  });
  it('enforces mirrors even when the parked body fits', () => {
    const scene = { ...open, obstacles: [{ kind: 'wall' as const, height: 1, polygon: rect(-5, 1, 10, 1.2) }] };
    expect(validateManeuver(stop, scene, v, false)).not.toBeNull();
    expect(validateManeuver(stop, scene, v, true)).toBeNull();
  });
  it('rejects the opposite heading when the scene allows one direction only', () => {
    const scene = { ...open, start: { ...open.start, x: 2 * offset, theta: Math.PI } };
    expect(validateManeuver(stop, { ...scene, parkingHeadings: [Math.PI] }, v, true)).not.toBeNull();
    expect(validateManeuver(stop, scene, v, true)).toBeNull();
  });
  it('requires settled steering before motion, even when the resulting tiny arc would park', () => {
    const moving = [{ input: { speed: 1, steer: sp.maxSteer }, steps: 1 }, ...stop];
    expect(validateManeuver([{ input: { speed: 1, steer: 0 }, steps: 1 }, ...stop], open, v, true)).not.toBeNull();
    expect(validateManeuver(moving, open, v, true)).toBeNull();
  });
  it('rejects non-finite controls and unbounded replay lengths', () => {
    for (const command of [
      { input: { speed: NaN, steer: 0 }, steps: 1 },
      { input: { speed: 0, steer: Infinity }, steps: 1 },
      { input: { speed: 0, steer: 0 }, steps: Infinity },
      { input: { speed: 0, steer: 0 }, steps: 22000 },
    ])
      expect(validateManeuver([command], open, v, true)).toBeNull();
  });
  it('rejects a parked body far from the middle of an oversized target', () => {
    expect(validateManeuver(stop, open, v, true)).not.toBeNull();
    expect(validateManeuver(stop, { ...open, target: rect(-5, -2, 10, 2) }, v, true)).toBeNull();
  });
});
