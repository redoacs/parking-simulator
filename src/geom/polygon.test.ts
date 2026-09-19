import { describe, expect, it } from 'vitest';
import { vec } from './vec2';
import {
  rect,
  rectCentered,
  transformPolygon,
  signedArea,
  isConvex,
  boundsOf,
  pointInConvex,
  polygonInsideConvex,
  fanTriangles,
  rectFromSegment,
} from './polygon';

describe('polygon', () => {
  it('rect is CCW with positive area', () => {
    const p = rect(0, 0, 2, 1);
    expect(p).toHaveLength(4);
    expect(signedArea(p)).toBeCloseTo(2, 12);
    expect(isConvex(p)).toBe(true);
  });

  it('rectCentered matches rect', () => {
    expect(rectCentered(1, 0.5, 2, 1)).toEqual(rect(0, 0, 2, 1));
  });

  it('transformPolygon rotates then translates', () => {
    const p = transformPolygon([vec(1, 0)], { x: 10, y: 20, theta: Math.PI / 2 });
    expect(p[0]!.x).toBeCloseTo(10, 12);
    expect(p[0]!.y).toBeCloseTo(21, 12);
  });

  it('boundsOf spans all polygons', () => {
    expect(boundsOf([rect(0, 0, 1, 1), rect(5, -2, 6, 3)])).toEqual({ minX: 0, minY: -2, maxX: 6, maxY: 3 });
  });

  it('pointInConvex', () => {
    const p = rect(0, 0, 2, 2);
    expect(pointInConvex(vec(1, 1), p)).toBe(true);
    expect(pointInConvex(vec(3, 1), p)).toBe(false);
    expect(pointInConvex(vec(2, 1), p)).toBe(true); // boundary counts as inside
  });

  it('polygonInsideConvex', () => {
    const outer = rect(0, 0, 6, 3);
    expect(polygonInsideConvex(rect(1, 1, 5, 2), outer)).toBe(true);
    expect(polygonInsideConvex(rect(1, 1, 7, 2), outer)).toBe(false);
  });

  it('fanTriangles of a quad gives two triangles', () => {
    const t = fanTriangles(rect(0, 0, 1, 1));
    expect(t).toHaveLength(6);
    expect(t[0]).toEqual(vec(0, 0));
    expect(t[3]).toEqual(vec(0, 0));
  });

  it('rectFromSegment builds a CCW strip of the given width', () => {
    const s = rectFromSegment(vec(0, 0), vec(4, 0), 0.2);
    expect(signedArea(s)).toBeCloseTo(0.8, 12);
    expect(boundsOf([s])).toEqual({ minX: 0, minY: -0.1, maxX: 4, maxY: 0.1 });
  });

  it('isConvex rejects a concave polygon', () => {
    expect(isConvex([vec(0, 0), vec(2, 0), vec(1, 0.5), vec(2, 2), vec(0, 2)])).toBe(false);
  });
});
