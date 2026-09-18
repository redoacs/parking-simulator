import { describe, expect, it } from 'vitest';
import { rect } from './polygon';
import { checkClearance, isParked, parkedOffsets, worldOutline } from './clearance';
import type { Scene } from '../scene/types';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from '../vehicle/validate';
import { deriveVehicle } from '../vehicle/derive';

const v = deriveVehicle(validateVehicleSpec(taos));
const scene: Scene = {
  bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  obstacles: [
    { kind: 'wall', height: 2, polygon: rect(5, -5, 5.2, 5) },
    { kind: 'line', height: 0, polygon: rect(4, -5, 4.1, 5) }, // must be ignored
    { kind: 'car', height: 1.6, polygon: rect(-8, -8, -6, -6) },
  ],
  target: rect(-3, -1.2, 3, 1.2),
  start: { x: 0, y: 0, theta: 0, steer: 0, speed: 0 },
};

describe('checkClearance', () => {
  it('reports the nearest collidable obstacle and closest points', () => {
    const s = { x: 0, y: 0, theta: 0, steer: 0, speed: 0 };
    const c = checkClearance(worldOutline(v, s, false), scene)!;
    const front = v.dims.wheelbase + v.dims.frontOverhang;
    expect(c.obstacleIndex).toBe(0);
    expect(c.distance).toBeCloseTo(5 - front, 9);
    expect(c.pa.x).toBeCloseTo(front, 9);
    expect(c.pb.x).toBeCloseTo(5, 9);
  });
  it('goes negative on contact', () => {
    const s = { x: 2, y: 0, theta: 0, steer: 0, speed: 0 };
    expect(checkClearance(worldOutline(v, s, false), scene)!.distance).toBeLessThan(0);
  });
  it('mirrors reduce lateral clearance', () => {
    const s = { x: 3, y: 0, theta: Math.PI / 2, steer: 0, speed: 0 }; // heading +y, wall 1.08 m to the right (+x)
    const without = checkClearance(worldOutline(v, s, false), scene)!.distance;
    const withM = checkClearance(worldOutline(v, s, true), scene)!.distance;
    expect(withM).toBeLessThan(without);
    expect(without - withM).toBeCloseTo((v.dims.widthMirrors - v.dims.widthBody) / 2, 9);
  });
  it('returns null with no collidable obstacles', () => {
    expect(checkClearance([rect(0, 0, 1, 1)], { ...scene, obstacles: [scene.obstacles[1]!] })).toBeNull();
  });
});

describe('isParked / parkedOffsets', () => {
  it('parked when body is inside the target and stopped', () => {
    const s = { x: -1.5, y: 0, theta: 0, steer: 0, speed: 0 };
    const body = worldOutline(v, s, false)[0]!;
    expect(isParked(body, scene, 0)).toBe(true);
    expect(isParked(body, scene, 0.1)).toBe(false);
  });
  it('not parked when poking out', () => {
    const body = worldOutline(v, { x: 1.5, y: 0, theta: 0, steer: 0, speed: 0 }, false)[0]!;
    expect(isParked(body, scene, 0)).toBe(false);
  });
  it('offsets measure lateral shift and heading error against the long axis', () => {
    const o = parkedOffsets({ x: -1, y: 0.2, theta: 0.05, steer: 0, speed: 0 }, scene);
    expect(o.lateral).toBeCloseTo(0.2, 9);
    expect(o.headingErrorDeg).toBeCloseTo((0.05 * 180) / Math.PI, 9);
    const rev = parkedOffsets({ x: -1, y: -0.2, theta: Math.PI + 0.05, steer: 0, speed: 0 }, scene);
    expect(rev.lateral).toBeCloseTo(-0.2, 9);
    expect(rev.headingErrorDeg).toBeCloseTo((0.05 * 180) / Math.PI, 9);
  });
});
