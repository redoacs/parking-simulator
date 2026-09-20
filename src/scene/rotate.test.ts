import { describe, expect, it } from 'vitest';
import { boundsOf, rect, signedArea } from '../geom/polygon';
import { rotateScene } from './rotate';
import type { Scene } from './types';

const scene: Scene = {
  bounds: { minX: -2, minY: -1, maxX: 10, maxY: 6 },
  obstacles: [
    { kind: 'car', height: 1.6, polygon: rect(6, 0, 10, 2) },
    { kind: 'kerb', height: 0.1, polygon: rect(-2, -0.3, 10, 0) },
  ],
  target: rect(0, 0, 6, 2.4),
  start: { x: 6.8, y: 4, theta: 0, steer: 0.1, speed: 0 },
};

describe('rotateScene', () => {
  it('a quarter turn counter-clockwise sends +x to +y and keeps the right side on the right', () => {
    const r = rotateScene(scene, 1);
    expect(r.start).toEqual({ x: -4, y: 6.8, theta: Math.PI / 2, steer: 0.1, speed: 0 });
    // The kerb was on the car's right (-y while heading +x); heading +y, the right is +x.
    const kerb = boundsOf([r.obstacles[1]!.polygon]);
    expect(kerb.minX).toBeGreaterThan(r.start.x);
    expect(boundsOf([r.target])).toEqual({ minX: -2.4, minY: 0, maxX: 0, maxY: 6 });
  });

  it('a quarter turn clockwise sends -x to +y', () => {
    const r = rotateScene({ ...scene, start: { ...scene.start, theta: Math.PI } }, -1);
    expect(r.start.theta).toBeCloseTo(Math.PI / 2, 12);
    expect(r.start.x).toBe(4);
    expect(r.start.y).toBe(-6.8);
  });

  it('keeps winding, area, heights and kinds, and the bounds still contain everything', () => {
    const r = rotateScene(scene, 1);
    r.obstacles.forEach((o, i) => {
      expect(signedArea(o.polygon)).toBeCloseTo(signedArea(scene.obstacles[i]!.polygon), 12);
      expect(o.kind).toBe(scene.obstacles[i]!.kind);
      expect(o.height).toBe(scene.obstacles[i]!.height);
    });
    expect(signedArea(r.target)).toBeGreaterThan(0);
    const all = boundsOf([r.target, ...r.obstacles.map((o) => o.polygon)]);
    expect(all.minX).toBeGreaterThanOrEqual(r.bounds.minX);
    expect(all.maxX).toBeLessThanOrEqual(r.bounds.maxX);
    expect(all.minY).toBeGreaterThanOrEqual(r.bounds.minY);
    expect(all.maxY).toBeLessThanOrEqual(r.bounds.maxY);
    expect(r.bounds).toEqual({ minX: -6, minY: -2, maxX: 1, maxY: 10 });
  });

  it('four quarter turns are the identity, and a turn each way cancels out', () => {
    let r = scene;
    for (let i = 0; i < 4; i++) r = rotateScene(r, 1);
    expect(r.target).toEqual(scene.target);
    expect(r.obstacles.map((o) => o.polygon)).toEqual(scene.obstacles.map((o) => o.polygon));
    expect(r.bounds).toEqual(scene.bounds);
    expect(r.start.x).toBe(scene.start.x);
    expect(r.start.y).toBe(scene.start.y);
    expect(Math.cos(r.start.theta)).toBeCloseTo(1, 12);
    const back = rotateScene(rotateScene(scene, 1), -1);
    expect(back.target).toEqual(scene.target);
    expect(back.bounds).toEqual(scene.bounds);
    expect(back.start.theta).toBe(scene.start.theta);
  });
});
