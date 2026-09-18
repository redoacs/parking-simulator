import { describe, expect, it } from 'vitest';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from '../vehicle/validate';
import { deriveVehicle } from '../vehicle/derive';
import { guideCircles, instantaneousCentre } from './turning';

const v = deriveVehicle(validateVehicleSpec(taos));
const d = v.dims;

describe('instantaneousCentre', () => {
  it('is null when steering is centred', () => {
    expect(instantaneousCentre({ x: 0, y: 0, theta: 0, steer: 0, speed: 0 }, d.wheelbase)).toBeNull();
  });
  it('lies to the left at +y for positive steer, heading +x', () => {
    const c = instantaneousCentre({ x: 1, y: 2, theta: 0, steer: 0.5, speed: 0 }, d.wheelbase)!;
    expect(c.x).toBeCloseTo(1, 12);
    expect(c.y).toBeCloseTo(2 + d.wheelbase / Math.tan(0.5), 12);
  });
  it('rotates with heading', () => {
    const c = instantaneousCentre({ x: 0, y: 0, theta: Math.PI / 2, steer: 0.5, speed: 0 }, d.wheelbase)!;
    expect(c.x).toBeCloseTo(-d.wheelbase / Math.tan(0.5), 12);
    expect(c.y).toBeCloseTo(0, 12);
  });
});

describe('guideCircles', () => {
  it('at max steer the outer front wheel circle matches the quoted turning circle', () => {
    const g = guideCircles({ x: 0, y: 0, theta: 0, steer: v.maxSteer, speed: 0 }, v);
    const outer = g.find((c) => c.kind === 'outerFront')!;
    expect(outer.radius * 2).toBeCloseTo(d.turningCircle.diameter, 9);
  });
  it('orders radii innerRear < outerFront < outerCorner', () => {
    const g = guideCircles({ x: 0, y: 0, theta: 0, steer: -0.4, speed: 0 }, v);
    const r = Object.fromEntries(g.map((c) => [c.kind, c.radius]));
    expect(r.innerRear).toBeLessThan(r.outerFront!);
    expect(r.outerFront).toBeLessThan(r.outerCorner!);
  });
  it('is empty below the threshold', () => {
    expect(guideCircles({ x: 0, y: 0, theta: 0, steer: 0.001, speed: 0 }, v)).toEqual([]);
  });
});
