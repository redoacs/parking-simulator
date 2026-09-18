import { describe, expect, it } from 'vitest';
import taos from './data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './validate';
import { deriveVehicle, collisionOutline } from './derive';
import { steerFromTurningCircle } from '../geom/turning';
import { boundsOf, signedArea } from '../geom/polygon';

const spec = validateVehicleSpec(taos);
const v = deriveVehicle(spec);
const d = v.dims;

describe('steerFromTurningCircle', () => {
  it('reproduces the quoted kerb circle at max steer', () => {
    const R = d.wheelbase / Math.tan(v.maxSteer);
    const outerFront = Math.hypot(R + d.trackFront / 2, d.wheelbase);
    expect(outerFront * 2).toBeCloseTo(d.turningCircle.diameter, 9);
  });
  it('is a plausible passenger-car lock angle', () => {
    const deg = (v.maxSteer * 180) / Math.PI;
    expect(deg).toBeGreaterThan(30);
    expect(deg).toBeLessThan(40);
  });
  it('wall variant uses the outer front body corner', () => {
    const wall = steerFromTurningCircle({ ...d, turningCircle: { diameter: 11.5, kind: 'wall' } });
    const R = d.wheelbase / Math.tan(wall);
    const corner = Math.hypot(R + d.widthBody / 2, d.wheelbase + d.frontOverhang);
    expect(corner * 2).toBeCloseTo(11.5, 9);
  });
});

describe('deriveVehicle', () => {
  it('body spans rear overhang to front overhang, full body width', () => {
    const b = boundsOf([v.body]);
    expect(b.minX).toBeCloseTo(-d.rearOverhang, 12);
    expect(b.maxX).toBeCloseTo(d.wheelbase + d.frontOverhang, 12);
    expect(b.maxX - b.minX).toBeCloseTo(d.length, 9);
    expect(b.minY).toBeCloseTo(-d.widthBody / 2, 12);
    expect(b.maxY).toBeCloseTo(d.widthBody / 2, 12);
    expect(signedArea(v.body)).toBeGreaterThan(0);
  });
  it('mirrors extend to widthMirrors', () => {
    const b = boundsOf(v.mirrors);
    expect(b.maxY).toBeCloseTo(d.widthMirrors / 2, 12);
    expect(b.minY).toBeCloseTo(-d.widthMirrors / 2, 12);
    expect(b.maxX - b.minX).toBeCloseTo(d.mirrorLength, 12);
    expect((b.maxX + b.minX) / 2).toBeCloseTo(d.mirrorLongitudinal, 12);
  });
  it('wheels sit on the axles at track width', () => {
    expect(v.wheels).toHaveLength(4);
    const front = v.wheels.filter((w) => w.steered);
    const rear = v.wheels.filter((w) => !w.steered);
    expect(front.map((w) => w.hub.x)).toEqual([d.wheelbase, d.wheelbase]);
    expect(rear.map((w) => w.hub.x)).toEqual([0, 0]);
    expect(Math.abs(front[0]!.hub.y)).toBeCloseTo(d.trackFront / 2, 12);
    expect(Math.abs(rear[0]!.hub.y)).toBeCloseTo(d.trackRear / 2, 12);
    const wb = boundsOf([front[0]!.outline]);
    expect(wb.maxX - wb.minX).toBeCloseTo(d.wheelDiameter, 12);
    expect(wb.maxY - wb.minY).toBeCloseTo(d.tireWidth, 12);
  });
  it('collisionOutline includes mirrors only when asked', () => {
    expect(collisionOutline(v, false)).toHaveLength(1);
    expect(collisionOutline(v, true)).toHaveLength(3);
  });
});
