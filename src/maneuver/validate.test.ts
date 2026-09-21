import { describe, expect, it } from 'vitest';
import { rect } from '../geom/polygon';
import { checkClearance, worldOutline } from '../geom/clearance';
import type { Scene } from '../scene/types';
import { getPreset, defaultParams } from '../scene/presets';
import { deriveVehicle } from '../vehicle/derive';
import { validateVehicleSpec } from '../vehicle/validate';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { SIM_DT, simParamsFor, stepVehicle } from '../sim/model';
import { commandsFor } from './controls';
import { targetGeometry } from './goal';
import { domainFor } from './domain';
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
    expect(plan.parkedMargin).toBeCloseTo((3 - v.dims.widthMirrors) / 2, 10);
    expect(plan.centerOffset).toBeLessThan(1e-10);
  });
  it('replays intervening ticks instead of checking only segment endpoints', () => {
    const scene = { ...open, target: rect(offset + 8 - 2.4, -1.1, offset + 8 + 2.4, 1.1) };
    const commands = commandsFor([{ steer: 0, distance: 8 }], 0, sp);
    expect(validateManeuver(commands, scene, v, true)).not.toBeNull();
    const blocked = { ...scene, obstacles: [{ kind: 'wall' as const, height: 1, polygon: rect(5, -3, 5.01, 3) }] };
    expect(checkClearance(worldOutline(v, scene.start, true), blocked)!.distance).toBeGreaterThan(0);
    expect(checkClearance(worldOutline(v, { ...scene.start, x: 8 }, true), blocked)!.distance).toBeGreaterThan(0);
    expect(validateManeuver(commands, blocked, v, true)).toBeNull();
  });
  it('includes turning displacement in its continuous clearance lower bound', () => {
    const start = { ...open.start, steer: sp.maxSteer };
    const end = stepVehicle(start, { speed: 1, steer: sp.maxSteer }, sp, 1);
    const cx = end.x + offset * Math.cos(end.theta),
      cy = end.y + offset * Math.sin(end.theta);
    const scene = {
      ...open,
      start,
      target: rect(cx - 3, cy - 2, cx + 3, cy + 2),
      parkingHeadings: [end.theta],
      obstacles: [{ kind: 'wall' as const, height: 1, polygon: rect(-10, -5, 10, -4) }],
    };
    const plan = validateManeuver(commandsFor([{ steer: sp.maxSteer, distance: 1 }], sp.maxSteer, sp), scene, v, true)!;
    expect(plan).not.toBeNull();
    const sampled = Math.min(...plan.states.map((s) => checkClearance(worldOutline(v, s, true), scene)!.distance));
    const radius = Math.max(...[v.body, ...v.mirrors].flat().map((p) => Math.hypot(p.x, p.y)));
    const halfTravel = (SIM_DT / 2) * (1 + (radius * Math.abs(Math.tan(sp.maxSteer))) / sp.wheelbase);
    expect(plan.clearance).toBeCloseTo(sampled - halfTravel, 9);
  });
  it('rejects a moving replay that cuts a concave road corner between legal endpoints', () => {
    const start = { ...open.start, x: -4, y: 3.5, theta: -Math.PI / 4 };
    const distance = 6 * Math.SQRT2;
    const end = stepVehicle(start, { speed: 1, steer: 0 }, sp, distance);
    const cx = end.x + offset * Math.cos(end.theta),
      cy = end.y + offset * Math.sin(end.theta);
    const scene = { ...open, start, target: rect(cx - 4, cy - 4, cx + 4, cy + 4), parkingHeadings: [start.theta] };
    const commands = commandsFor([{ steer: 0, distance }], 0, sp);
    expect(validateManeuver(commands, scene, v, true)).not.toBeNull();
    const corner = {
      ...scene,
      drivingArea: [
        { minX: -10, minY: -10, maxX: 0, maxY: 10 },
        { minX: 0, minY: -10, maxX: 10, maxY: 0 },
      ],
    };
    for (const s of [start, end]) expect(domainFor(corner, v, true).clearance(s)).toBeGreaterThan(0.01);
    expect(validateManeuver(commands, corner, v, true)).toBeNull();
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
