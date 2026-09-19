import { describe, expect, it } from 'vitest';
import type { Clearance } from '../geom/clearance';
import { boundsOf } from '../geom/polygon';
import { vec } from '../geom/vec2';
import { defaultParams, getPreset } from '../scene/presets';
import { deriveVehicle } from '../vehicle/derive';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from '../vehicle/validate';
import { COLORS, bandFor, rulerPolygon, scenePolygons, vehiclePolygons } from './scenePolys';

const vehicle = deriveVehicle(validateVehicleSpec(taos));
const state = { x: 3, y: 2, theta: 0.4, steer: 0.2, speed: 0 };
const clearance = (distance: number): Clearance => ({ distance, obstacleIndex: 0, pa: vec(0, 0), pb: vec(0.5, 0) });

describe('bandFor', () => {
  it('has inclusive lower edges at 0.30 m and 0.10 m', () => {
    expect(bandFor(0.3)).toBe('ok');
    expect(bandFor(0.2999)).toBe('warn');
    expect(bandFor(0.1)).toBe('warn');
    expect(bandFor(0.0999)).toBe('bad');
  });
});

describe('rulerPolygon', () => {
  it('is null when there is no positive clearance', () => {
    expect(rulerPolygon(clearance(0))).toBeNull();
    expect(rulerPolygon(clearance(-0.1))).toBeNull();
  });
  it('is a 0.04 m wide strip along the clearance segment, coloured by band', () => {
    const r = rulerPolygon(clearance(0.5))!;
    expect(r.polygon).toHaveLength(4);
    const b = boundsOf([r.polygon]);
    expect(b.maxY - b.minY).toBeCloseTo(0.04, 12);
    expect(b.maxX - b.minX).toBeCloseTo(0.5, 12);
    expect(r.color).toBe(COLORS.ok);
    expect(rulerPolygon(clearance(0.2))!.color).toBe(COLORS.warn);
    expect(rulerPolygon(clearance(0.05))!.color).toBe(COLORS.bad);
  });
});

describe('vehiclePolygons', () => {
  it('draws the body first, then four wheels on top, then the two mirrors', () => {
    const out = vehiclePolygons(vehicle, state, true);
    const expected = [COLORS.body, COLORS.wheel, COLORS.wheel, COLORS.wheel, COLORS.wheel, COLORS.mirror, COLORS.mirror];
    expect(out).toHaveLength(expected.length);
    expected.forEach((color, i) => expect(out[i]!.color).toBe(color));
  });
  it('omits the mirrors when they are off', () => {
    const out = vehiclePolygons(vehicle, state, false);
    expect(out).toHaveLength(5);
    expect(out.map((p) => p.color)).not.toContain(COLORS.mirror);
    expect(out[0]!.color).toBe(COLORS.body);
  });
});

describe.each(['parallel', 'perpendicular', 'garage'])('scenePolygons (%s)', (id) => {
  it('puts the target fill first, then four edge strips, then one polygon per obstacle', () => {
    const def = getPreset(id)!;
    const scene = def.build(defaultParams(def));
    const out = scenePolygons(scene);
    expect(out).toHaveLength(1 + 4 + scene.obstacles.length);
    expect(out[0]!.polygon).toBe(scene.target);
    expect(out[0]!.color).toBe(COLORS.targetFill);
    for (let i = 1; i <= 4; i++) {
      expect(out[i]!.color).toBe(COLORS.targetEdge);
      expect(out[i]!.polygon).toHaveLength(4);
    }
    const kindColor = { wall: COLORS.wall, kerb: COLORS.kerb, car: COLORS.car, line: COLORS.line };
    scene.obstacles.forEach((o, i) => {
      expect(out[5 + i]!.polygon).toBe(o.polygon);
      expect(out[5 + i]!.color).toBe(kindColor[o.kind]);
    });
  });
});
