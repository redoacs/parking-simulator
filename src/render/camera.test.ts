import { describe, expect, it } from 'vitest';
import { Camera, wheelZoomFactor } from './camera';

describe('Camera', () => {
  const cam = () => {
    const c = new Camera();
    c.resize(800, 600, 1);
    c.cx = 0;
    c.cy = 0;
    c.ppm = 100;
    return c;
  };

  it('uniform maps the centre to clip origin and scales by ppm', () => {
    const u = cam().uniformData();
    // The uniform is a Float32Array, so compare against the float32-rounded ideal.
    expect(u[0]).toBeCloseTo(Math.fround((2 * 100) / 800), 12);
    expect(u[1]).toBeCloseTo(Math.fround((2 * 100) / 600), 12);
    expect(u[2]).toBeCloseTo(0, 12);
    expect(u[3]).toBeCloseTo(0, 12);
    expect(u[4]).toBe(800);
    expect(u[5]).toBe(600);
  });

  it('screenToWorld inverts the projection (y up)', () => {
    const c = cam();
    expect(c.screenToWorld(400, 300)).toEqual({ x: 0, y: 0 });
    const w = c.screenToWorld(500, 200);
    expect(w.x).toBeCloseTo(1, 12);
    expect(w.y).toBeCloseTo(1, 12);
  });

  it('zoomAtCss keeps the point under the cursor fixed', () => {
    const c = cam();
    const before = c.screenToWorld(600, 100);
    c.zoomAtCss(600, 100, 1.5);
    const after = c.screenToWorld(600, 100);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(c.ppm).toBeCloseTo(150, 12);
  });

  it('panByCss moves the centre against the drag, honouring dpr', () => {
    const c = cam();
    c.resize(1600, 1200, 2);
    c.panByCss(100, 0);
    expect(c.cx).toBeCloseTo(-2, 12);
    c.panByCss(0, 50);
    expect(c.cy).toBeCloseTo(1, 12);
  });

  it('fit frames the rect with margin', () => {
    const c = cam();
    c.fit({ minX: 0, minY: 0, maxX: 40, maxY: 10 });
    expect(c.cx).toBe(20);
    expect(c.cy).toBe(5);
    expect(c.ppm).toBeCloseTo((800 / 40) * 0.9, 12);
  });
});
describe('wheelZoomFactor', () => {
  it('scrolling up zooms in, down zooms out', () => {
    expect(wheelZoomFactor(-100, 0, 600)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, 600)).toBeLessThan(1);
  });
  it('line and page deltas are converted to pixels', () => {
    expect(wheelZoomFactor(3, 1, 600)).toBeCloseTo(wheelZoomFactor(48, 0, 600), 12);
    expect(wheelZoomFactor(1, 2, 600)).toBeCloseTo(wheelZoomFactor(600, 0, 600), 12);
  });
});
