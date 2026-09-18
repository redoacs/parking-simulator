import { describe, expect, it } from 'vitest';
import { vec } from './vec2';
import { rect } from './polygon';
import { closestPointOnSegment, segmentDistance, convexPenetration, polygonDistance } from './distance';

describe('closestPointOnSegment', () => {
  it('clamps to endpoints', () => {
    expect(closestPointOnSegment(vec(-1, 1), vec(0, 0), vec(2, 0))).toEqual(vec(0, 0));
    expect(closestPointOnSegment(vec(3, 1), vec(0, 0), vec(2, 0))).toEqual(vec(2, 0));
  });
  it('projects onto the interior', () => {
    expect(closestPointOnSegment(vec(1, 1), vec(0, 0), vec(2, 0))).toEqual(vec(1, 0));
  });
});

describe('segmentDistance', () => {
  it('parallel segments', () => {
    const r = segmentDistance(vec(0, 0), vec(2, 0), vec(0, 1), vec(2, 1));
    expect(r.d).toBeCloseTo(1, 12);
  });
  it('crossing segments give 0', () => {
    expect(segmentDistance(vec(0, 0), vec(2, 2), vec(0, 2), vec(2, 0)).d).toBeCloseTo(0, 12);
  });
  it('endpoint to endpoint', () => {
    const r = segmentDistance(vec(0, 0), vec(1, 0), vec(2, 1), vec(3, 1));
    expect(r.d).toBeCloseTo(Math.SQRT2, 12);
    expect(r.pa).toEqual(vec(1, 0));
    expect(r.pb).toEqual(vec(2, 1));
  });
});

describe('convexPenetration', () => {
  it('is 0 for separated squares', () => {
    expect(convexPenetration(rect(0, 0, 1, 1), rect(1.5, 0, 2.5, 1))).toBe(0);
  });
  it('is 0 for touching squares', () => {
    expect(convexPenetration(rect(0, 0, 1, 1), rect(1, 0, 2, 1))).toBeCloseTo(0, 12);
  });
  it('is the overlap depth', () => {
    expect(convexPenetration(rect(0, 0, 1, 1), rect(0.8, 0, 1.8, 1))).toBeCloseTo(0.2, 12);
    expect(convexPenetration(rect(0, 0, 1, 1), rect(0.3, 0.9, 0.6, 1.9))).toBeCloseTo(0.1, 12);
  });
});

describe('polygonDistance', () => {
  it('positive gap with closest points', () => {
    const r = polygonDistance(rect(0, 0, 1, 1), rect(1.5, 0.25, 2.5, 0.75));
    expect(r.distance).toBeCloseTo(0.5, 12);
    expect(r.pa.x).toBeCloseTo(1, 12);
    expect(r.pb.x).toBeCloseTo(1.5, 12);
  });
  it('diagonal gap', () => {
    const r = polygonDistance(rect(0, 0, 1, 1), rect(2, 2, 3, 3));
    expect(r.distance).toBeCloseTo(Math.SQRT2, 12);
  });
  it('touching is 0', () => {
    expect(polygonDistance(rect(0, 0, 1, 1), rect(1, 0, 2, 1)).distance).toBeCloseTo(0, 12);
  });
  it('overlap is negative depth', () => {
    expect(polygonDistance(rect(0, 0, 1, 1), rect(0.8, 0, 1.8, 1)).distance).toBeCloseTo(-0.2, 12);
  });
  it('containment is negative', () => {
    expect(polygonDistance(rect(0, 0, 4, 4), rect(1, 1, 2, 2)).distance).toBeLessThan(0);
  });
});
